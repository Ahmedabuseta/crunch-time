// Remote POS money flow — refunds, cash drawer, shifts, the Z report and the
// audit log that each of them writes.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'remote-money-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const PORT = 45219
const { createBackend } = await import('../backend')
const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { applyRemoteServer, stopRemoteServer } = await import('../server')
const { withDeviceLabel } = await import('../backend/audit')

type Backend = ReturnType<typeof createBackend>
let backend: Backend
let token = ''
let shiftId = ''
let productId = ''
let productPrice = 0

const base = `http://127.0.0.1:${PORT}`

const api = (pathname: string, init: RequestInit = {}) =>
  fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-device-label': 'Cash Phone',
      ...(init.headers || {}),
    },
  })

const newOrderBody = (over: Record<string, any> = {}) => ({
  orderType: 'takeaway',
  paymentType: 'cash',
  subtotal: productPrice, tax: 0, deliveryFee: 0, total: productPrice,
  items: [{ productId, quantity: 1, unitPrice: productPrice }],
  ...over,
})

const auditRows = (action?: string) =>
  (action
    ? getSqlite().prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY created_at').all(action)
    : getSqlite().prepare('SELECT * FROM audit_log ORDER BY created_at').all()) as any[]

const last = (rows: any[]) => rows[rows.length - 1]

const createOrder = async (over: Record<string, any> = {}) =>
  (await (await api('/orders', { method: 'POST', body: JSON.stringify(newOrderBody(over)) })).json()).id as string

beforeAll(async () => {
  runMigrations()
  await seedDatabase()

  backend = createBackend({
    print: async () => ({ ok: true }),
    listPrinters: async () => [{ name: 'Test Printer' }],
    dialogs: {
      showSaveDialog: async () => ({ canceled: true }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    },
    app: { getPath: () => tempDir, relaunch: () => {}, exit: () => {} },
  })

  const admin = getSqlite().prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: string }
  backend.session.setUser({ id: admin.id, role: 'admin' })
  shiftId = (backend.shifts.openShift({ userId: admin.id, openingCash: 100 }) as { id: string }).id

  const p = getSqlite().prepare('SELECT id, price FROM products WHERE active = 1 LIMIT 1').get() as { id: string; price: number }
  productId = p.id
  productPrice = p.price

  await backend.settings.setRemotePin('1234')
  backend.settings.setRemoteConfig({ enabled: true, port: PORT })
  await applyRemoteServer(backend)

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

describe('refunds', () => {
  it('refunds an order and writes an audit row with the device label', async () => {
    const id = await createOrder()
    const res = await api(`/orders/${id}/refund`, { method: 'POST', body: JSON.stringify({ reason: 'العميل غير راضي' }) })
    expect(res.status).toBe(200)

    const order = getSqlite().prepare('SELECT status, status_reason FROM orders WHERE id = ?').get(id) as any
    expect(order.status).toBe('REFUNDED')
    expect(order.status_reason).toBe('العميل غير راضي')

    const row = last(auditRows('order.refund'))
    expect(row).toBeTruthy()
    expect(row.entity_id).toBe(id)
    expect(row.device_label).toBe('Cash Phone')
    expect(JSON.parse(row.after).reason).toBe('العميل غير راضي')
  })

  it('requires a reason', async () => {
    const id = await createOrder()
    const res = await api(`/orders/${id}/refund`, { method: 'POST', body: JSON.stringify({}) })
    expect(res.status).toBe(400)
  })

  it('accepts an optional correct PIN and rejects a wrong one', async () => {
    const id = await createOrder()
    expect((await api(`/orders/${id}/refund`, { method: 'POST', body: JSON.stringify({ reason: 'x', pin: '0000' }) })).status).toBe(401)
    expect((await api(`/orders/${id}/refund`, { method: 'POST', body: JSON.stringify({ reason: 'x', pin: '1234' }) })).status).toBe(200)
  })
})

describe('cash drawer', () => {
  it('records a movement and audits it', async () => {
    const res = await api('/cash-drawer/movements', {
      method: 'POST',
      body: JSON.stringify({ shiftId, type: 'CASH_IN', amount: 50, note: 'إضافة نقدية' }),
    })
    expect(res.status).toBe(200)
    const row = last(auditRows('cash.movement'))
    expect(row).toBeTruthy()
    expect(JSON.parse(row.after).amount).toBe(50)
  })

  it('reconciles the shift', async () => {
    const res = await api('/cash-drawer/reconcile', { method: 'POST', body: JSON.stringify({ shiftId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.reconciliation.expected).toBe('number')
  })
})

describe('settings changes are audited', () => {
  it('writes a settings.update audit row', async () => {
    backend.session.setUser({ id: 'admin-test', role: 'admin' })
    const before = auditRows('settings.update').length
    withDeviceLabel('Cash Phone', () => backend.settings.updateSettings({ taxRate: 0.15 }))
    const rows = auditRows('settings.update')
    expect(rows.length).toBe(before + 1)
    expect(JSON.parse(last(rows).after).taxRate).toBe(0.15)
  })
})

describe('Z report + shift close', () => {
  it('returns the Z report for the open shift', async () => {
    // No desktop session — the report is admin-gated and must run under the
    // owner identity the server lends it, exactly as it does in production.
    backend.session.clearUser()
    await createOrder()
    const res = await api('/reports/z')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.report.shiftId).toBe(shiftId)
    expect(body.report.orderCount).toBeGreaterThan(0)
  })

  it('closes the shift and audits it', async () => {
    const res = await api('/shifts/close', { method: 'POST', body: JSON.stringify({ id: shiftId, closingCash: 150 }) })
    expect(res.status).toBe(200)
    const row = last(auditRows('shift.close'))
    expect(row).toBeTruthy()
    expect(row.entity_id).toBe(shiftId)
    const shift = getSqlite().prepare('SELECT status, closing_cash FROM shifts WHERE id = ?').get(shiftId) as any
    expect(shift.status).toBe('closed')
  })

  it('still returns the Z report when addressed by shift id after close', async () => {
    const res = await api(`/reports/z?shiftId=${shiftId}`)
    expect(res.status).toBe(200)
    expect((await res.json()).report.shiftId).toBe(shiftId)
  })
})
