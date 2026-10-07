// Delivery driver workflow — drives the REAL IPC handlers (src/ipc/main.ts)
// through a mocked ipcMain against a throwaway database.
//
// Covered: state derivation at creation, assignDriver's refusal rules,
// the today-only unassigned badge count, and the report-only settlement math.
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'delivery-flow-test-'))
const handlers = new Map<string, (e: any, ...args: any[]) => any>()

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) },
  BrowserWindow: class MockWindow {},
}))

const { registerIpcHandlers } = await import('../ipc/main')
const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')

const call = async (channel: string, ...args: any[]) => {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler: ${channel}`)
  return fn({}, ...args)
}

const day = (offset = 0) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

let productId = ''
let adminId = ''
let cashierId = ''

const orderState = (id: string) =>
  getSqlite().prepare(
    'SELECT driver_status AS ds, status FROM orders WHERE id = ?',
  ).get(id) as { ds: string | null; status: string }

const createOrder = (over: Record<string, any> = {}) =>
  call('order:create', {
    orderType: 'delivery',
    subtotal: 100,
    tax: 0,
    deliveryFee: 0,
    total: 114,
    paymentType: 'cash',
    items: [{ productId, quantity: 1, unitPrice: 100 }],
    ...over,
  }) as Promise<{ id: string }>

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  registerIpcHandlers()

  const sqlite = getSqlite()
  productId = (sqlite.prepare('SELECT id FROM products LIMIT 1').get() as any).id
  const users = sqlite.prepare('SELECT id, role FROM users').all() as any[]
  adminId = users.find((u) => u.role === 'admin').id
  cashierId = users.find((u) => u.role === 'cashier').id

  sqlite
    .prepare(
      `INSERT INTO delivery_profiles (id, name, phone, active) VALUES
        ('drv-a', 'سامي', '0100000000', 1),
        ('drv-b', 'كريم', '0110000000', 1),
        ('drv-off', 'مازن', '0120000000', 0)`,
    )
    .run()

  await call('session:setUser', { id: adminId, role: 'admin' })
  await call('shift:open', { userId: adminId, openingCash: 0 })
})

afterAll(() => {
  // Windows locks open files — close the connection before
  // the recursive delete or rmSync throws EPERM.
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('driver status derivation', () => {
  it('marks delivery orders unassigned/assigned and leaves others alone', async () => {
    const noDriver = await createOrder()
    expect(orderState(noDriver.id)).toEqual({ ds: 'unassigned', status: 'COMPLETED' })

    const withDriver = await createOrder({
      deliveryProfileId: 'drv-a',
      deliveryProfileName: 'سامي',
    })
    expect(orderState(withDriver.id).ds).toBe('assigned')

    const dineIn = await createOrder({ orderType: 'dine-in' })
    expect(orderState(dineIn.id).ds).toBeNull()
  })
})

describe('order:assignDriver', () => {
  it('lets a cashier assign — no admin gate on the delivery desk', async () => {
    await call('session:setUser', { id: cashierId, role: 'cashier' })
    const order = await createOrder()

    const result = await call('order:assignDriver', order.id, 'drv-b')
    expect(result).toEqual({ ok: true, receiptReady: true })

    const sqlite = getSqlite()
    const row = sqlite
      .prepare(
        'SELECT delivery_profile_id AS pid, delivery_profile_name AS pname, driver_status AS ds FROM orders WHERE id = ?',
      )
      .get(order.id)
    expect(row).toEqual({ pid: 'drv-b', pname: 'كريم', ds: 'assigned' })
  })

  it('refuses bad targets: missing order, non-delivery, bad driver, cancelled', async () => {
    expect((await call('order:assignDriver', 'nope', 'drv-a')).ok).toBe(false)

    const dineIn = await createOrder({ orderType: 'dine-in' })
    const notDelivery = await call('order:assignDriver', dineIn.id, 'drv-a')
    expect(notDelivery.ok).toBe(false)
    expect(notDelivery.error).toContain('التوصيل')

    const order = await createOrder()
    const ghost = await call('order:assignDriver', order.id, 'ghost')
    expect(ghost.ok).toBe(false)

    const inactive = await call('order:assignDriver', order.id, 'drv-off')
    expect(inactive.ok).toBe(false)
    expect(inactive.error).toContain('معطل')

    // Cancelling needs the admin session, assigning after it still doesn't.
    await call('session:setUser', { id: adminId, role: 'admin' })
    const cancelled = await createOrder()
    await call('order:updateStatus', cancelled.id, 'CANCELLED', 'العميل لغي')
    await call('session:setUser', { id: cashierId, role: 'cashier' })
    const refused = await call('order:assignDriver', cancelled.id, 'drv-a')
    expect(refused.ok).toBe(false)
    expect(refused.error).toContain('ملغى أو مسترد')
    expect(orderState(cancelled.id).ds).toBe('unassigned')
  })
})

describe('order:unassignedCount (top-tab badge)', () => {
  it('counts only today, only delivery, only unresolved', async () => {
    const sqlite = getSqlite()
    const before = await call('order:unassignedCount')

    // A row written outside order:create (NULL driver_status) is still an
    // unresolved delivery order — the demo seed does exactly this.
    sqlite.prepare(
      `INSERT INTO orders (id, status, order_type, subtotal, tax, total, payment_type, created_at, updated_at)
       VALUES ('null-state', 'COMPLETED', 'delivery', 90, 0, 90, 'cash', ?, ?)`,
    ).run(`${day()}T08:00:00.000Z`, `${day()}T08:00:00.000Z`)
    expect(await call('order:unassignedCount')).toBe(before + 1)

    const a = await createOrder()
    const b = await createOrder()
    expect(await call('order:unassignedCount')).toBe(before + 3)

    // A historical driver-less order must never keep the badge lit.
    sqlite.prepare(
      `INSERT INTO orders (id, status, order_type, subtotal, tax, total, payment_type, driver_status, created_at, updated_at)
       VALUES ('old-unassigned', 'COMPLETED', 'delivery', 50, 0, 50, 'cash', 'unassigned', ?, ?)`,
    ).run(`${day(-400)}T10:00:00.000Z`, `${day(-400)}T10:00:00.000Z`)
    expect(await call('order:unassignedCount')).toBe(before + 3)

    // Cancelling clears one; assigning clears the other.
    await call('session:setUser', { id: adminId, role: 'admin' })
    await call('order:updateStatus', a.id, 'CANCELLED', 'العميل لغي')
    expect(await call('order:unassignedCount')).toBe(before + 2)

    await call('order:assignDriver', b.id, 'drv-a')
    expect(await call('order:unassignedCount')).toBe(before + 1) // just 'null-state'
  })
})

describe('report:driverSummary (end-of-day settlement)', () => {
  it('splits COD cash from visa per driver, with an unassigned bucket', async () => {
    await call('session:setUser', { id: adminId, role: 'admin' })
    const before = await call('report:driverSummary')

    await createOrder({ deliveryProfileId: 'drv-a', deliveryProfileName: 'سامي', total: 200, subtotal: 200 })
    await createOrder({
      deliveryProfileId: 'drv-a', deliveryProfileName: 'سامي',
      total: 150, subtotal: 150, paymentType: 'visa',
    })
    await createOrder() // 114 cash, no driver

    const s = await call('report:driverSummary')
    expect(s.from).toBe(day())
    expect(s.to).toBe(day())

    const aBefore = before.drivers.find((d: any) => d.profileId === 'drv-a')
    const a = s.drivers.find((d: any) => d.profileId === 'drv-a')
    expect(a).toBeDefined()
    expect(a.name).toBe('سامي')
    expect(a.phone).toBe('0100000000')
    expect(a.active).toBe(true)
    // Gained exactly the cash and the visa order created above.
    expect(a.orderCount).toBe((aBefore?.orderCount ?? 0) + 2)
    expect(a.cashTotal).toBe((aBefore?.cashTotal ?? 0) + 200)
    expect(a.visaTotal).toBe((aBefore?.visaTotal ?? 0) + 150)
    expect(a.total).toBe((aBefore?.total ?? 0) + 350)

    // drv-b holds only the order the cashier assigned in the previous block.
    const b = s.drivers.find((d: any) => d.profileId === 'drv-b')
    expect(b).toMatchObject({ name: 'كريم', orderCount: 1, cashTotal: 114, visaTotal: 0, total: 114 })

    expect(s.unassigned.name).toBe('بدون سائق')
    expect(s.unassigned.orderCount).toBe(before.unassigned.orderCount + 1)
    expect(s.unassigned.cashTotal).toBe(before.unassigned.cashTotal + 114)
    expect(s.unassigned.visaTotal).toBe(before.unassigned.visaTotal)

    expect(s.totals.orderCount).toBe(before.totals.orderCount + 3)
    expect(s.totals.cashTotal).toBe(before.totals.cashTotal + 314)
    expect(s.totals.visaTotal).toBe(before.totals.visaTotal + 150)
    expect(s.totals.total).toBe(before.totals.total + 464)
  })

  it('respects the date range (old driver-less orders stay out of today)', async () => {
    const only = await call('report:driverSummary', { from: day(-400), to: day(-400) })
    expect(only.from).toBe(day(-400))
    expect(only.drivers).toHaveLength(0)
    expect(only.unassigned).toMatchObject({ orderCount: 1, cashTotal: 50, visaTotal: 0, total: 50 })
    expect(only.totals).toEqual({ orderCount: 1, cashTotal: 50, visaTotal: 0, deliveryFee: 0, total: 50 })
  })

  it('stays admin-only', async () => {
    await call('session:setUser', { id: cashierId, role: 'cashier' })
    await expect(call('report:driverSummary')).rejects.toThrow('admin')
  })
})
