// Package pricing: the owner enters the price of the purchase
// package (e.g. a 1kg bag), not the per-gram cost. Drives the
// REAL IPC handlers through a mocked ipcMain against a throwaway
// database.
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'inventory-pricing-test-'))
const handlers = new Map<string, (e: any, ...args: any[]) => any>()

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) },
  BrowserWindow: class MockWindow {},
}))

const { registerIpcHandlers } = await import('../ipc/main')
const { runMigrations } = await import('../db/migrate')
const { getSqlite, closeSqlite } = await import('../db/client')

const call = async (channel: string, ...args: any[]) => {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler: ${channel}`)
  return fn({}, ...args)
}

beforeAll(async () => {
  runMigrations()
  registerIpcHandlers()
  await call('session:setUser', { id: 'u-admin', role: 'admin' })
})

afterAll(() => {
  // Windows locks open files — close the connection before
  // the recursive delete or rmSync throws EPERM.
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('inventory package pricing', () => {
  it('derives the per-unit cost from the package price on restock', async () => {
    const sqlite = getSqlite()
    sqlite.prepare(
      `INSERT INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, purchase_qty, active)
       VALUES ('ing-pack', 'مادة اختبار', 'g', 0, 0, 0, 1000, 1)`,
    ).run()

    // A 1kg bag bought for 100 ج.م → 0.1 ج.م per gram.
    const res = await call('inventory:restock', 'ing-pack', 5000, 'شراء', { packagePrice: 100, supplier: 'مورد' })
    expect(res.ok).toBe(true)

    const purchase = sqlite.prepare(
      `SELECT quantity, unit_cost FROM inventory_transactions
       WHERE ingredient_id = 'ing-pack' AND type = 'PURCHASE'`,
    ).get() as any
    expect(purchase.quantity).toBe(5000)
    expect(Math.round((purchase.unit_cost as number) * 1000) / 1000).toBe(0.1)

    const history = sqlite.prepare(
      `SELECT unit_cost, quantity FROM purchase_price_history WHERE ingredient_id = 'ing-pack'`,
    ).get() as any
    expect(history).toBeTruthy()
    expect(Math.round((history.unit_cost as number) * 1000) / 1000).toBe(0.1)
  })

  it('recomputes product costs immediately when an ingredient cost changes', async () => {
    const sqlite = getSqlite()
    sqlite.prepare(
      `INSERT INTO categories (id, name, emoji, color, sort_order, active)
       VALUES ('cat-pack', 'اختبار', '🧪', '#123456', 99, 1)`,
    ).run()
    sqlite.prepare(
      `INSERT INTO products (id, name, price, category_id, emoji, description, active, cost_price, supports_rollback)
       VALUES ('prod-pack', 'منتج اختبار', 100, 'cat-pack', '🧪', 'وصف', 1, 0, 1)`,
    ).run()
    sqlite.prepare(
      `INSERT INTO recipes (id, product_id, ingredient_id, quantity_per_unit)
       VALUES ('rec-pack', 'prod-pack', 'ing-pack', 100)`,
    ).run()

    // 100 g per product × 0.1 ج.م/g = 10 ج.م cost.
    await call('inventory:updateIngredient', 'ing-pack', { costPerUnit: 0.1, purchaseQty: 1000 })
    const cost = (sqlite.prepare('SELECT cost_price FROM products WHERE id = ?').get('prod-pack') as any).cost_price
    expect(Math.round(cost * 100) / 100).toBe(10)

    // And it follows a second change without a restart.
    await call('inventory:updateIngredient', 'ing-pack', { costPerUnit: 0.2, purchaseQty: 1000 })
    const cost2 = (sqlite.prepare('SELECT cost_price FROM products WHERE id = ?').get('prod-pack') as any).cost_price
    expect(Math.round(cost2 * 100) / 100).toBe(20)
  })

  it('persists the package size when creating an ingredient', async () => {
    await call('inventory:createIngredient', {
      name: 'مادة جديدة', unit: 'g', stockQuantity: 0, minStock: 0, costPerUnit: 0.25, purchaseQty: 500,
    })
    const row = getSqlite().prepare(
      `SELECT purchase_qty, cost_per_unit FROM ingredients WHERE name = 'مادة جديدة'`,
    ).get() as any
    expect(row.purchase_qty).toBe(500)
    expect(row.cost_per_unit).toBe(0.25)
  })
})
