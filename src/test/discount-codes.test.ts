// Drives the real discount IPC handlers against a throwaway database: new
// schedule/scope fields must round-trip, an expired code must be rejected, and
// the auto resolver must pick the best valid offer.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'discount-codes-test-'))
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

let call: (channel: string, ...args: any[]) => Promise<any>
let productId = ''

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  registerIpcHandlers()

  call = async (channel: string, ...args: any[]) => {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(`no handler: ${channel}`)
    return fn({}, ...args)
  }

  await call('session:setUser', { id: 'u-admin', role: 'admin' })
  productId = (getSqlite().prepare('SELECT id FROM products LIMIT 1').get() as { id: string }).id
  // The seed ships an auto happy-hour offer; disable it so the assertions do
  // not depend on the wall clock.
  getSqlite().prepare('UPDATE discount_codes SET active = 0 WHERE auto_apply = 1').run()
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('discount code IPC', () => {
  it('round-trips schedule and scope fields', async () => {
    const created = await call('discountCode:create', {
      code: 'B2G1',
      type: 'bogo',
      value: 0,
      mode: 'order',
      scope: 'products',
      productIds: [productId],
      buyQty: 2,
      getQty: 1,
      getPercent: 100,
      startsAt: '2020-01-01',
      endsAt: '2099-12-31',
      daysOfWeek: [],
      minSubtotal: 0,
      autoApply: false,
    })
    expect(created.id).toBeTruthy()

    const rows = await call('discountCode:list')
    const row = rows.find((entry: any) => entry.code === 'B2G1')
    expect(row.scope).toBe('products')
    expect(row.productIds).toEqual([productId])
    expect(row.buyQty).toBe(2)
    expect(row.getQty).toBe(1)
    expect(row.startsAt).toBe('2020-01-01')
    expect(row.endsAt).toBe('2099-12-31')

    const validation = await call('discountCode:validate', 'B2G1')
    expect(validation.valid).toBe(true)
    expect(validation.discount.scope).toBe('products')
    expect(validation.discount.productIds).toEqual([productId])
  })

  it('rejects a code outside its date window', async () => {
    await call('discountCode:create', {
      code: 'OLD10',
      type: 'percentage',
      value: 10,
      mode: 'order',
      scope: 'order',
      endsAt: '2000-01-01',
      autoApply: false,
    })
    const validation = await call('discountCode:validate', 'OLD10')
    expect(validation.valid).toBe(false)
    expect(validation.error).toBe('انتهت صلاحية الخصم')
  })

  it('picks the best valid auto offer and ignores manual-only codes', async () => {
    await call('discountCode:create', {
      code: 'AUTO10',
      type: 'percentage',
      value: 10,
      mode: 'order',
      scope: 'order',
      autoApply: true,
    })
    await call('discountCode:create', {
      code: 'AUTO20',
      type: 'percentage',
      value: 20,
      mode: 'order',
      scope: 'order',
      autoApply: true,
    })

    const lines = [
      { lineId: 'a', productId, categoryId: 'cat', unitTotal: 100, quantity: 2, lineTotal: 200 },
      { lineId: 'b', productId, categoryId: 'cat', unitTotal: 40, quantity: 1, lineTotal: 40 },
    ]
    const best = await call('discountCode:resolveAuto', lines, 240)
    expect(best.discount.code).toBe('AUTO20')
    expect(best.total).toBe(48)
  })

  it('replaces scoped product rows on update', async () => {
    const rows = await call('discountCode:list')
    const bogo = rows.find((entry: any) => entry.code === 'B2G1')
    await call('discountCode:update', bogo.id, { scope: 'order', productIds: [], categoryIds: [] })
    const after = (await call('discountCode:list')).find((entry: any) => entry.id === bogo.id)
    expect(after.scope).toBe('order')
    expect(after.productIds).toEqual([])
  })
})
