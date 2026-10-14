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
const { closeSqlite } = await import('../db/client')
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
