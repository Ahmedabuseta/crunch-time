// The historical backfill must add the missing CONSUMPTION rows from each
// order's own recipe tree, never touch the current stock, and never count an
// order twice.
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'consumption-backfill-test-'))
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

const ts = '2026-01-10T10:00:00.000Z'

beforeAll(async () => {
  runMigrations()
  registerIpcHandlers()
  await call('session:setUser', { id: 'u-admin', role: 'admin' })

  const sqlite = getSqlite()
  sqlite.prepare("INSERT INTO categories (id, name, emoji, color) VALUES ('cat-bf', 'قسم', '🍔', '#fff')").run()
  sqlite.prepare(
    "INSERT INTO products (id, name, price, category_id, emoji, description, active) VALUES ('prod-bf', 'منتج', 10, 'cat-bf', '🍔', '', 1)",
  ).run()
  sqlite.prepare(
    `INSERT INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, purchase_qty, active) VALUES
     ('ing-a', 'أ', 'g', 100, 0, 1, 1, 1),
     ('ing-b', 'ب', 'g', 100, 0, 2, 1, 1),
     ('ing-c', 'ج', 'g', 100, 0, 3, 1, 1),
     ('ing-d', 'د', 'g', 100, 0, 4, 1, 1)`,
  ).run()

  sqlite.prepare(
    "INSERT INTO sub_recipes (id, name, unit, active, created_at) VALUES ('sub-bf', 'فرعية', 'حبة', 1, ?)",
  ).run(ts)
  sqlite.prepare(
    "INSERT INTO sub_recipe_ingredients (id, sub_recipe_id, ingredient_id, quantity_per_unit) VALUES ('sri-bf', 'sub-bf', 'ing-b', 4)",
  ).run()
  sqlite.prepare(
    `INSERT INTO recipes (id, product_id, ingredient_id, sub_recipe_id, quantity_per_unit) VALUES
     ('rec-a', 'prod-bf', 'ing-a', NULL, 10),
     ('rec-sub', 'prod-bf', NULL, 'sub-bf', 2)`,
  ).run()

  sqlite.prepare("INSERT INTO addons (id, name, price, emoji, active) VALUES ('addon-bf', 'إضافة', 1, '🍟', 1)").run()
  sqlite.prepare(
    "INSERT INTO addon_recipes (id, addon_id, ingredient_id, sub_recipe_id, quantity_per_unit) VALUES ('ar-bf', 'addon-bf', 'ing-c', NULL, 5)",
  ).run()
  sqlite.prepare("INSERT INTO product_addons (product_id, addon_id) VALUES ('prod-bf', 'addon-bf')").run()

  sqlite.prepare("INSERT INTO modifier_groups (id, name, type, active) VALUES ('mg-bf', 'خيار', 'single-select', 1)").run()
  sqlite.prepare("INSERT INTO modifiers (id, modifier_group_id, name, active) VALUES ('mod-bf', 'mg-bf', 'خيار', 1)").run()
  sqlite.prepare(
    "INSERT INTO modifier_recipes (id, modifier_id, ingredient_id, sub_recipe_id, quantity_per_unit) VALUES ('mr-bf', 'mod-bf', 'ing-d', NULL, 3)",
  ).run()
  sqlite.prepare("INSERT INTO product_modifier_groups (product_id, modifier_group_id) VALUES ('prod-bf', 'mg-bf')").run()

  const order = sqlite.prepare(
    `INSERT INTO orders (id, status, order_type, subtotal, tax, total, created_at, updated_at)
     VALUES (?, ?, ?, 0, 0, 0, ?, ?)`,
  )
  order.run('o-old', 'COMPLETED', 'dine-in', ts, ts)
  order.run('o-new', 'COMPLETED', 'dine-in', ts, ts)
  order.run('o-del', 'COMPLETED', 'delivery', ts, ts)

  const item = sqlite.prepare(
    `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, selected_modifiers_json, selected_addons_json)
     VALUES (?, ?, 'prod-bf', ?, 10, ?, ?)`,
  )
  item.run('oi-old', 'o-old', 2, '[{"modifierId":"mod-bf"}]', '["addon-bf"]')
  item.run('oi-new', 'o-new', 1, null, null)
  item.run('oi-del', 'o-del', 1, null, null)
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('historical consumption backfill', () => {
  it('previews without writing and reports what is already counted', async () => {
    const sqlite = getSqlite()
    sqlite.prepare(
      `INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at)
       VALUES ('tx-existing', 'ing-a', 'CONSUMPTION', -1, 'o-new', NULL, ?)`,
    ).run(ts)

    const before = (sqlite.prepare('SELECT COUNT(*) AS c FROM inventory_transactions').get() as any).c
    const res = await call('inventory:backfillConsumption', { from: '2026-01-01', to: '2026-01-31', dryRun: true })

    expect(res.matchedOrders).toBe(3)
    expect(res.alreadyCounted).toBe(1)
    expect(res.readyOrders).toBe(2)
    expect(res.noRecipeOrders).toBe(0)
    expect(res.ingredients).toBe(4)
    expect(res.inserted).toBe(0)
    // o-old (qty 2, with addon+modifier) + o-del (qty 1, base recipe only).
    expect(res.cost).toBe(132)
    expect((sqlite.prepare('SELECT COUNT(*) AS c FROM inventory_transactions').get() as any).c).toBe(before)
  })

  it('honours the order-type filter', async () => {
    const res = await call('inventory:backfillConsumption', {
      from: '2026-01-01',
      to: '2026-01-31',
      orderType: 'delivery',
      dryRun: true,
    })
    expect(res.matchedOrders).toBe(1)
    expect(res.readyOrders).toBe(1)
  })

  it('writes the recipe, sub-recipe, addon and modifier quantities without touching stock', async () => {
    const sqlite = getSqlite()
    const stockBefore = sqlite.prepare("SELECT stock_quantity FROM ingredients WHERE id = 'ing-a'").get() as any

    const res = await call('inventory:backfillConsumption', { from: '2026-01-01', to: '2026-01-31' })
    expect(res.inserted).toBe(6) // o-old: 4 ingredients + o-del: 2 ingredients

    const rows = sqlite.prepare(
      `SELECT ingredient_id AS ingredientId, quantity FROM inventory_transactions
       WHERE reference_order_id = 'o-old' AND type = 'CONSUMPTION' ORDER BY ingredient_id`,
    ).all() as any[]
    expect(rows).toEqual([
      { ingredientId: 'ing-a', quantity: -20 },
      { ingredientId: 'ing-b', quantity: -16 },
      { ingredientId: 'ing-c', quantity: -10 },
      { ingredientId: 'ing-d', quantity: -6 },
    ])
    expect((sqlite.prepare("SELECT stock_quantity FROM ingredients WHERE id = 'ing-a'").get() as any).stock_quantity)
      .toBe(stockBefore.stock_quantity)
  })

  it('is idempotent — a second run writes nothing', async () => {
    const sqlite = getSqlite()
    const res = await call('inventory:backfillConsumption', { from: '2026-01-01', to: '2026-01-31' })
    expect(res.readyOrders).toBe(0)
    expect(res.inserted).toBe(0)
    expect(res.alreadyCounted).toBe(3)

    const count = (sqlite.prepare(
      "SELECT COUNT(*) AS c FROM inventory_transactions WHERE reference_order_id = 'o-old' AND type = 'CONSUMPTION'",
    ).get() as any).c
    expect(count).toBe(4)
  })
})
