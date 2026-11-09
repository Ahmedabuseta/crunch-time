// The recipe is the single source of truth for a product's cost.
//
// `products.cost_price` is derived: Σ (recipe quantity × ingredient cost),
// including whatever a sub-recipe contributes. Nothing else may write it, and
// every change that alters the sum must refresh it — otherwise the figure the
// reports use describes a menu that no longer exists.
//
// This is the rule the previous release got wrong in both directions: it let a
// caller set the total by hand, and it skipped the refresh on boot after a
// manual value appeared to be "overwritten" (there is no manual value to keep).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'cost-derivation-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { recomputeAllProductCosts } = await import('../db/product-cost')
const { setUser } = await import('../backend/session')
const inventory = await import('../backend/inventory')
const catalog = await import('../backend/catalog')

const rows = (sql: string, ...args: unknown[]) => getSqlite().prepare(sql).all(...args) as any[]
const one = (sql: string, ...args: unknown[]) => getSqlite().prepare(sql).get(...args) as any
const costOf = (id: string) => Number(one('SELECT cost_price FROM products WHERE id = ?', id)?.cost_price ?? -1)

/** Expected cost, computed here from the same tables rather than from the code. */
function expectedCost(productId: string): number {
  const direct = one(`
    SELECT COALESCE(SUM(r.quantity_per_unit * i.cost_per_unit), 0) AS c
    FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.product_id = ? AND r.ingredient_id IS NOT NULL
  `, productId)?.c ?? 0
  const viaSub = one(`
    SELECT COALESCE(SUM(r.quantity_per_unit * sri.quantity_per_unit * i.cost_per_unit), 0) AS c
    FROM recipes r
    JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = r.sub_recipe_id
    JOIN ingredients i ON i.id = sri.ingredient_id
    WHERE r.product_id = ?
  `, productId)?.c ?? 0
  return Math.round((Number(direct) + Number(viaSub)) * 100) / 100
}

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  // The same sequence the real bootstrap runs: migrations, seed, then the cost
  // pass — because the seed writes recipes after migrations have finished.
  recomputeAllProductCosts()
  setUser({ id: 'test-admin', role: 'admin' } as never)
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('the stored cost matches the recipe', () => {
  it('agrees with a hand-computed total for every product with a recipe', () => {
    const products = rows(`
      SELECT DISTINCT p.id, p.name FROM products p
      JOIN recipes r ON r.product_id = p.id
    `)
    expect(products.length).toBeGreaterThan(0)
    for (const product of products) {
      expect(costOf(product.id), `cost of ${product.name}`).toBe(expectedCost(product.id))
    }
  })

  it('is zero for a product with no recipe', () => {
    const orphan = rows('SELECT p.id FROM products p WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE r.product_id = p.id) LIMIT 1')[0]
    if (orphan) expect(costOf(orphan.id)).toBe(0)
  })
})

describe('a hand-written cost cannot survive', () => {
  it('is replaced by the recipe total on the next start', () => {
    const product = rows('SELECT p.id, p.name FROM products p JOIN recipes r ON r.product_id = p.id LIMIT 1')[0]
    const truth = expectedCost(product.id)

    getSqlite().prepare('UPDATE products SET cost_price = 999 WHERE id = ?').run(product.id)
    expect(costOf(product.id)).toBe(999)

    // The next launch recomputes; there is no manual figure to protect.
    runMigrations()
    expect(costOf(product.id)).toBe(truth)
  })

  it('cannot be set through the catalogue API', () => {
    // `cleanProduct` ignores the field on purpose: accepting it would create a
    // second source of truth the next recipe edit overwrites.
    const category = one('SELECT id FROM categories LIMIT 1')
    const created = catalog.createProduct({
      name: `صنف تكلفة ${Date.now()}`,
      price: 50,
      categoryId: category.id,
      emoji: '🍔',
      description: 'اختبار',
      costPrice: 999,
    } as never)
    const id = String((created as any).id ?? created)
    expect(costOf(id)).toBe(0)
  })
})

describe('every change to the sum refreshes the cost', () => {
  it('follows an ingredient cost change', () => {
    const product = rows('SELECT p.id FROM products p JOIN recipes r ON r.product_id = p.id LIMIT 1')[0]
    const ingredient = one(
      'SELECT i.id, i.cost_per_unit FROM ingredients i JOIN recipes r ON r.ingredient_id = i.id WHERE r.product_id = ? LIMIT 1',
      product.id,
    )
    inventory.updateIngredient(ingredient.id, { costPerUnit: Number(ingredient.cost_per_unit) + 5 })
    expect(costOf(product.id)).toBe(expectedCost(product.id))

    // Restored so later tests see the same menu.
    inventory.updateIngredient(ingredient.id, { costPerUnit: Number(ingredient.cost_per_unit) })
  })

  it('follows a change to a sub-recipe a product uses', () => {
    const row = rows(`
      SELECT r.product_id AS productId, r.sub_recipe_id AS subRecipeId
      FROM recipes r WHERE r.sub_recipe_id IS NOT NULL LIMIT 1
    `)[0]
    expect(row).toBeTruthy()

    const line = one('SELECT id, ingredient_id, quantity_per_unit FROM sub_recipe_ingredients WHERE sub_recipe_id = ? LIMIT 1', row.subRecipeId)
    expect(line).toBeTruthy()

    inventory.upsertSubRecipeIngredient({
      id: line.id,
      subRecipeId: row.subRecipeId,
      ingredientId: line.ingredient_id,
      quantityPerUnit: Number(line.quantity_per_unit) * 2,
    })
    // The product that includes the sub-recipe now costs more, and the stored
    // figure says so immediately — not at the next launch.
    expect(costOf(row.productId)).toBe(expectedCost(row.productId))

    inventory.upsertSubRecipeIngredient({
      id: line.id,
      subRecipeId: row.subRecipeId,
      ingredientId: line.ingredient_id,
      quantityPerUnit: Number(line.quantity_per_unit),
    })
  })
})
