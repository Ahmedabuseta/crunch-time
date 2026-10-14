// Remote POS order flow — drives the real Fastify server over HTTP against a
// throwaway database: create (with idempotency), inventory deduction, printing,
// status change / driver assignment, and live event fan-out (phone WS + desktop
// notifier).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'

const tempDir = mkdtempSync(path.join(tmpdir(), 'remote-orders-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const PORT = 45218
const { createBackend } = await import('../backend')
const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { applyRemoteServer, stopRemoteServer, setDesktopNotifier } = await import('../server')

type Backend = ReturnType<typeof createBackend>
let backend: Backend
let token = ''
let productId = ''
let productPrice = 0
const printCalls: any[] = []
const desktopEvents: { channel: string; payload: unknown }[] = []

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

const newOrderBody = (over: Record<string, any> = {}) => ({
  orderType: 'takeaway',
  paymentType: 'cash',
  subtotal: productPrice,
  tax: 0,
  deliveryFee: 0,
  total: productPrice,
  items: [{ productId, quantity: 1, unitPrice: productPrice }],
  ...over,
})

const orderCount = () =>
  (getSqlite().prepare('SELECT COUNT(*) AS c FROM orders').get() as { c: number }).c

beforeAll(async () => {
  runMigrations()
  await seedDatabase()

  setDesktopNotifier((channel, payload) => desktopEvents.push({ channel, payload }))

  backend = createBackend({
    print: async (_html: string, deviceName?: string | null) => {
      printCalls.push({ deviceName: deviceName ?? null })
      return { ok: true }
    },
    listPrinters: async () => [{ name: 'Test Printer', isDefault: true }],
    dialogs: {
      showSaveDialog: async () => ({ canceled: true }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    },
    app: { getPath: () => tempDir, relaunch: () => {}, exit: () => {} },
  })

  const admin = getSqlite().prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: string }
  backend.session.setUser({ id: admin.id, role: 'admin' })
  backend.shifts.openShift({ userId: admin.id, openingCash: 0 })

  const p = getSqlite().prepare('SELECT id, price FROM products WHERE active = 1 LIMIT 1').get() as { id: string; price: number }
  productId = p.id
  productPrice = p.price

  await backend.settings.setRemotePin('1234')
  backend.settings.setRemoteConfig({ enabled: true, port: PORT })
  const started = await applyRemoteServer(backend)
  expect(started.ok).toBe(true)

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

describe('remote orders', () => {
  it('creates an order, deducts inventory and prints', async () => {
    printCalls.length = 0
    const before = orderCount()
    const res = await api('/orders', {
      method: 'POST',
      headers: { 'idempotency-key': 'test-key-1', 'x-device-label': 'iPhone' },
      body: JSON.stringify(newOrderBody()),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.id).toBe('string')
    expect(orderCount()).toBe(before + 1)

    // The cashier label defaults to the device label sent by the phone.
    expect(body.order.cashierName).toBe('iPhone')

    // Inventory was consumed for this order.
    const consumed = getSqlite()
      .prepare("SELECT COUNT(*) AS c FROM inventory_transactions WHERE reference_order_id = ? AND type = 'CONSUMPTION'")
      .get(body.id) as { c: number }
    expect(consumed.c).toBeGreaterThan(0)

    // The receipt was sent to a printer.
    expect(printCalls.length).toBeGreaterThan(0)
  })

  it('does not create a second sale for a repeated idempotency key', async () => {
    const before = orderCount()
    const res = await api('/orders', {
      method: 'POST',
      headers: { 'idempotency-key': 'test-key-1' },
      body: JSON.stringify(newOrderBody()),
    })
    const body = await res.json()
    expect(body.idempotent).toBe(true)
    expect(orderCount()).toBe(before)
  })

  it('lists orders and reads one back', async () => {
    const list = await (await api('/orders?status=COMPLETED')).json()
    expect(Array.isArray(list.orders)).toBe(true)
    expect(list.orders.length).toBeGreaterThan(0)
    const first = list.orders[0]
    const one = await (await api(`/orders/${first.id}`)).json()
    expect(one.order.id).toBe(first.id)
    expect(Array.isArray(one.order.items)).toBe(true)
  })

  it('rejects a bad order type and an empty order', async () => {
    expect((await api('/orders', { method: 'POST', body: JSON.stringify(newOrderBody({ orderType: 'x' })) })).status).toBe(400)
    expect((await api('/orders', { method: 'POST', body: JSON.stringify(newOrderBody({ items: [] })) })).status).toBe(400)
  })

  it('cancels an order (admin-gated backend fn runs as owner) and emits an event', async () => {
    const created = await (await api('/orders', { method: 'POST', body: JSON.stringify(newOrderBody()) })).json()
    desktopEvents.length = 0
    const res = await api(`/orders/${created.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELLED', reason: 'اختبار' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    const row = getSqlite().prepare('SELECT status FROM orders WHERE id = ?').get(created.id) as { status: string }
    expect(row.status).toBe('CANCELLED')
    expect(desktopEvents.some((e) => e.channel === 'order:updated')).toBe(true)
  })

  it('requires a reason when cancelling', async () => {
    const created = await (await api('/orders', { method: 'POST', body: JSON.stringify(newOrderBody()) })).json()
    const res = await api(`/orders/${created.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELLED' }),
    })
    expect(res.status).toBe(400)
  })

  it('assigns a driver to a delivery order', async () => {
    getSqlite().prepare("INSERT INTO delivery_profiles (id, name, phone, active) VALUES ('drv-test', 'سامي', '0100', 1)").run()
    const created = await (await api('/orders', { method: 'POST', body: JSON.stringify(newOrderBody({ orderType: 'delivery', deliveryProfileId: 'drv-test' })) })).json()
    const res = await api(`/orders/${created.id}/assign-driver`, {
      method: 'POST',
      body: JSON.stringify({ profileId: 'drv-test' }),
    })
    expect(res.status).toBe(200)
    const row = getSqlite().prepare('SELECT driver_status, delivery_profile_name FROM orders WHERE id = ?').get(created.id) as any
    expect(row.driver_status).toBe('assigned')
  })

  it('pushes order events to a connected phone over WebSocket', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}`)
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    })
    const firstEvent = new Promise<any>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(String(data))))
    })
    await api('/orders', { method: 'POST', body: JSON.stringify(newOrderBody()) })
    const msg = await firstEvent
    expect(msg.channel).toBe('order:created')
    ws.close()
  })

  it('refuses a WebSocket with no token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`)
    const failed = await new Promise<boolean>((resolve) => {
      ws.once('error', () => resolve(true))
      ws.once('open', () => resolve(false))
    })
    expect(failed).toBe(true)
  })
})
