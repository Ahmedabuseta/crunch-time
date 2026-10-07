import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// seed.ts resolves its DB through client.ts, which asks Electron for userData.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir },
}))

const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { runMigrations } = await import('../db/migrate')

describe('seedDatabase — Crunch Time menu', () => {
  let sqlite: any

  beforeAll(async () => {
    sqlite = getSqlite()
    runMigrations()
    await seedDatabase()
  })

  afterAll(() => {
    // Windows locks open files — close the connection before
    // the recursive delete or rmSync throws EPERM.
    closeSqlite()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('seeds the nine menu categories', () => {
    const cats = sqlite.prepare('SELECT id, name FROM categories ORDER BY sort_order').all() as any[]
    expect(cats.map(c => c.id)).toEqual([
      'drinks', 'meat_crepe', 'breakfast', 'buckets',
      'chicken_crepe', 'syrian', 'mixes', 'sweets', 'treat',
    ])
    expect(cats.find(c => c.id === 'syrian')!.name).toBe('السوري')
    expect(cats.find(c => c.id === 'sweets')!.name).toBe('Sweets')
  })

  it('seeds all 60 products with the given prices', () => {
    const { count } = sqlite.prepare('SELECT COUNT(*) AS count FROM products').get() as any
    expect(count).toBe(60)

    const waffles = sqlite.prepare(
      "SELECT id, price FROM products WHERE category_id = 'sweets' ORDER BY id",
    ).all() as any[]
    expect(waffles).toEqual([
      { id: 'sw1', price: 55 }, { id: 'sw2', price: 65 }, { id: 'sw3', price: 70 },
      { id: 'sw4', price: 70 }, { id: 'sw5', price: 70 },
    ])

    const treats = sqlite.prepare(
      "SELECT id, price FROM products WHERE category_id = 'treat' ORDER BY id",
    ).all() as any[]
    expect(treats.map(t => t.price)).toEqual([95, 105, 130, 120, 120])
  })

  it('leaves owner-set prices at zero rather than inventing them', () => {
    const { count } = sqlite.prepare('SELECT COUNT(*) AS count FROM products WHERE price = 0').get() as any
    // 60 products − 10 priced desserts
    expect(count).toBe(50)
  })

  it('gives every product at least one recipe and all resolve to real ingredients', () => {
    const orphans = sqlite.prepare(`
      SELECT p.id FROM products p
      LEFT JOIN recipes r ON r.product_id = p.id
      WHERE r.id IS NULL
    `).all() as any[]
    expect(orphans).toEqual([])

    const dangling = sqlite.prepare(`
      SELECT r.id FROM recipes r
      LEFT JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.ingredient_id IS NOT NULL AND i.id IS NULL
    `).all() as any[]
    expect(dangling).toEqual([])
  })

  it('never leaves an ingredient unused by any recipe', () => {
    const unused = sqlite.prepare(`
      SELECT i.id FROM ingredients i
      LEFT JOIN recipes r ON r.ingredient_id = i.id
      LEFT JOIN addon_recipes ar ON ar.ingredient_id = i.id
      LEFT JOIN modifier_recipes mr ON mr.ingredient_id = i.id
      WHERE r.id IS NULL AND ar.id IS NULL AND mr.id IS NULL
    `).all() as any[]
    expect(unused).toEqual([])
  })

  it('seeds the real kitchen stock in grams', () => {
    const rows = sqlite.prepare(`
      SELECT name, unit, stock_quantity AS stock FROM ingredients ORDER BY name
    `).all() as any[]

    const byName = new Map(rows.map(r => [r.name, r]))
    // Bulk items came in as كجم and are stored ×1000.
    expect(byName.get('موزاريلا')).toMatchObject({ unit: 'g', stock: 20000 })
    expect(byName.get('سجق')).toMatchObject({ unit: 'g', stock: 10000 })
    expect(byName.get('شيدر')).toMatchObject({ unit: 'g', stock: 10000 })
    expect(byName.get('برجر')).toMatchObject({ unit: 'g', stock: 4800 })
    expect(byName.get('مشروم')).toMatchObject({ unit: 'g', stock: 9600 })
    // Packaged items keep their own unit.
    expect(byName.get('كاتشب ظرف')).toMatchObject({ unit: 'ظرف', stock: 2000 })
    expect(byName.get('سيرم نعناع')).toMatchObject({ unit: 'لتر', stock: 1 })
    expect(byName.get('تاتج')).toMatchObject({ unit: 'علبة', stock: 1 })
  })

  it('starts every ingredient at zero cost so the owner sets real prices', () => {
    const { c } = sqlite.prepare('SELECT COUNT(*) AS c FROM ingredients WHERE cost_per_unit != 0').get() as any
    expect(c).toBe(0)
  })

  it('never deducts more than the stock on hand for a single recipe', () => {
    const over = sqlite.prepare(`
      SELECT r.product_id, r.ingredient_id, r.quantity_per_unit AS qty, i.stock_quantity AS stock
      FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.quantity_per_unit > i.stock_quantity
    `).all() as any[]
    expect(over).toEqual([])
  })

  it('links every addon to the food departments only', () => {
    // Every active product in a made-to-order department
    // carries every addon; drinks/sweets/treats carry none.
    const missing = sqlite.prepare(`
      SELECT p.id FROM products p
      WHERE p.active = 1
        AND p.category_id IN ('meat_crepe','breakfast','buckets','chicken_crepe','syrian','mixes')
        AND (SELECT COUNT(*) FROM product_addons pa WHERE pa.product_id = p.id)
            != (SELECT COUNT(*) FROM addons)
    `).all() as any[]
    expect(missing).toEqual([])

    const excluded = sqlite.prepare(`
      SELECT COUNT(*) AS c FROM product_addons pa
      JOIN products p ON p.id = pa.product_id
      WHERE p.category_id IN ('drinks','sweets','treat')
    `).get() as any
    expect(excluded.c).toBe(0)

    // No modifier data is seeded at all.
    const modifierRows = sqlite.prepare(`
      SELECT (SELECT COUNT(*) FROM modifier_groups)
           + (SELECT COUNT(*) FROM modifiers)
           + (SELECT COUNT(*) FROM modifier_recipes)
           + (SELECT COUNT(*) FROM product_modifier_groups) AS c
    `).get() as any
    expect(modifierRows.c).toBe(0)
  })

  it('seeds no fabricated sales history', () => {
    // Fresh installs get staff + menu only; orders, shifts, customers and
    // purchase history must come from real use or a restored backup.
    const count = (t: string) =>
      (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as any).c as number
    for (const table of [
      'orders', 'order_items', 'payments', 'cash_movements', 'shifts',
      'customers', 'purchase_price_history', 'inventory_transactions',
    ]) {
      expect(count(table), `${table} should start empty`).toBe(0)
    }
  })

  it('is idempotent — a second run does not duplicate rows', () => {
    const before = sqlite.prepare('SELECT COUNT(*) AS c FROM products').get() as any
    expect(before.c).toBe(60)
  })
})