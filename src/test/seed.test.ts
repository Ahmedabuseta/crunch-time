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

  it('leaves only the bought crepe wrappers and unwired invoice items unused', () => {
    const unused = sqlite.prepare(`
      SELECT i.id FROM ingredients i
      LEFT JOIN recipes r ON r.ingredient_id = i.id
      LEFT JOIN addon_recipes ar ON ar.ingredient_id = i.id
      LEFT JOIN modifier_recipes mr ON mr.ingredient_id = i.id
      LEFT JOIN sub_recipe_ingredients sri ON sri.ingredient_id = i.id
      WHERE r.id IS NULL AND ar.id IS NULL AND mr.id IS NULL AND sri.id IS NULL
    `).all() as any[]
    // The bought كريب الصالة/تيكتاواي wrappers (superseded
    // by the dough sub-recipe) and عسل/سكر بودرة —
    // priced from the invoice but not in any product yet.
    expect(unused.map(u => u.id).sort()).toEqual([
      'ing-hall-crepe', 'ing-honey', 'ing-powdered-sugar', 'ing-tiktaway-crepe',
    ])
  })

  it('draws packing materials per product', () => {
    const productCount = (sqlite.prepare('SELECT COUNT(*) AS c FROM products').get() as any).c
    // every product carries a production-date sticker and a label disc
    for (const iid of ['ing-prod-sticker', 'ing-sticky-disc']) {
      const rows = sqlite.prepare(
        'SELECT DISTINCT product_id FROM recipes WHERE ingredient_id = ?',
      ).all(iid) as any[]
      expect(rows.length).toBe(productCount)
    }
    // plain fries box vs مركب (cheese) fries box
    const boxes = sqlite.prepare(
      `SELECT product_id FROM recipes WHERE ingredient_id = 'ing-potato-box' ORDER BY product_id`,
    ).all() as any[]
    expect(boxes.map(b => b.product_id)).toEqual(['b1', 'bk1', 'bk2', 's1', 's10', 's11', 's9'])
    const mixBoxes = sqlite.prepare(
      `SELECT product_id FROM recipes WHERE ingredient_id = 'ing-potato-box-mix' ORDER BY product_id`,
    ).all() as any[]
    expect(mixBoxes.map(b => b.product_id)).toEqual(['bk3', 'bk4', 's2'])
    // sandwich paper wraps every crepe-style product
    const paper = sqlite.prepare(
      `SELECT COUNT(DISTINCT r.product_id) AS c FROM recipes r
       JOIN products p ON p.id = r.product_id
       WHERE r.ingredient_id = 'ing-sandwich-paper'
         AND p.category_id IN ('meat_crepe','breakfast','chicken_crepe','syrian')`,
    ).get() as any
    expect(paper.c).toBe(27)
    // butter paper under the sweets and treats
    const butter = sqlite.prepare(
      `SELECT COUNT(DISTINCT r.product_id) AS c FROM recipes r
       JOIN products p ON p.id = r.product_id
       WHERE r.ingredient_id = 'ing-butter-paper'
         AND p.category_id IN ('sweets','treat')`,
    ).get() as any
    expect(butter.c).toBe(10)
  })

  it('builds the crepe dough sub-recipe from the recipe book', () => {
    const sub = sqlite.prepare(`
      SELECT id, name, unit FROM sub_recipes WHERE id = 'sub-crepe-dough'
    `).get() as any
    expect(sub).toMatchObject({ id: 'sub-crepe-dough', name: 'عجينة الكريب', unit: 'حبة' })

    // 12 pieces make 2,970 g → 1/12 of each bulk quantity per piece
    const rows = sqlite.prepare(`
      SELECT i.id, sri.quantity_per_unit AS qty
      FROM sub_recipe_ingredients sri JOIN ingredients i ON i.id = sri.ingredient_id
      WHERE sri.sub_recipe_id = 'sub-crepe-dough' ORDER BY i.id
    `).all() as any[]
    expect(rows.length).toBe(9)
    const qtyOf = (id: string) => rows.find(r => r.id === id)!.qty
    expect(qtyOf('ing-flour')).toBeCloseTo(1000 / 12, 2)
    expect(qtyOf('ing-water')).toBeCloseTo(1700 / 12, 2)
    expect(qtyOf('ing-milk-powder')).toBeCloseTo(70 / 12, 2)
    expect(qtyOf('ing-egg-white-powder')).toBeCloseTo(100 / 12, 2)
    expect(qtyOf('ing-sugar')).toBeCloseTo(30 / 12, 2)
    expect(qtyOf('ing-oil')).toBeCloseTo(100 / 12, 2)
    expect(qtyOf('ing-butter')).toBeCloseTo(50 / 12, 2)
    expect(qtyOf('ing-baking-powder')).toBeCloseTo(10 / 12, 2)
    expect(qtyOf('ing-vanilla')).toBeCloseTo(10 / 12, 2)

    // every crepe product draws one dough piece
    const products = sqlite.prepare(`
      SELECT product_id FROM recipes
      WHERE sub_recipe_id = 'sub-crepe-dough' ORDER BY product_id
    `).all() as any[]
    expect(products.map(p => p.product_id)).toEqual([
      'b1', 'c1', 'c10', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9',
      'm1', 'm2', 'm3', 'm4',
    ])
  })

  it('seeds the real kitchen stock in grams', () => {
    const rows = sqlite.prepare(`
      SELECT name, unit, stock_quantity AS stock FROM ingredients ORDER BY name
    `).all() as any[]

    const byName = new Map(rows.map(r => [r.name, r]))
    // Bulk items came in as كجم and are stored ×1000.
    expect(byName.get('موزاريلا')).toMatchObject({ unit: 'g', stock: 10000 })
    expect(byName.get('سجق')).toMatchObject({ unit: 'g', stock: 100000 })
    expect(byName.get('شيدر (صوص)')).toMatchObject({ unit: 'g', stock: 50000 })
    expect(byName.get('برجر')).toMatchObject({ unit: 'g', stock: 6000 })
    expect(byName.get('مشروم')).toMatchObject({ unit: 'g', stock: 96000 })
    // Packaged items keep their own unit.
    expect(byName.get('كاتشب ظرف')).toMatchObject({ unit: 'ظرف', stock: 20000 })
    expect(byName.get('سيرم نعناع')).toMatchObject({ unit: 'لتر', stock: 1 })
    expect(byName.get('تاتج')).toMatchObject({ unit: 'علبة', stock: 1 })
  })

  it('seeds the real purchase costs and package sizes for the priced items', () => {
    const priced = sqlite.prepare(
      'SELECT COUNT(*) AS c FROM ingredients WHERE cost_per_unit != 0',
    ).get() as any
    expect(priced.c).toBe(52)

    const shawarmaHot = sqlite.prepare(
      "SELECT cost_per_unit AS cost, purchase_qty AS pack, supplier FROM ingredients WHERE id = 'ing-shawarma-hot'",
    ).get() as any
    expect(shawarmaHot).toEqual({ cost: 0.203, pack: 15000, supplier: 'روستي' })

    const burger = sqlite.prepare(
      "SELECT cost_per_unit AS cost, purchase_qty AS pack, supplier FROM ingredients WHERE id = 'ing-burger'",
    ).get() as any
    expect(burger).toEqual({ cost: 2.15, pack: 600, supplier: 'دايم' })

    const ketchup = sqlite.prepare(
      "SELECT cost_per_unit AS cost, purchase_qty AS pack FROM ingredients WHERE id = 'ing-ketchup'",
    ).get() as any
    expect(ketchup).toEqual({ cost: 0.485, pack: 1000 })

    // Unpriced items still start at zero cost.
    const zinger = sqlite.prepare(
      "SELECT cost_per_unit AS cost FROM ingredients WHERE id = 'ing-zinger'",
    ).get() as any
    expect(zinger.cost).toBe(0)
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
  })

  it('seeds the "أو"-choice modifier groups wired to real products', () => {
    const groups = sqlite.prepare('SELECT id FROM modifier_groups ORDER BY id').all() as any[]
    expect(groups.map(g => g.id)).toEqual([
      'mg-meat-12', 'mg-meat-18', 'mg-strips-110', 'mg-strips-120', 'mg-strips-200',
    ])
    expect((sqlite.prepare('SELECT COUNT(*) AS c FROM modifiers').get() as any).c).toBe(10)
    const danglingMods = sqlite.prepare(`
      SELECT pmg.product_id FROM product_modifier_groups pmg
      LEFT JOIN products p ON p.id = pmg.product_id
      WHERE p.id IS NULL
    `).all() as any[]
    expect(danglingMods).toEqual([])
    // Every option draws a real ingredient.
    const modRecipes = sqlite.prepare(`
      SELECT mr.id FROM modifier_recipes mr
      LEFT JOIN ingredients i ON i.id = mr.ingredient_id
      WHERE i.id IS NULL
    `).all() as any[]
    expect(modRecipes).toEqual([])
  })

  it('gives every addon a stock-drawing recipe', () => {
    const recipeless = sqlite.prepare(`
      SELECT a.id FROM addons a
      LEFT JOIN addon_recipes ar ON ar.addon_id = a.id
      WHERE ar.id IS NULL
    `).all() as any[]
    expect(recipeless).toEqual([])
    const dangling = sqlite.prepare(`
      SELECT ar.id FROM addon_recipes ar
      LEFT JOIN ingredients i ON i.id = ar.ingredient_id
      WHERE i.id IS NULL
    `).all() as any[]
    expect(dangling).toEqual([])
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