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
    // The owner enters the package count: 5 packages × 1000g pack = 5000g.
    const res = await call('inventory:restock', 'ing-pack', 5, 'شراء', { packagePrice: 100, supplier: 'مورد' })
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

  it('persists and defaults the inventory category and storage', async () => {
    const created = await call('inventory:createIngredient', {
      name: 'مادة مصنفة', unit: 'g', stockQuantity: 0, minStock: 0,
      category: 'produce', storage: 'fridge',
    }) as { id: string }

    const row = getSqlite().prepare(
      `SELECT category, storage FROM ingredients WHERE id = ?`,
    ).get(created.id) as any
    expect(row.category).toBe('produce')
    expect(row.storage).toBe('fridge')

    await call('inventory:updateIngredient', created.id, { category: 'sauces' })
    const changed = getSqlite().prepare(
      `SELECT category, storage FROM ingredients WHERE id = ?`,
    ).get(created.id) as any
    expect(changed.category).toBe('sauces')
    expect(changed.storage).toBe('dry')
  })

  it('counts the products each ingredient is connected to', async () => {
    const rows = await call('inventory:listIngredients') as any[]
    const pack = rows.find(r => r.id === 'ing-pack')
    expect(pack.productCount).toBe(1)
  })

  it('counts products reached through sub-recipes, addons and modifiers', async () => {
    const sqlite = getSqlite()
    sqlite.prepare(`INSERT INTO products (id, name, price, category_id, emoji, description)
      VALUES ('prod-sub', 'منتج فرعي', 10, 'cat-pack', '🧪', 'اختبار')`).run()
    sqlite.prepare(`INSERT INTO products (id, name, price, category_id, emoji, description)
      VALUES ('prod-addon', 'منتج إضافة', 10, 'cat-pack', '🧪', 'اختبار')`).run()
    sqlite.prepare(`INSERT INTO products (id, name, price, category_id, emoji, description)
      VALUES ('prod-mod', 'منتج خيار', 10, 'cat-pack', '🧪', 'اختبار')`).run()

    sqlite.prepare("INSERT INTO sub_recipes (id, name, unit, created_at) VALUES ('sub-pack', 'وصفة فرعية', 'وحدة', '2026-01-01T00:00:00Z')").run()
    sqlite.prepare("INSERT INTO sub_recipe_ingredients (id, sub_recipe_id, ingredient_id, quantity_per_unit) VALUES ('sri-pack', 'sub-pack', 'ing-pack', 1)").run()
    sqlite.prepare("INSERT INTO recipes (id, product_id, sub_recipe_id, quantity_per_unit) VALUES ('rec-sub', 'prod-sub', 'sub-pack', 1)").run()

    sqlite.prepare("INSERT INTO addons (id, name, price, emoji) VALUES ('addon-pack', 'إضافة', 1, '🧪')").run()
    sqlite.prepare("INSERT INTO addon_recipes (id, addon_id, ingredient_id, quantity_per_unit) VALUES ('ar-pack', 'addon-pack', 'ing-pack', 1)").run()
    sqlite.prepare("INSERT INTO product_addons (product_id, addon_id) VALUES ('prod-addon', 'addon-pack')").run()

    sqlite.prepare("INSERT INTO modifier_groups (id, name, type) VALUES ('grp-pack', 'خيار', 'single-select')").run()
    sqlite.prepare("INSERT INTO modifiers (id, modifier_group_id, name) VALUES ('mod-pack', 'grp-pack', 'خيار')").run()
    sqlite.prepare("INSERT INTO modifier_recipes (id, modifier_id, ingredient_id, quantity_per_unit) VALUES ('mr-pack', 'mod-pack', 'ing-pack', 1)").run()
    sqlite.prepare("INSERT INTO product_modifier_groups (product_id, modifier_group_id) VALUES ('prod-mod', 'grp-pack')").run()

    const rows = await call('inventory:listIngredients') as any[]
    expect(rows.find(r => r.id === 'ing-pack').productCount).toBe(4)
  })

  it('adds a direct quantity without multiplying by the package size', async () => {
    const sqlite = getSqlite()
    sqlite.prepare(
      `INSERT INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, purchase_qty, active)
       VALUES ('ing-direct', 'مادة مباشرة', 'g', 0, 0, 0.2, 1000, 1)`,
    ).run()

    // 300 g bought for 15 ج.م → 0.05 per gram, against a 0.2 standard.
    const res = await call('inventory:restock', 'ing-direct', 300, 'شراء مباشر', {
      byQuantity: true,
      totalPrice: 15,
      supplier: 'مورد مباشر',
    })
    expect(res.ok).toBe(true)
    expect(res.ppv).toBe(-45)

    const stock = sqlite.prepare("SELECT stock_quantity FROM ingredients WHERE id = 'ing-direct'").get() as any
    expect(stock.stock_quantity).toBe(300)

    const tx = sqlite.prepare(
      "SELECT quantity, unit_cost, supplier FROM inventory_transactions WHERE ingredient_id = 'ing-direct' AND type = 'PURCHASE'",
    ).get() as any
    expect(tx.quantity).toBe(300)
    expect(tx.unit_cost).toBe(0.05)
    expect(tx.supplier).toBe('مورد مباشر')
  })
})
