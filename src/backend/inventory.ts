// Inventory: ingredients, recipes, sub-recipes, restock, transactions.
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { deductInventory, expandRecipes, listRecipeRows, now, recomputeProductCost, r2, uuid } from './shared'
import { hardDelete } from './shared'
import { requireAdmin } from './session'
import { defaultStorageForCategory, normalizeCategory, normalizeStorage } from '../lib/inventory-taxonomy'

const {
  ingredients, recipes, addonRecipes, modifierRecipes,
  inventoryTransactions, subRecipes, subRecipeIngredients,
  purchasePriceHistory,
} = schema

type UsagePath = {
  ingredientId: string
  productId: string
  kind: 'base' | 'optional'
  link: string
}

/**
 * Every (ingredient → product) path, classified:
 *  - `base`: the product's own recipe (directly or through a sub-recipe), so
 *    the ingredient is consumed on every sale.
 *  - `optional`: the ingredient is only reachable through an addon or a
 *    modifier choice, so it is consumed only when the customer picks it.
 * Counting the two together made a single topping look like it was linked to
 * every product offering the addon list.
 */
function usagePaths(ingredientId?: string): UsagePath[] {
  const rows = getSqlite().prepare(`
    SELECT paths.ingredientId, paths.productId, paths.kind, paths.link
    FROM (
      SELECT r.ingredient_id AS ingredientId, r.product_id AS productId, 'base' AS kind,
             'وصفة مباشرة' AS link
      FROM recipes r
      UNION ALL
      SELECT sri.ingredient_id, r.product_id, 'base', 'وصفة فرعية: ' || sr.name
      FROM recipes r
      JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = r.sub_recipe_id
      JOIN sub_recipes sr ON sr.id = r.sub_recipe_id
      UNION ALL
      SELECT ar.ingredient_id, pa.product_id, 'optional', 'إضافة: ' || a.name
      FROM addon_recipes ar
      JOIN addons a ON a.id = ar.addon_id
      JOIN product_addons pa ON pa.addon_id = ar.addon_id
      UNION ALL
      SELECT sri.ingredient_id, pa.product_id, 'optional', 'إضافة: ' || a.name || ' · وصفة فرعية: ' || sr.name
      FROM addon_recipes ar
      JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = ar.sub_recipe_id
      JOIN sub_recipes sr ON sr.id = ar.sub_recipe_id
      JOIN addons a ON a.id = ar.addon_id
      JOIN product_addons pa ON pa.addon_id = ar.addon_id
      UNION ALL
      SELECT mr.ingredient_id, pmg.product_id, 'optional', 'خيار: ' || m.name
      FROM modifier_recipes mr
      JOIN modifiers m ON m.id = mr.modifier_id
      JOIN product_modifier_groups pmg ON pmg.modifier_group_id = m.modifier_group_id
      UNION ALL
      SELECT sri.ingredient_id, pmg.product_id, 'optional', 'خيار: ' || m.name || ' · وصفة فرعية: ' || sr.name
      FROM modifier_recipes mr
      JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = mr.sub_recipe_id
      JOIN sub_recipes sr ON sr.id = mr.sub_recipe_id
      JOIN modifiers m ON m.id = mr.modifier_id
      JOIN product_modifier_groups pmg ON pmg.modifier_group_id = m.modifier_group_id
    ) paths
    WHERE paths.ingredientId IS NOT NULL
    ${ingredientId ? 'AND paths.ingredientId = ?' : ''}
  `).all(...(ingredientId ? [ingredientId] : [])) as UsagePath[]
  return rows
}

function withProductCounts<T extends { id: string }>(
  rows: T[],
): (T & { productCount: number; recipeProductCount: number; optionalProductCount: number })[] {
  const base = new Map<string, Set<string>>()
  const optional = new Map<string, Set<string>>()
  for (const path of usagePaths()) {
    const target = path.kind === 'base' ? base : optional
    if (!target.has(path.ingredientId)) target.set(path.ingredientId, new Set())
    target.get(path.ingredientId)!.add(path.productId)
  }
  return rows.map(row => {
    const inBase = base.get(row.id) ?? new Set<string>()
    const onlyOptional = [...(optional.get(row.id) ?? [])].filter(id => !inBase.has(id))
    return {
      ...row,
      // A hidden product still holds the recipe link, so it counts as linked.
      productCount: inBase.size + onlyOptional.length,
      // Products whose recipe always consumes it.
      recipeProductCount: inBase.size,
      // Extra products where it is offered as an addon / modifier choice.
      optionalProductCount: onlyOptional.length,
    }
  })
}

export function listIngredients(opts?: { includeInactive?: boolean }) {
  const db = getDb()
  const rows = opts?.includeInactive
    ? db.select().from(ingredients).all()
    : db.select().from(ingredients).where(eq(ingredients.active, true)).all()
  return withProductCounts(rows)
}

/** Sortable ingredient fields. */
export const INGREDIENT_SORTS = {
  name: ingredients.name,
  stock: ingredients.stockQuantity,
  cost: ingredients.costPerUnit,
} as const

export type IngredientSortKey = keyof typeof INGREDIENT_SORTS

/**
 * A page of ingredients. `lowOnly` is what the inventory screen calls "تحت
 * الحد": at or below the minimum, which is the same condition the alerts use.
 */
export function listIngredientsPaged(options: {
  search?: string
  lowOnly?: boolean
  limit: number
  offset: number
  sort?: IngredientSortKey
  dir?: 'asc' | 'desc'
}) {
  const db = getDb()
  const conditions = [eq(ingredients.active, true)]
  if (options.search) {
    conditions.push(sql`LOWER(${ingredients.name}) LIKE ${`%${options.search.toLowerCase()}%`}`)
  }
  if (options.lowOnly) {
    conditions.push(sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`)
  }
  const where = and(...conditions)

  const total = Number(
    db.select({ count: sql<number>`COUNT(*)` }).from(ingredients).where(where).get()?.count ?? 0
  )
  const column = INGREDIENT_SORTS[options.sort ?? 'name']
  const items = db.select().from(ingredients).where(where)
    // The id is a tiebreaker, so two ingredients sharing a name cannot make
    // page 2 repeat a row from page 1.
    .orderBy(options.dir === 'desc' ? desc(column) : asc(column), asc(ingredients.id))
    .limit(options.limit)
    .offset(options.offset)
    .all() as any[]

  return { items: withProductCounts(items), total }
}

export function getIngredientById(id: string) {
  const db = getDb()
  return db.select().from(ingredients).where(eq(ingredients.id, id)).get() ?? null
}

export function createIngredient(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  const category = normalizeCategory(data?.category)
  const storage = normalizeStorage(data?.storage, category)
  const values = { ...data, id, category, storage, active: true }
  // Money is stored with at most two decimals.
  if (values.costPerUnit != null) values.costPerUnit = r2(Number(values.costPerUnit) || 0)
  db.insert(ingredients).values(values).run()
  if (Number(data?.stockQuantity) > 0) {
    db.insert(inventoryTransactions).values({
      id: uuid(), ingredientId: id, type: 'ADJUSTMENT', quantity: Number(data.stockQuantity), note: 'رصيد افتتاحي', createdAt: now(),
    }).run()
  }
  return { id }
}

export function updateIngredient(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  const current = getIngredientById(id)
  const patch = { ...data }
  if (patch.costPerUnit !== undefined) patch.costPerUnit = r2(Number(patch.costPerUnit) || 0)
  if (patch.category !== undefined) {
    patch.category = normalizeCategory(patch.category)
    if (patch.storage === undefined) patch.storage = defaultStorageForCategory(patch.category)
  }
  if (patch.storage !== undefined) {
    patch.storage = normalizeStorage(patch.storage, patch.category ?? current?.category)
  }
  db.update(ingredients).set(patch).where(eq(ingredients.id, id)).run()
  // A cost change must reach product costs immediately — the
  // startup recompute is not enough once the app is running.
  if (data?.costPerUnit != null) {
    const s = getSqlite()
    const productIds = s.prepare(`
      SELECT DISTINCT product_id FROM recipes WHERE ingredient_id = ?
      UNION
      SELECT DISTINCT r.product_id FROM recipes r
      JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = r.sub_recipe_id
      WHERE sri.ingredient_id = ?
    `).all(id, id) as { product_id: string }[]
    for (const { product_id } of productIds) recomputeProductCost(product_id)
  }
  return { ok: true }
}

export function deleteIngredient(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  const ingredient = db.select({ id: ingredients.id, name: ingredients.name, active: ingredients.active }).from(ingredients).where(eq(ingredients.id, id)).get()
  if (!ingredient) return { ok: false, error: 'المادة غير موجودة' }

  if (opts?.hard) {
    return hardDelete(
      'ingredients',
      id,
      [
        { countSql: 'SELECT COUNT(*) FROM inventory_transactions WHERE ingredient_id = ?', label: 'حركات مخزون' },
        { countSql: 'SELECT COUNT(*) FROM recipes WHERE ingredient_id = ?', label: 'وصفات منتجات' },
        { countSql: 'SELECT COUNT(*) FROM sub_recipe_ingredients WHERE ingredient_id = ?', label: 'وصفات فرعية' },
        { countSql: 'SELECT COUNT(*) FROM addon_recipes WHERE ingredient_id = ?', label: 'وصفات إضافات' },
        { countSql: 'SELECT COUNT(*) FROM modifier_recipes WHERE ingredient_id = ?', label: 'وصفات خيارات' },
        { countSql: 'SELECT COUNT(*) FROM purchase_price_history WHERE ingredient_id = ?', label: 'سجل أسعار شراء' },
      ],
    )
  }
  if (!ingredient.active) return { ok: false, error: 'المادة معطلة بالفعل' }

  const usedInProductRecipes = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.ingredientId, id)).limit(1).all().length > 0
  const usedInSubRecipes = db.select({ id: subRecipeIngredients.id }).from(subRecipeIngredients).where(eq(subRecipeIngredients.ingredientId, id)).limit(1).all().length > 0
  const usedInAddonRecipes = db.select({ id: addonRecipes.id }).from(addonRecipes).where(eq(addonRecipes.ingredientId, id)).limit(1).all().length > 0
  const usedInModifierRecipes = db.select({ id: modifierRecipes.id }).from(modifierRecipes).where(eq(modifierRecipes.ingredientId, id)).limit(1).all().length > 0

  if (usedInProductRecipes || usedInSubRecipes || usedInAddonRecipes || usedInModifierRecipes) {
    return { ok: false, error: 'لا يمكن تعطيل المادة لأنها مستخدمة في وصفات. احذف الارتباطات أولاً.' }
  }

  db.update(ingredients).set({ active: false }).where(eq(ingredients.id, id)).run()
  return { ok: true }
}

/**
 * Menu products an ingredient reaches, each with the paths that reach it:
 * direct recipe, through a sub-recipe, or through an addon/modifier recipe.
 */
export function listIngredientProducts(ingredientId: string) {
  const s = getSqlite()
  const products = new Map(
    (s.prepare('SELECT id, name, emoji, active FROM products').all() as any[]).map(p => [p.id, p]),
  )
  const byProduct = new Map<string, { id: string; name: string; emoji: string; active: boolean; inBase: boolean; links: string[] }>()
  for (const path of usagePaths(ingredientId)) {
    const product = products.get(path.productId)
    if (!product) continue
    let row = byProduct.get(product.id)
    if (!row) {
      row = { id: product.id, name: product.name, emoji: product.emoji, active: Boolean(product.active), inBase: false, links: [] }
      byProduct.set(product.id, row)
    }
    if (path.kind === 'base') row.inBase = true
    if (!row.links.includes(path.link)) row.links.push(path.link)
  }
  return [...byProduct.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}

export function setIngredientActive(id: string, active: boolean) {
  requireAdmin()
  const db = getDb()
  const ingredient = db.select({ id: ingredients.id }).from(ingredients).where(eq(ingredients.id, id)).get()
  if (!ingredient) return { ok: false, error: 'المادة غير موجودة' }
  db.update(ingredients).set({ active: Boolean(active) }).where(eq(ingredients.id, id)).run()
  return { ok: true }
}

export function listRecipes(productId: string) {
  return listRecipeRows('recipes', 'product_id', productId)
}

export function getRecipeById(id: string) {
  return getDb().select().from(recipes).where(eq(recipes.id, id)).get() ?? null
}

export function getSubRecipeIngredientById(id: string) {
  return getDb().select().from(subRecipeIngredients).where(eq(subRecipeIngredients.id, id)).get() ?? null
}

export function upsertRecipe(data: any) {
  requireAdmin()
  const db = getDb()
  if (data.id) {
    db.update(recipes).set({ ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit })
      .where(eq(recipes.id, data.id)).run()
    const row = db.select().from(recipes).where(eq(recipes.id, data.id)).get()
    if (row?.productId) recomputeProductCost(row.productId)
    return { id: data.id }
  }
  const id = uuid()
  db.insert(recipes).values({ id, productId: data.productId, ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit }).run()
  if (data.productId) recomputeProductCost(data.productId)
  return { id }
}

export function deleteRecipe(id: string) {
  requireAdmin()
  const db = getDb()
  const row = db.select({ id: recipes.id, productId: recipes.productId }).from(recipes).where(eq(recipes.id, id)).get()
  if (!row) return { ok: false, error: 'ارتباط الوصفة غير موجود' }
  db.delete(recipes).where(eq(recipes.id, id)).run()
  if (row.productId) recomputeProductCost(row.productId)
  return { ok: true }
}

export function getAlerts() {
  const db = getDb()
  const rows = db.select().from(ingredients)
    .where(and(eq(ingredients.active, true), sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`))
    .all()
  return withProductCounts(rows)
}

// ─── Sub-recipes (reusable prepared components) ──────────────
export function listSubRecipes() {
  const s = getSqlite()
  return s.prepare(`
    SELECT sr.id, sr.name, sr.unit, sr.active AS active,
           (SELECT COALESCE(SUM(i.cost_per_unit * sri.quantity_per_unit), 0)
            FROM sub_recipe_ingredients sri JOIN ingredients i ON i.id = sri.ingredient_id
            WHERE sri.sub_recipe_id = sr.id) AS costPerUnit,
           (SELECT COUNT(*) FROM sub_recipe_ingredients sri WHERE sri.sub_recipe_id = sr.id) AS ingredientCount
    FROM sub_recipes sr
    ORDER BY sr.name
  `).all()
}

export function upsertSubRecipe(data: { id?: string; name: string; unit: string; active?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (data.id) {
    db.update(subRecipes).set({ name: data.name, unit: data.unit, active: data.active ?? true }).where(eq(subRecipes.id, data.id)).run()
    return { id: data.id }
  }
  const id = uuid()
  db.insert(subRecipes).values({ id, name: data.name, unit: data.unit || 'وحدة', active: data.active ?? true, createdAt: now() }).run()
  return { id }
}

export function deleteSubRecipe(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  const row = db.select({ id: subRecipes.id, active: subRecipes.active }).from(subRecipes).where(eq(subRecipes.id, id)).get()
  if (!row) return { ok: false, error: 'الوصفة الفرعية غير موجودة' }

  if (opts?.hard) {
    return hardDelete(
      'sub_recipes',
      id,
      [
        { countSql: 'SELECT COUNT(*) FROM recipes WHERE sub_recipe_id = ?', label: 'وصفات منتجات' },
        { countSql: 'SELECT COUNT(*) FROM addon_recipes WHERE sub_recipe_id = ?', label: 'وصفات إضافات' },
        { countSql: 'SELECT COUNT(*) FROM modifier_recipes WHERE sub_recipe_id = ?', label: 'وصفات خيارات' },
      ],
      ['DELETE FROM sub_recipe_ingredients WHERE sub_recipe_id = ?'],
    )
  }
  if (!row.active) return { ok: false, error: 'الوصفة الفرعية معطلة بالفعل' }

  const usedInProducts = db.select({ id: recipes.id }).from(recipes).where(eq(recipes.subRecipeId, id)).limit(1).all().length > 0
  const usedInAddons = db.select({ id: addonRecipes.id }).from(addonRecipes).where(eq(addonRecipes.subRecipeId, id)).limit(1).all().length > 0
  const usedInModifiers = db.select({ id: modifierRecipes.id }).from(modifierRecipes).where(eq(modifierRecipes.subRecipeId, id)).limit(1).all().length > 0
  if (usedInProducts || usedInAddons || usedInModifiers) {
    return { ok: false, error: 'لا يمكن تعطيل الوصفة الفرعية لأنها مرتبطة بمنتجات/إضافات/خيارات.' }
  }

  db.update(subRecipes).set({ active: false }).where(eq(subRecipes.id, id)).run()
  return { ok: true }
}

export function listSubRecipeIngredients(subRecipeId: string) {
  const s = getSqlite()
  return s.prepare(`
    SELECT sri.id, sri.sub_recipe_id AS subRecipeId, sri.ingredient_id AS ingredientId,
           sri.quantity_per_unit AS quantityPerUnit, i.name AS ingredientName,
           i.unit, i.cost_per_unit AS costPerUnit,
           i.cost_per_unit * sri.quantity_per_unit AS lineCost
    FROM sub_recipe_ingredients sri JOIN ingredients i ON i.id = sri.ingredient_id
    WHERE sri.sub_recipe_id = ?
    ORDER BY i.name
  `).all(subRecipeId)
}

export function upsertSubRecipeIngredient(data: { id?: string; subRecipeId: string; ingredientId: string; quantityPerUnit: number }) {
  requireAdmin()
  const db = getDb()
  if (data.id) {
    db.update(subRecipeIngredients).set({ ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit })
      .where(eq(subRecipeIngredients.id, data.id)).run()
    return { id: data.id }
  }
  const id = uuid()
  db.insert(subRecipeIngredients).values({ id, subRecipeId: data.subRecipeId, ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit }).run()
  return { id }
}

export function deleteSubRecipeIngredient(id: string) {
  requireAdmin()
  const db = getDb()
  const row = db.select({ id: subRecipeIngredients.id }).from(subRecipeIngredients).where(eq(subRecipeIngredients.id, id)).get()
  if (!row) return { ok: false, error: 'ارتباط المادة غير موجود' }
  db.delete(subRecipeIngredients).where(eq(subRecipeIngredients.id, id)).run()
  return { ok: true }
}

export function getPurchaseSavings() {
  const s = getSqlite()
  const rows = s.prepare(`
    SELECT ph.ingredient_id AS ingredientId, ph.unit_cost AS unitCost, ph.quantity AS quantity,
           i.cost_per_unit AS costPerUnit, i.name AS name
    FROM purchase_price_history ph
    JOIN ingredients i ON i.id = ph.ingredient_id
    ORDER BY ph.purchased_at DESC, ph.created_at DESC
  `).all() as any[]
  const out: Record<string, { name: string; standard: number; lastUnitCost: number | null; totalSaved: number }> = {}
  for (const r of rows) {
    const standard = r.costPerUnit || 0
    if (!out[r.ingredientId]) {
      out[r.ingredientId] = { name: r.name, standard, lastUnitCost: null, totalSaved: 0 }
    }
    if (out[r.ingredientId].lastUnitCost == null) out[r.ingredientId].lastUnitCost = r.unitCost
    if (standard > r.unitCost && r.quantity) {
      out[r.ingredientId].totalSaved += (standard - r.unitCost) * r.quantity
    }
  }
  for (const k of Object.keys(out)) out[k].totalSaved = r2(out[k].totalSaved)
  return out
}

export function restock(
  ingredientId: string,
  qty: number,
  note?: string,
  opts?: { unitCost?: number; packagePrice?: number; totalPrice?: number; supplier?: string; byQuantity?: boolean },
) {
  requireAdmin()
  const db = getDb()
  const supplier = opts?.supplier?.trim() || null
  // Two ways to receive stock: the usual purchase PACKAGES (cartons, jars,
  // bags — qty × pack size), or a direct quantity in the ingredient's own
  // unit (e.g. 300 g of a loose item).
  const ing = db.select().from(ingredients).where(eq(ingredients.id, ingredientId)).get()
  const packQty = Number(ing?.purchaseQty) || 1
  const byQuantity = Boolean(opts?.byQuantity)
  const amount = Math.abs(Number(qty) || 0)
  const stockQty = byQuantity ? amount : amount * (packQty > 0 ? packQty : 1)
  const rawUnitCost = byQuantity
    ? (opts?.totalPrice != null && stockQty > 0
        ? Number(opts.totalPrice) / stockQty
        : (opts?.unitCost != null ? Number(opts.unitCost) : null))
    : (opts?.packagePrice != null
        ? Number(opts.packagePrice) / (packQty > 0 ? packQty : 1)
        : (opts?.unitCost != null ? Number(opts.unitCost) : null))
  // Prices are money: never persist more than two decimals.
  const unitCost = rawUnitCost != null && Number.isFinite(rawUnitCost) ? r2(rawUnitCost) : null
  db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} + ${stockQty}` })
    .where(eq(ingredients.id, ingredientId)).run()
  db.insert(inventoryTransactions).values({
    id: uuid(), ingredientId, type: 'PURCHASE', quantity: stockQty,
    unitCost, supplier,
    note: byQuantity
      ? `${r2(stockQty)} (كمية مباشرة)${note ? ` — ${note}` : ''}`
      : `${amount} ${amount === 1 ? 'عبوة' : 'عبوات'} × ${packQty}${note ? ` — ${note}` : ''}`,
    createdAt: now(),
  }).run()
  if (ing && !ing.supplier && supplier) {
    db.update(ingredients).set({ supplier }).where(eq(ingredients.id, ingredientId)).run()
  }
  // Every restock is a purchase record, even before the owner knows the
  // price (unit cost 0) — the purchase count and spend report must see it.
  const effectiveUnitCost = unitCost != null ? unitCost : r2(ing?.costPerUnit || 0)
  db.insert(purchasePriceHistory).values({
    id: uuid(), ingredientId, supplier: supplier || ing?.supplier || null, unitCost: effectiveUnitCost, quantity: stockQty,
    purchasedAt: now().slice(0, 10), createdAt: now(),
  }).run()
  if (unitCost != null) {
    const baseline = ing && ing.plannedCost > 0 ? ing.plannedCost : ing?.costPerUnit || 0
    const ppv = baseline > 0 ? (unitCost - baseline) * stockQty : 0
    return { ok: true, ppv: r2(ppv) }
  }
  return { ok: true }
}

export function consumptionSummary(opts?: { from?: string; to?: string }) {
  const s = getSqlite()
  const from = opts?.from || null
  const to = opts?.to || null
  const conds = ["t.type IN ('CONSUMPTION', 'WASTE', 'ADJUSTMENT')"]
  const params: any[] = []
  if (from) { conds.push('t.created_at >= ?'); params.push(from) }
  if (to) { conds.push('t.created_at <= ?'); params.push(to + '￿') }

  const rows = s.prepare(`
    SELECT i.id AS ingredientId, i.name, i.unit, i.stock_quantity AS stock,
           i.cost_per_unit AS unitCost, i.category, i.storage, i.active,
           COALESCE(SUM(CASE WHEN t.type = 'CONSUMPTION' THEN -t.quantity ELSE 0 END), 0) AS consumed,
           COALESCE(SUM(CASE WHEN t.type = 'WASTE' THEN -t.quantity ELSE 0 END), 0) AS waste,
           COALESCE(SUM(CASE WHEN t.type = 'ADJUSTMENT' THEN t.quantity ELSE 0 END), 0) AS adjustment,
           COUNT(DISTINCT CASE WHEN t.type = 'CONSUMPTION' THEN t.reference_order_id END) AS orderCount,
           MIN(CASE WHEN t.type = 'CONSUMPTION' THEN t.created_at END) AS firstConsumedAt,
           MAX(CASE WHEN t.type = 'CONSUMPTION' THEN t.created_at END) AS lastConsumedAt
    FROM ingredients i
    LEFT JOIN inventory_transactions t ON t.ingredient_id = i.id AND ${conds.join(' AND ')}
    GROUP BY i.id
    ORDER BY i.name
  `).all(...params) as any[]

  const used = rows.filter(r => Number(r.consumed) > 0 || Number(r.waste) > 0)

  // Per-day averages share one window: the requested range, or the span the
  // recorded consumption actually covers when no range was given.
  const firsts = used.map(r => r.firstConsumedAt).filter(Boolean).sort() as string[]
  const lasts = used.map(r => r.lastConsumedAt).filter(Boolean).sort() as string[]
  const windowStart = from || (firsts[0] ? firsts[0].slice(0, 10) : null)
  const windowEnd = to || (lasts.length ? lasts[lasts.length - 1].slice(0, 10) : null)
  const days = windowStart && windowEnd
    ? Math.max(1, Math.round((Date.parse(windowEnd) - Date.parse(windowStart)) / 86400000) + 1)
    : null

  let totalCost = 0
  let totalWasteCost = 0
  const mapped = used.map(r => {
    const unitCost = Number(r.unitCost) || 0
    const stock = Number(r.stock) || 0
    const consumed = r2(Number(r.consumed) || 0)
    const waste = r2(Number(r.waste) || 0)
    const cost = r2(consumed * unitCost)
    const wasteCost = r2(waste * unitCost)
    const avgDaily = days ? r2(consumed / days) : 0
    totalCost += cost
    totalWasteCost += wasteCost
    return {
      ingredientId: r.ingredientId,
      name: r.name,
      unit: r.unit,
      category: r.category,
      storage: r.storage,
      active: Boolean(r.active),
      stock: r2(stock),
      unitCost: r2(unitCost),
      consumed,
      waste,
      adjustment: r2(Number(r.adjustment) || 0),
      orderCount: Number(r.orderCount) || 0,
      cost,
      wasteCost,
      avgDaily,
      daysCover: avgDaily > 0 ? r2(Math.max(0, stock) / avgDaily) : null,
      lastConsumedAt: r.lastConsumedAt || null,
    }
  }).sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name, 'ar'))

  return {
    from,
    to,
    days,
    rows: mapped,
    totals: {
      cost: r2(totalCost),
      wasteCost: r2(totalWasteCost),
      ingredients: mapped.length,
    },
  }
}

/**
 * Rebuild missing CONSUMPTION rows for historical orders.
 *
 * - Never touches `stock_quantity`: this is a reporting backfill, not a new
 *   deduction, so the current stock the owner counted stays intact.
 * - Idempotent: an order that already has any CONSUMPTION row is skipped, so
 *   running the tool twice can never double-count.
 * - Quantities come from the same recipe tree the live checkout uses
 *   (product recipe + sub-recipes + selected addons/modifiers).
 */
export function backfillConsumption(opts?: {
  from?: string
  to?: string
  statuses?: string[]
  orderType?: string
  dryRun?: boolean
}) {
  requireAdmin()
  const s = getSqlite()
  const statuses = opts?.statuses?.length ? opts.statuses : ['COMPLETED']
  const params: any[] = [...statuses]
  const conds = [`o.status IN (${statuses.map(() => '?').join(', ')})`]
  if (opts?.from) { conds.push('o.created_at >= ?'); params.push(opts.from) }
  if (opts?.to) { conds.push('o.created_at <= ?'); params.push(opts.to + '￿') }
  if (opts?.orderType) { conds.push('o.order_type = ?'); params.push(opts.orderType) }

  const orders = s.prepare(`
    SELECT o.id,
           EXISTS (
             SELECT 1 FROM inventory_transactions t
             WHERE t.reference_order_id = o.id AND t.type = 'CONSUMPTION'
           ) AS hasConsumption
    FROM orders o
    WHERE ${conds.join(' AND ')}
    ORDER BY o.created_at, o.id
  `).all(...params) as { id: string; hasConsumption: number }[]

  const eligible = orders.filter(o => !o.hasConsumption)
  const alreadyCounted = orders.length - eligible.length

  const itemsStmt = s.prepare(
    'SELECT product_id, quantity, selected_addons_json, selected_modifiers_json FROM order_items WHERE order_id = ?',
  )
  const recipesStmt = s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM recipes WHERE product_id = ?')
  const addonStmt = s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM addon_recipes WHERE addon_id = ?')
  const modifierStmt = s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM modifier_recipes WHERE modifier_id = ?')

  const pending = new Map<string, Map<string, number>>()
  for (const order of eligible) {
    const totals = new Map<string, number>()
    const bump = (ingredientId: string, qty: number) => {
      if (qty > 0) totals.set(ingredientId, (totals.get(ingredientId) || 0) + qty)
    }
    for (const item of itemsStmt.all(order.id) as any[]) {
      const quantity = Number(item.quantity) || 0
      if (quantity <= 0) continue
      for (const c of expandRecipes(recipesStmt.all(item.product_id) as any[])) bump(c.ingredientId, c.qty * quantity)
      if (item.selected_addons_json) {
        try {
          for (const addonId of JSON.parse(item.selected_addons_json) as string[]) {
            for (const c of expandRecipes(addonStmt.all(addonId) as any[])) bump(c.ingredientId, c.qty * quantity)
          }
        } catch { /* malformed JSON on an old row — skip that part */ }
      }
      if (item.selected_modifiers_json) {
        try {
          for (const mod of JSON.parse(item.selected_modifiers_json) as { modifierId: string }[]) {
            for (const c of expandRecipes(modifierStmt.all(mod.modifierId) as any[])) bump(c.ingredientId, c.qty * quantity)
          }
        } catch { /* same */ }
      }
    }
    if (totals.size > 0) pending.set(order.id, totals)
  }

  const ingredientTotals = new Map<string, number>()
  for (const totals of pending.values()) {
    for (const [ingredientId, qty] of totals) {
      ingredientTotals.set(ingredientId, (ingredientTotals.get(ingredientId) || 0) + qty)
    }
  }

  let cost = 0
  const costStmt = s.prepare('SELECT cost_per_unit AS unitCost FROM ingredients WHERE id = ?')
  for (const [ingredientId, qty] of ingredientTotals) {
    const unitCost = Number((costStmt.get(ingredientId) as any)?.unitCost) || 0
    cost += qty * unitCost
  }

  let inserted = 0
  if (!opts?.dryRun && pending.size > 0) {
    const insert = s.prepare(
      `INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at)
       VALUES (?, ?, 'CONSUMPTION', ?, ?, ?, ?)`,
    )
    const check = s.prepare(
      "SELECT 1 FROM inventory_transactions WHERE reference_order_id = ? AND type = 'CONSUMPTION' LIMIT 1",
    )
    const run = s.transaction(() => {
      for (const [orderId, totals] of pending) {
        // Re-check inside the write transaction: an order that gained a real
        // consumption row after the scan must not be counted a second time.
        if (check.get(orderId)) continue
        for (const [ingredientId, qty] of totals) {
          insert.run(uuid(), ingredientId, -r2(qty), orderId, `احتساب طلب قديم — ${orderId}`, now())
          inserted += 1
        }
      }
    })
    run()
  }

  return {
    ok: true,
    dryRun: Boolean(opts?.dryRun),
    matchedOrders: orders.length,
    alreadyCounted,
    readyOrders: pending.size,
    noRecipeOrders: eligible.length - pending.size,
    ingredients: ingredientTotals.size,
    inserted,
    cost: r2(cost),
  }
}

export function listTransactions(ingredientId: string, filters?: { type?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
  const s = getSqlite()
  const ingredient = s.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingredientId) as any
  if (!ingredient) return { ingredient: null, currentStock: 0, openingBalance: 0, movements: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
  const conds = ['t.ingredient_id = ?']
  const params: any[] = [ingredientId]
  if (filters?.type) { conds.push('t.type = ?'); params.push(filters.type) }
  if (filters?.from) { conds.push('t.created_at >= ?'); params.push(filters.from) }
  if (filters?.to) { conds.push('t.created_at <= ?'); params.push(filters.to + '￿') }
  const where = `WHERE ${conds.join(' AND ')}`
  const total = (s.prepare(`SELECT COUNT(*) as c FROM inventory_transactions t ${where}`).get(...params) as any).c
  const pageSize = Math.min(Math.max(filters?.pageSize || 20, 5), 100)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(filters?.page || 1, 1), totalPages)
  const offset = (page - 1) * pageSize
  const rows = s.prepare(`
    SELECT t.id, t.ingredient_id AS ingredientId, t.type, t.quantity,
           t.unit_cost AS unitCost, t.supplier,
           t.reference_order_id AS referenceOrderId, t.note, t.created_at AS createdAt
    FROM inventory_transactions t
    ${where}
    ORDER BY t.created_at DESC, t.rowid DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as any[]
  const currentStock = Number(ingredient.stock_quantity) || 0
  const grandTotal = (s.prepare(`SELECT COALESCE(SUM(quantity), 0) as t FROM inventory_transactions t ${where}`).get(...params) as any).t || 0
  // Balance-after per row: walk backwards from current stock over strictly-newer movements
  const newerIds = rows.length ? rows.map(r => `'${String(r.id).replace(/'/g, "''")}'`).join(',') : null
  const newerTotal = newerIds
    ? ((s.prepare(`SELECT COALESCE(SUM(quantity), 0) as t FROM inventory_transactions t ${where} AND t.created_at > (SELECT MIN(created_at) FROM inventory_transactions WHERE id IN (${newerIds}))`).get(...params) as any).t || 0)
    : 0
  const sameTsNewer = newerIds
    ? ((s.prepare(`SELECT COALESCE(SUM(quantity), 0) as t FROM inventory_transactions t ${where} AND t.created_at = (SELECT MIN(created_at) FROM inventory_transactions WHERE id IN (${newerIds})) AND t.id NOT IN (${newerIds})`).get(...params) as any).t || 0)
    : 0
  // `running` starts as the balance AFTER the oldest row on this page, then
  // walks forward in time by adding each following row's quantity. (The old
  // code subtracted instead, so every balance after the oldest was wrong.)
  let running = r2(currentStock - newerTotal - sameTsNewer)
  const asc = [...rows].reverse()
  const withBal = asc.map((r, index) => {
    const qty = Number(r.quantity) || 0
    if (index > 0) running = r2(running + qty)
    return { ...r, quantity: qty, balance: running }
  })
  const movements = withBal.reverse()
  return { ingredient, currentStock, openingBalance: r2(currentStock - grandTotal), movements, total, page, pageSize, totalPages }
}

export function recordWaste(ingredientId: string, qty: number, note?: string) {
  requireAdmin()
  const db = getDb()
  const amount = -Math.abs(Number(qty) || 0)
  db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} + ${amount}` })
    .where(eq(ingredients.id, ingredientId)).run()
  db.insert(inventoryTransactions).values({
    id: uuid(), ingredientId, type: 'WASTE', quantity: amount, note: note || 'تالف', createdAt: now(),
  }).run()
  return { ok: true }
}

export function adjust(ingredientId: string, delta: number, note?: string) {
  requireAdmin()
  const db = getDb()
  const qty = Number(delta) || 0
  db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} + ${qty}` })
    .where(eq(ingredients.id, ingredientId)).run()
  db.insert(inventoryTransactions).values({
    id: uuid(), ingredientId, type: 'ADJUSTMENT', quantity: qty, note: note || 'تسوية يدوية', createdAt: now(),
  }).run()
  return { ok: true }
}

// Owner swap: return what's left of the old brand and take in a new brand
// with its own price — one dialog, stock entries go both ways and the
// ledger records each side (RETURN on the old, PURCHASE on the new).
export function exchange(input: {
  fromIngredientId: string
  fromPackages: number
  toIngredientId: string
  toPackages: number
  packagePrice?: number
  supplier?: string
  note?: string
}) {
  requireAdmin()
  const db = getDb()
  const note = input.note?.trim() || 'مبادلة'
  const from = db.select().from(ingredients).where(eq(ingredients.id, input.fromIngredientId)).get()
  const to = db.select().from(ingredients).where(eq(ingredients.id, input.toIngredientId)).get()
  if (!from || !to) return { ok: false, error: 'المادة غير موجودة' }

  const fromPack = Number(from.purchaseQty) || 1
  const toPack = Number(to.purchaseQty) || 1
  const fromPackages = Math.abs(Number(input.fromPackages) || 0)
  const toPackages = Math.abs(Number(input.toPackages) || 0)
  if (fromPackages === 0 && toPackages === 0) return { ok: false, error: 'حدد الكميات أولاً' }

  const stockNow = (ing: { stockQuantity: number }) => Number(ing.stockQuantity) || 0
  const fromStockQty = fromPackages * fromPack
  const toStockQty = toPackages * toPack

  if (fromStockQty > 0 && fromStockQty > stockNow(from)) {
    return { ok: false, error: `الكمية المرتجعة أكبر من المخزون المتاح (${fmtStock(stockNow(from))} ${from.unit})` }
  }

  // Old brand goes back: stock down, ledger documents the return.
  if (fromStockQty > 0) {
    db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} - ${fromStockQty}` })
      .where(eq(ingredients.id, from.id)).run()
    db.insert(inventoryTransactions).values({
      id: uuid(), ingredientId: from.id, type: 'RETURN', quantity: -fromStockQty,
      unitCost: from.costPerUnit || 0,
      note: `${note} — ${fromPackages} ${fromPackages === 1 ? 'عبوة' : 'عبوات'} × ${fromPack} → ${to.name}`,
      createdAt: now(),
    }).run()
  }

  // New brand comes in: stock up, priced per the new invoice.
  let ppv: number | null = null
  if (toStockQty > 0) {
    const toUnitCost = input.packagePrice != null && Number(input.packagePrice) > 0
      ? Number(input.packagePrice) / toPack
      : null
    const supplier = input.supplier?.trim() || null
    db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} + ${toStockQty}` })
      .where(eq(ingredients.id, to.id)).run()
    db.insert(inventoryTransactions).values({
      id: uuid(), ingredientId: to.id, type: 'PURCHASE', quantity: toStockQty,
      unitCost: toUnitCost || to.costPerUnit || 0, supplier,
      note: `${note} — ${toPackages} ${toPackages === 1 ? 'عبوة' : 'عبوات'} × ${toPack} ← ${from.name}`,
      createdAt: now(),
    }).run()
    if (!to.supplier && supplier) {
      db.update(ingredients).set({ supplier }).where(eq(ingredients.id, to.id)).run()
    }
    if (toUnitCost != null) {
      db.insert(purchasePriceHistory).values({
        id: uuid(), ingredientId: to.id, supplier: supplier || to.supplier || null,
        unitCost: toUnitCost, quantity: toStockQty, purchasedAt: now().slice(0, 10), createdAt: now(),
      }).run()
      const baseline = to.plannedCost > 0 ? to.plannedCost : to.costPerUnit || 0
      if (baseline > 0) ppv = r2((toUnitCost - baseline) * toStockQty)
    }
  }

  return { ok: true, ppv }
}

const fmtStock = (n: number) => Math.round(n * 100) / 100

export function deductForOrder(orderId: string) {
  deductInventory(orderId)
  return { ok: true }
}
