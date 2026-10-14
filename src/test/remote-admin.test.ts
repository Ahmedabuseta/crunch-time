// Phase 5 — full admin API parity. Drives a whole POS run over HTTP alone
// (open shift → create product → take order → refund → close shift → Z report →
// backup) and checks that mutations land in the audit log. Also confirms the
// read-heavy admin surface (reports, catalogue, settings) works with no desktop
// session, i.e. purely from the server.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'remote-admin-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const PORT = 45220
const { createBackend } = await import('../backend')
const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { applyRemoteServer, stopRemoteServer } = await import('../server')

type Backend = ReturnType<typeof createBackend>
let backend: Backend
let token = ''

const base = `http://127.0.0.1:${PORT}`

const api = (pathname: string, init: RequestInit = {}) =>
  fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  })

const json = async (r: Response) => r.json() as Promise<any>

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

  const admin = getSqlite().prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: string }
  backend.session.setUser({ id: admin.id, role: 'admin' })
  await backend.settings.setRemotePin('1234')
  backend.settings.setRemoteConfig({ enabled: true, port: PORT })
  await applyRemoteServer(backend)

  // Clear any desktop session: everything below must work server-side only.
  backend.session.clearUser()
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  })
  token = (await login.json()).token
})

afterAll(async () => {
  await stopRemoteServer()
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('admin API parity over HTTP', () => {
  let categoryId = ''
  let productId = ''
  let orderId = ''

  it("opens a shift through the API", async () => {
    const res = await api('/shifts/open', { method: 'POST', body: JSON.stringify({ openingCash: 100 }) })
    expect(res.status).toBe(200)
    expect((await json(res)).ok).toBe(true)
  })

  it('creates a category and a product, and the menu reflects them', async () => {
    const cat = await json(await api('/categories', { method: 'POST', body: JSON.stringify({ name: 'قسم اختبار', emoji: '🧪', color: '#123456' }) }))
    expect(typeof cat.id).toBe('string')
    categoryId = cat.id

    const prod = await json(await api('/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'صنف اختبار', price: 50, categoryId, emoji: '🍔', description: 'وصف' }),
    }))
    expect(typeof prod.id).toBe('string')
    productId = prod.id

    const menu = await json(await api('/menu'))
    expect(menu.products.some((p: any) => p.id === productId)).toBe(true)
  })

  it('takes an order, then refunds it', async () => {
    const created = await json(await api('/orders', {
      method: 'POST',
      body: JSON.stringify({
        orderType: 'takeaway', paymentType: 'cash',
        subtotal: 50, tax: 0, deliveryFee: 0, total: 50,
        items: [{ productId, quantity: 1, unitPrice: 50 }],
      }),
    }))
    expect(created.ok).toBe(true)
    orderId = created.id

    const refund = await api(`/orders/${orderId}/refund`, { method: 'POST', body: JSON.stringify({ reason: 'اختبار الاسترداد' }) })
    expect(refund.status).toBe(200)
  })

  it('creates a user, expense, discount code and delivery profile', async () => {
    expect((await api('/users', { method: 'POST', body: JSON.stringify({ name: 'كاشير جديد', pin: '4321', role: 'cashier' }) })).status).toBe(200)
    expect((await api('/expenses', { method: 'POST', body: JSON.stringify({ name: 'كهرباء', category: 'مرافق', amount: 100, type: 'monthly' }) })).status).toBe(200)
    expect((await api('/discount-codes', { method: 'POST', body: JSON.stringify({ code: 'TEST10', type: 'percentage', value: 10 }) })).status).toBe(200)
    expect((await api('/delivery-profiles', { method: 'POST', body: JSON.stringify({ name: 'سائق' }) })).status).toBe(200)
    expect((await json(await api('/expenses'))).expenses.length).toBeGreaterThan(0)
  })

  it('updates settings and a kitchen station', async () => {
    expect((await api('/settings', { method: 'PUT', body: JSON.stringify({ taxRate: 0.15 }) })).status).toBe(200)
    const station = await api('/stations', { method: 'POST', body: JSON.stringify({ name: 'محطة اختبار', paperWidth: '80mm' }) })
    expect(station.status).toBe(200)
  })

  it('returns every report without a desktop session', async () => {
    const paths = [
      '/reports/daily', '/reports/period', '/reports/profit', '/reports/hourly',
      '/reports/top-items', '/reports/category-revenue', '/reports/addon-stats',
      '/reports/ticket-distribution', '/reports/order-type-split', '/reports/shift-summary',
      '/reports/labor', '/reports/voids', '/reports/driver-summary', '/reports/revenue-trend',
      '/reports/inventory-alerts', '/reports/payment-methods', '/reports/discounts',
      '/reports/abc-xyz', '/reports/inventory-turnover', '/reports/purchase-price-variance',
      '/reports/sales-trend', '/reports/days-on-hand',
    ]
    for (const p of paths) {
      const res = await api(p)
      expect(res.status, p).toBe(200)
    }
  })

  it('returns the Z report and closes the shift', async () => {
    const z = await api('/reports/z')
    expect(z.status).toBe(200)
    const shiftId = (await json(z)).report.shiftId
    expect((await api('/shifts/close', { method: 'POST', body: JSON.stringify({ id: shiftId, closingCash: 120 }) })).status).toBe(200)
  })

  it('records audit rows for each mutation', async () => {
    const entries = (await json(await api('/audit?limit=500'))).entries as any[]
    const actions = new Set(entries.map((e) => e.action))
    for (const expected of [
      'category.create', 'product.create', 'order.refund', 'user.create',
      'expense.create', 'discountCode.create', 'deliveryProfile.create',
      'settings.update', 'shift.close',
    ]) {
      expect(actions.has(expected), `missing audit action ${expected}`).toBe(true)
    }
    // Every entry carries a device label from the request.
    expect(entries.every((e) => e.deviceLabel)).toBe(true)
  })

  it('triggers a backup and reports its status', async () => {
    expect((await api('/backup', { method: 'POST', body: '{}' })).status).toBe(200)
    const status = await json(await api('/backup/status'))
    expect(status.status.backupCount).toBeGreaterThan(0)
  })

  it('downloads a fresh database snapshot', async () => {
    const res = await api('/backup/download')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/octet-stream')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
  })

  it('exports a table as CSV', async () => {
    const res = await api('/export/csv', { method: 'POST', body: JSON.stringify({ name: 'products', rows: [['a', 'b'], ['1', '2']] }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(await res.text()).toContain('1,2')
  })

  it('turns a backend validation error into a clean 400', async () => {
    // A product with no category violates the FK → backend throws → 400 + Arabic message.
    const res = await api('/products', { method: 'POST', body: JSON.stringify({ name: 'بلا قسم', price: 10 }) })
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.ok).toBe(false)
    expect(typeof body.error).toBe('string')
  })

  it('requires a token for admin routes', async () => {
    const res = await fetch(`${base}/categories`)
    expect(res.status).toBe(401)
  })
})
