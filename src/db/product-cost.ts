// Product cost is derived, and this is the only place that writes it.
//
// The recipe is the single source of truth: a product's cost is
// Σ (recipe quantity × ingredient cost), plus whatever each included sub-recipe
// contributes. `products.cost_price` is a cached total of that sum — never a
// figure an owner or a caller enters.
//
// Everything that can change the sum has to refresh the total:
//   • a recipe line added, edited or removed
//   • an ingredient's cost changed
//   • a sub-recipe's contents changed
//   • startup, as a self-healing pass over the whole menu
//
// Living in `db/` rather than `backend/` on purpose: `backend/shared.ts` already
// imports `db/client`, so the migration path cannot import back from there
// without a cycle. Both sides import this instead.
import type Database from 'better-sqlite3'
import { getSqlite } from './client'

/** Round to the stored precision, matching `r2` in backend/shared. */
const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * The cost of one product, computed from its recipes.
 *
 * Read-only: the caller decides when to write it, so a preview can show the
 * figure without storing it.
 */
export function productCostFromRecipe(productId: string, db: Database.Database = getSqlite()): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(c), 0) AS c FROM (
      SELECT r.quantity_per_unit * i.cost_per_unit AS c
      FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.product_id = ? AND r.ingredient_id IS NOT NULL
      UNION ALL
      SELECT r.quantity_per_unit * sri.quantity_per_unit * i.cost_per_unit AS c
      FROM recipes r
      JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = r.sub_recipe_id
      JOIN ingredients i ON i.id = sri.ingredient_id
      WHERE r.product_id = ?
    )
  `).get(productId, productId) as { c: number } | undefined
  return round2(Number(row?.c) || 0)
}

/** Writes one product's derived cost. The single writer of `cost_price`. */
export function writeProductCost(productId: string, db: Database.Database = getSqlite()): number {
  const cost = productCostFromRecipe(productId, db)
  db.prepare('UPDATE products SET cost_price = ? WHERE id = ?').run(cost, productId)
  return cost
}

/**
 * Recomputed every product's cost.
 *
 * Deliberately two steps — SELECT the raw sums, then round in JavaScript — rather
 * than one `UPDATE ... ROUND(...)`. SQLite's `ROUND` is not the same function as
 * JavaScript's: 57.565 becomes 57.56 there and 57.57 here, because 57.565 is not
 * representable in binary and the two round the stored double differently. One
 * product differing by a cent between the startup path and the write path is
 * exactly the sort of drift this module exists to prevent, so the rounding is
 * done once, in one language.
 */
export function recomputeAllProductCosts(db: Database.Database = getSqlite()): void {
  const rows = db.prepare(`
    SELECT p.id AS id, COALESCE((
      SELECT SUM(c) FROM (
        SELECT r.quantity_per_unit * i.cost_per_unit AS c
        FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
        WHERE r.product_id = p.id AND r.ingredient_id IS NOT NULL
        UNION ALL
        SELECT r.quantity_per_unit * sri.quantity_per_unit * i.cost_per_unit AS c
        FROM recipes r
        JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = r.sub_recipe_id
        JOIN ingredients i ON i.id = sri.ingredient_id
        WHERE r.product_id = p.id
      )
    ), 0) AS total
    FROM products p
  `).all() as { id: string; total: number }[]

  const update = db.prepare('UPDATE products SET cost_price = ? WHERE id = ?')
  db.transaction(() => {
    for (const row of rows) update.run(round2(Number(row.total) || 0), row.id)
  })()
}

/**
 * Products whose cost depends on one ingredient.
 *
 * Two routes: used directly in a product's recipe, or used inside a sub-recipe
 * that a product includes. Both must be walked — refreshing only the direct
 * users would leave every sauce and dough assembly stale.
 */
export function productsUsingIngredient(ingredientId: string, db: Database.Database = getSqlite()): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT product_id FROM recipes WHERE ingredient_id = ?
    UNION
    SELECT DISTINCT r.product_id FROM recipes r
    JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = r.sub_recipe_id
    WHERE sri.ingredient_id = ?
  `).all(ingredientId, ingredientId) as { product_id: string }[]
  return rows.map((row) => row.product_id)
}

/** Products that include one sub-recipe directly. */
export function productsUsingSubRecipe(subRecipeId: string, db: Database.Database = getSqlite()): string[] {
  const rows = db
    .prepare('SELECT DISTINCT product_id FROM recipes WHERE sub_recipe_id = ?')
    .all(subRecipeId) as { product_id: string }[]
  return rows.map((row) => row.product_id)
}

/** Refreshes a set of products, deduped. Returns how many were written. */
export function recomputeProducts(productIds: Iterable<string>, db: Database.Database = getSqlite()): number {
  const unique = new Set(productIds)
  for (const id of unique) writeProductCost(id, db)
  return unique.size
}

/** Refreshes every product touched by an ingredient change. */
export function recomputeForIngredient(ingredientId: string, db: Database.Database = getSqlite()): number {
  return recomputeProducts(productsUsingIngredient(ingredientId, db), db)
}

/** Refreshes every product that includes a sub-recipe. */
export function recomputeForSubRecipe(subRecipeId: string, db: Database.Database = getSqlite()): number {
  return recomputeProducts(productsUsingSubRecipe(subRecipeId, db), db)
}
