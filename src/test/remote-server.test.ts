// Remote POS server — drives the real Fastify server over HTTP against a
// throwaway database, exercising the Phase 2 checkpoint: PIN login, token
// auth on read-only routes, wrong-PIN rate limiting, and PIN-change logout.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'remote-server-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const PORT = 45217
const {
  createBackend,
} = await import('../backend')
const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { applyRemoteServer, stopRemoteServer, getRemoteStatus } = await import('../server')
const { signToken, verifyToken } = await import('../server/tokens')

type Backend = Awaited<ReturnType<typeof createBackend>>
let backend: Backend

const base = `http://127.0.0.1:${PORT}`

const login = (pin: string) =>
  fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin }),
  })

const authed = (pathname: string, token?: string) =>
  fetch(`${base}${pathname}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

beforeAll(async () => {
  runMigrations()
  await seedDatabase()

  backend = createBackend({
    print: async () => ({ ok: true }),
    listPrinters: async () => [{ name: 'Test Printer', isDefault: true }],
    dialogs: {
      showSaveDialog: async () => ({ canceled: true }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    },
    app: { getPath: () => tempDir, relaunch: () => {}, exit: () => {} },
  })

  // The settings writers are admin-gated; the server itself is not.
  backend.session.setUser({ id: 'test-admin', role: 'admin' })
  await backend.settings.setRemotePin('1234')
  const res = backend.settings.setRemoteConfig({ enabled: true, port: PORT })
  expect(res.ok).toBe(true)
  const started = await applyRemoteServer(backend)
  expect(started.ok).toBe(true)
})

afterAll(async () => {
  await stopRemoteServer()
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('remote server: login + read-only routes', () => {
  it('/health is reachable without a token', async () => {
    const res = await fetch(`${base}/health`)
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('rejects a read-only route without a token', async () => {
    const res = await authed('/menu')
    expect(res.status).toBe(401)
  })

  it('logs in with the PIN and browses the menu', async () => {
    const res = await login('1234')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.token).toBe('string')

    const menu = await authed('/menu', body.token)
    expect(menu.status).toBe(200)
    const payload = await menu.json()
    expect(Array.isArray(payload.categories)).toBe(true)
    expect(Array.isArray(payload.products)).toBe(true)
    // The seed ships a real menu, so both should be populated.
    expect(payload.categories.length).toBeGreaterThan(0)
    expect(payload.products.length).toBeGreaterThan(0)
  })

  it('rejects a wrong PIN', async () => {
    const res = await login('0000')
    expect(res.status).toBe(401)
  })

  it('serves the other read-only endpoints once authed', async () => {
    const token = (await (await login('1234')).json()).token
    for (const pathname of ['/delivery-zones', '/stations', '/printers', '/customers/search?q=010']) {
      const res = await authed(pathname, token)
      expect(res.status, pathname).toBe(200)
    }
  })
})

describe('remote server: PIN change revokes tokens', () => {
  it('logs every phone out when the PIN changes', async () => {
    const token = (await (await login('1234')).json()).token
    expect((await authed('/menu', token)).status).toBe(200)

    // Rotating the PIN rotates the signing secret → the old token is dead.
    const changed = await backend.settings.setRemotePin('5678')
    expect(changed.ok).toBe(true)
    expect((await authed('/menu', token)).status).toBe(401)

    // The new PIN works and issues a fresh, valid token.
    const relogin = await login('5678')
    expect(relogin.status).toBe(200)
    const fresh = (await relogin.json()).token
    expect((await authed('/menu', fresh)).status).toBe(200)
  })
})

describe('remote server: pairing (QR)', () => {
  it('exchanges a one-time code for a session, then burns it', async () => {
    backend.session.setUser({ id: 'test-admin', role: 'admin' })
    const created = backend.settings.createRemotePairCode()
    expect(created.ok).toBe(true)
    const code = (created as { code: string }).code

    const first = await fetch(`${base}/auth/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(first.status).toBe(200)
    const token = (await first.json()).token
    expect(typeof token).toBe('string')

    // The token it handed back is a real session.
    expect((await authed('/menu', token)).status).toBe(200)

    // Single use: the same code can never be replayed.
    const second = await fetch(`${base}/auth/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(second.status).toBe(401)
  })

  it('rejects a code that was never issued', async () => {
    const res = await fetch(`${base}/auth/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '000000' }),
    })
    expect(res.status).toBe(401)
  })

  it('refuses to issue a code until a PIN exists', async () => {
    backend.session.setUser({ id: 'test-admin', role: 'admin' })
    getSqlite().prepare("UPDATE settings SET remote_pin_hash = NULL WHERE id = 'settings'").run()
    try {
      expect(backend.settings.createRemotePairCode().ok).toBe(false)
    } finally {
      await backend.settings.setRemotePin('1234')
    }
  })
})

describe('remote server: rate limiting (runs last — it locks the test IP)', () => {
  it('locks the caller out after too many wrong PINs', async () => {
    let sawLock = false
    for (let i = 0; i < 10; i++) {
      const res = await login('9999')
      if (res.status === 429) {
        sawLock = true
        expect((await res.json()).retryAfter).toBeGreaterThan(0)
        break
      }
    }
    expect(sawLock).toBe(true)
  })
})

describe('remote server: status reporting', () => {
  it('reports running + addresses while enabled', () => {
    const status = getRemoteStatus()
    expect(status.enabled).toBe(true)
    expect(status.running).toBe(true)
    expect(status.port).toBe(PORT)
    expect(status.hasPin).toBe(true)
  })
})

describe('remote server: public QR menu', () => {
  it('serves the live menu and the menu page without a token', async () => {
    const res = await fetch(`${base}/public/menu`)
    expect(res.status).toBe(200)
    // The Vercel menu reads this cross-origin.
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const body = await res.json()
    expect(typeof body.restaurant).toBe('string')
    expect(Array.isArray(body.categories)).toBe(true)

    const products = body.categories.flatMap((category: any) => category.products)
    expect(products.length).toBeGreaterThan(0)
    // Public payload never carries cost or the internal active flag.
    expect(products.every((product: any) => !('costPrice' in product) && !('active' in product))).toBe(true)

    const page = await fetch(`${base}/m`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toContain('text/html')
    expect(await page.text()).toContain('المنيو')
  })

  it('reflects catalogue edits without any export step', async () => {
    const category = (await backend.catalog.listCategories())[0]
    const created = await backend.catalog.createProduct({
      name: 'صنف متابعة المنيو',
      description: 'اختبار',
      price: 12.5,
      categoryId: category.id,
      emoji: '🧪',
    })

    const readPrice = async () => {
      const body = await (await fetch(`${base}/public/menu`)).json()
      return body.categories.flatMap((c: any) => c.products).find((p: any) => p.id === created.id)?.price
    }

    expect(await readPrice()).toBe(12.5)
    await backend.catalog.updateProduct(created.id, { price: 19.75 })
    expect(await readPrice()).toBe(19.75)

    // Deactivating it hides it from the public menu immediately.
    await backend.catalog.updateProduct(created.id, { active: false })
    expect(await readPrice()).toBeUndefined()
  })
})

describe('remote server: owner reads while a cashier is on the desktop', () => {
  it('keeps answering the phone with no admin session on the PC', async () => {
    // A real phone token, issued from the remote secret — the login limiter is
    // intentionally exhausted by an earlier test.
    const secret = backend.settings.getRemoteConfig().secret
    if (!secret) throw new Error('remote secret missing')
    const token = signToken(secret)
    backend.session.setUser({ id: 'cashier-1', role: 'cashier' })
    try {
      const paths = [
        '/menu',
        '/orders',
        '/delivery-zones',
        '/delivery-profiles',
        '/shifts/current',
        '/reports/daily',
        '/reports/period',
        '/reports/profit',
        '/reports/top-items',
        '/reports/inventory-alerts',
        '/inventory/alerts',
        '/ingredients',
        '/categories',
        '/products',
        '/addons',
        '/modifier-groups',
        '/sub-recipes',
        '/settings',
        '/users',
        '/audit',
        '/backup/status',
      ]
      for (const pathname of paths) {
        const res = await authed(pathname, token)
        expect(res.status, `${pathname}: ${await res.clone().text()}`).toBe(200)
      }

      // The phone loads many endpoints at once; every request keeps its own
      // owner scope and none may fail because another request finished.
      const burst = await Promise.all(
        Array.from({ length: 16 }, () => authed('/reports/daily', token)),
      )
      expect(burst.every((res) => res.status === 200)).toBe(true)

      // The desktop session was never elevated.
      expect(backend.session.getUser()).toEqual({ id: 'cashier-1', role: 'cashier' })
    } finally {
      backend.session.setUser({ id: 'test-admin', role: 'admin' })
    }
  })
})

describe('tokens', () => {
  it('round-trips a valid token and rejects tampering/expiry', () => {
    const t = signToken('secret-a')
    expect(verifyToken(t, 'secret-a')).not.toBeNull()
    expect(verifyToken(t, 'secret-b')).toBeNull() // different secret (PIN changed)
    expect(verifyToken(t + 'x', 'secret-a')).toBeNull() // tampered signature
    expect(verifyToken('', 'secret-a')).toBeNull()
    // Expired: issued 40 days ago with a 30-day TTL.
    const old = signToken('secret-a', undefined, Date.now() - 40 * 24 * 60 * 60 * 1000)
    expect(verifyToken(old, 'secret-a')).toBeNull()
  })
})
