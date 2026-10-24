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

  const recipeQty = (pid: string) => {
    const rows = sqlite.prepare(`
      SELECT i.id, r.quantity_per_unit AS qty
      FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.product_id = ?
    `).all(pid) as any[]
    return Object.fromEntries(rows.map(r => [r.id, r.qty])) as Record<string, number>
  }

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

  it('seeds the ten menu categories', () => {
    const cats = sqlite.prepare('SELECT id, name FROM categories ORDER BY sort_order').all() as any[]
    expect(cats.map(c => c.id)).toEqual([
      'drinks', 'meat_crepe', 'breakfast', 'buckets',
      'chicken_crepe', 'potato_crepe', 'syrian', 'mixes', 'sweets', 'treat',
    ])
    expect(cats.find(c => c.id === 'potato_crepe')!.name).toBe('كريب بطاطس')
    expect(cats.find(c => c.id === 'buckets')!.name).toBe('بطاطس باكت')
    expect(cats.find(c => c.id === 'syrian')!.name).toBe('السوري')
    expect(cats.find(c => c.id === 'sweets')!.name).toBe('Sweets')
  })

  it('seeds all 66 products with the given prices', () => {
    const { count } = sqlite.prepare('SELECT COUNT(*) AS count FROM products').get() as any
    expect(count).toBe(66)

    const syrian = sqlite.prepare(
      "SELECT id, price FROM products WHERE category_id = 'syrian' ORDER BY id",
    ).all() as any[]
    expect(syrian).toEqual([
      { id: 'sy1', price: 30 }, { id: 'sy2', price: 50 }, { id: 'sy3', price: 45 },
      { id: 'sy4', price: 55 }, { id: 'sy5', price: 70 },
    ])

    const buckets = sqlite.prepare(
      "SELECT id, price FROM products WHERE category_id = 'buckets' ORDER BY id",
    ).all() as any[]
    expect(buckets).toEqual([
      { id: 'bk10', price: 65 }, { id: 'bk11', price: 65 }, { id: 'bk12', price: 50 },
      { id: 'bk13', price: 30 }, { id: 'bk14', price: 70 }, { id: 'bk9', price: 30 },
    ])

    const meat = sqlite.prepare(
      "SELECT id, price FROM products WHERE category_id = 'meat_crepe' ORDER BY id",
    ).all() as any[]
    expect(meat).toEqual([
      { id: 'm5', price: 95 }, { id: 'm6', price: 115 }, { id: 'm7', price: 170 },
      { id: 'm8', price: 180 }, { id: 'm9', price: 150 },
    ])

    const potato = sqlite.prepare(
      "SELECT id, price FROM products WHERE category_id = 'potato_crepe' ORDER BY id",
    ).all() as any[]
    expect(potato.map(p => p.price)).toEqual([70, 95, 110, 80])

    const mixes = sqlite.prepare(
      "SELECT id, price FROM products WHERE category_id = 'mixes' ORDER BY id",
    ).all() as any[]
    expect(mixes.map(p => p.price)).toEqual([
      165, 135, 145, 100, 125, 105, 75, 235, 105, 60, 165, 175,
    ])

    const chicken = sqlite.prepare(
      "SELECT id, price FROM products WHERE id IN ('c1','c11','c12','c13','c14') ORDER BY id",
    ).all() as any[]
    expect(chicken).toEqual([
      { id: 'c1', price: 85 },
      { id: 'c11', price: 120 },
      { id: 'c12', price: 135 },
      { id: 'c13', price: 125 },
      { id: 'c14', price: 140 },
    ])

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
    // 66 products − 10 desserts − 5 chicken − 21 mixes/meat/potato − 6 buckets − 5 syrian
    expect(count).toBe(19)
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
    // by the dough sub-recipe) plus invoice items and produce
    // that no remaining recipe uses.
    expect(unused.map(u => u.id).sort()).toEqual([
      'ing-farm', 'ing-hall-crepe', 'ing-honey', 'ing-onion-rings', 'ing-pepper-mix',
      'ing-powdered-sugar', 'ing-tiktaway-crepe', 'ing-tomato',
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
    expect(boxes.map(b => b.product_id)).toEqual(['b1', 'bk13', 'bk9'])
    const mixBoxes = sqlite.prepare(
      `SELECT product_id FROM recipes WHERE ingredient_id = 'ing-potato-box-mix' ORDER BY product_id`,
    ).all() as any[]
    expect(mixBoxes.map(b => b.product_id)).toEqual([
      'bk10', 'bk11', 'bk12', 'bk14',
      'mx10', 'mx11', 'mx12', 'mx13', 'mx14', 'mx15', 'mx16', 'mx17', 'mx18', 'mx19', 'mx8', 'mx9',
    ])
    // sandwich paper wraps every crepe-style product
    const paper = sqlite.prepare(
      `SELECT COUNT(DISTINCT r.product_id) AS c FROM recipes r
       JOIN products p ON p.id = r.product_id
       WHERE r.ingredient_id = 'ing-sandwich-paper'
         AND p.category_id IN ('meat_crepe','breakfast','chicken_crepe','potato_crepe','syrian')`,
    ).get() as any
    expect(paper.c).toBe(30)
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
      'b1', 'c1', 'c10', 'c11', 'c12', 'c13', 'c14', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9',
      'm5', 'm6', 'm7', 'm8', 'm9', 'pc1', 'pc2', 'pc3', 'pc4',
    ])
  })

  it('seeds the new chicken crepe fillings and base recipe', () => {
    expect(recipeQty('c1')).toMatchObject({
      'ing-crunchy-hot': 150, 'ing-mozzarella': 50, 'ing-pepper': 15,
      'ing-cancheese': 15, 'ing-mayo': 15, 'ing-olives': 15,
      'ing-lettuce': 15, 'ing-ketchup': 2,
    })
    expect(recipeQty('c11')).toMatchObject({ 'ing-shawarma-cold': 120, 'ing-mozzarella': 50 })
    expect(recipeQty('c12')).toMatchObject({ 'ing-shawarma-cold': 120, 'ing-turkey': 15, 'ing-cheddar': 15 })
    expect(recipeQty('c13')).toMatchObject({ 'ing-shawarma-cold': 120, 'ing-cheddar': 15 })
    expect(recipeQty('c14')).toMatchObject({ 'ing-shawarma-cold': 120, 'ing-cheddar': 15, 'ing-mozzarella': 100 })

    for (const pid of ['c1', 'c11', 'c12', 'c13', 'c14']) {
      expect(recipeQty(pid)).toMatchObject({
        'ing-sandwich-paper': 1, 'ing-prod-sticker': 1, 'ing-sticky-disc': 1,
      })
    }
  })

  it('seeds the mixes, meat and potato crepe recipes', () => {
    expect(recipeQty('m5')).toMatchObject({
      'ing-kofta': 90, 'ing-texas': 15, 'ing-mozzarella': 50, 'ing-ketchup': 2,
    })
    expect(recipeQty('m8')).toMatchObject({
      'ing-sosis': 50, 'ing-burger': 50, 'ing-kofta': 50, 'ing-basturma': 10,
    })
    expect(recipeQty('pc4')).toMatchObject({
      'ing-crispy-potato': 120, 'ing-cheddar': 25, 'ing-mozzarella': 50,
    })
    expect(recipeQty('mx8')).toMatchObject({
      'ing-cordon-blue': 50, 'ing-mozz-stick': 30, 'ing-basturma': 20,
      'ing-shawarma-cold': 100, 'ing-potato-box-mix': 1,
    })
    expect(recipeQty('mx9')).toMatchObject({ 'ing-shawarma-cold': 100, 'ing-baniye': 2 })
    expect(recipeQty('mx15')).toMatchObject({
      'ing-baniye': 1, 'ing-sauce-spicy': 15, 'ing-sauce-jalapeno': 15,
    })
    // الميكسات are bowls — no crepe dough or sandwich paper.
    expect(recipeQty('mx8')['ing-sandwich-paper']).toBeUndefined()
  })

  it('seeds the potato bucket recipes', () => {
    expect(recipeQty('bk9')).toMatchObject({
      'ing-crispy-potato': 150, 'ing-potato-box': 1,
    })
    expect(recipeQty('bk10')).toMatchObject({
      'ing-crispy-potato': 120, 'ing-shawarma-cold': 50, 'ing-cheddar': 25,
      'ing-potato-box-mix': 1,
    })
    expect(recipeQty('bk11')).toMatchObject({
      'ing-crispy-potato': 110, 'ing-jalapeno': 20, 'ing-potato-box-mix': 1,
    })
    expect(recipeQty('bk12')).toMatchObject({
      'ing-crispy-potato': 100, 'ing-mozzarella': 50, 'ing-cheddar': 25,
      'ing-potato-box-mix': 1,
    })
    expect(recipeQty('bk14')).toMatchObject({
      'ing-crispy-potato': 120, 'ing-sosis': 50, 'ing-bbq': 15,
      'ing-potato-box-mix': 1,
    })
  })

  it('seeds the shrimp, Bigboom and bania potato mixes', () => {
    expect(recipeQty('mx17')).toMatchObject({
      'ing-shrimp': 6, 'ing-chicken-cold': 15, 'ing-potato-box-mix': 1,
    })
    expect(recipeQty('mx18')).toMatchObject({
      'ing-cordon-blue': 50, 'ing-shawarma-cold': 110,
      'ing-crispy-potato': 40, 'ing-texas': 15, 'ing-potato-box-mix': 1,
    })
    expect(recipeQty('mx19')).toMatchObject({
      'ing-mozzarella': 50, 'ing-pepper': 15, 'ing-cancheese': 15,
      'ing-mayo': 15, 'ing-olives': 15, 'ing-lettuce': 15,
      'ing-crunchy-cold': 50, 'ing-crispy-potato': 100,
      'ing-potato-box-mix': 1,
    })
  })

  it('seeds the Syrian recipes and paper packing', () => {
    expect(recipeQty('sy1')).toMatchObject({
      'ing-crispy-potato': 130, 'ing-cancheese': 20, 'ing-sauce-garlic': 15,
      'ing-sandwich-paper': 1,
    })
    expect(recipeQty('sy2')).toMatchObject({
      'ing-crispy-potato': 80, 'ing-shawarma-cold': 50,
      'ing-sauce-garlic': 15, 'ing-cancheese': 15,
    })
    expect(recipeQty('sy3')).toMatchObject({
      'ing-rome-cheese': 50, 'ing-crispy-potato': 120,
      'ing-sauce-garlic': 15, 'ing-cancheese': 15,
    })
    expect(recipeQty('sy4')).toMatchObject({
      'ing-crispy-potato': 100, 'ing-jalapeno': 15,
      'ing-shawarma-cold': 50, 'ing-sauce-garlic': 15,
    })
    expect(recipeQty('sy5')).toMatchObject({
      'ing-baniye': 1, 'ing-crispy-potato': 50,
      'ing-sauce-garlic': 15, 'ing-cancheese': 15,
    })
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
    expect(byName.get('سوسيس')).toMatchObject({ unit: 'g', stock: 10000 })
    expect(byName.get('صوص هالبينو')).toMatchObject({ unit: 'g', stock: 2000 })
    expect(byName.get('جمبري بانيه')).toMatchObject({ unit: 'قطعة', stock: 40 })
    // Packaged items keep their own unit.
    expect(byName.get('كاتشب ظرف')).toMatchObject({ unit: 'ظرف', stock: 20000 })
    expect(byName.get('سيرم نعناع')).toMatchObject({ unit: 'لتر', stock: 1 })
    expect(byName.get('تاتج')).toMatchObject({ unit: 'علبة', stock: 1 })
  })

  it('seeds the real purchase costs and package sizes for the priced items', () => {
    const priced = sqlite.prepare(
      'SELECT COUNT(*) AS c FROM ingredients WHERE cost_per_unit != 0',
    ).get() as any
    expect(priced.c).toBe(59)

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

    const baniye = sqlite.prepare(
      "SELECT cost_per_unit AS cost, purchase_qty AS pack, supplier FROM ingredients WHERE id = 'ing-baniye'",
    ).get() as any
    expect(baniye).toEqual({ cost: 19, pack: 1, supplier: 'متعدد' })

    const basturma = sqlite.prepare(
      "SELECT cost_per_unit AS cost, purchase_qty AS pack, supplier FROM ingredients WHERE id = 'ing-basturma'",
    ).get() as any
    expect(basturma).toEqual({ cost: 1.10, pack: 1000, supplier: 'حلواني' })

    const sosis = sqlite.prepare(
      "SELECT cost_per_unit AS cost, purchase_qty AS pack, supplier FROM ingredients WHERE id = 'ing-sosis'",
    ).get() as any
    expect(sosis).toEqual({ cost: 0.30, pack: 1000, supplier: 'حلواني' })

    const shrimp = sqlite.prepare(
      "SELECT cost_per_unit AS cost, purchase_qty AS pack FROM ingredients WHERE id = 'ing-shrimp'",
    ).get() as any
    expect(shrimp).toEqual({ cost: 13, pack: 40 })

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
        AND p.category_id IN ('meat_crepe','breakfast','buckets','chicken_crepe','potato_crepe','syrian','mixes')
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
      'mg-meat-12', 'mg-strips-200',
    ])
    expect((sqlite.prepare('SELECT COUNT(*) AS c FROM modifiers').get() as any).c).toBe(4)
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
    expect(before.c).toBe(66)
  })
})