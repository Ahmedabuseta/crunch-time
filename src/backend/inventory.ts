// Inventory: ingredients, recipes, sub-recipes, restock, transactions.
import { and, eq, sql } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { deductInventory, listRecipeRows, now, recomputeProductCost, r2, uuid } from './shared'
import { hardDelete } from './shared'
import { requireAdmin } from './session'

const {
  ingredients, recipes, addonRecipes, modifierRecipes,
  inventoryTransactions, subRecipes, subRecipeIngredients,
  purchasePriceHistory,
} = schema

export function listIngredients() {
  const db = getDb()
  return db.select().from(ingredients).where(eq(ingredients.active, true))
}

export function createIngredient(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  db.insert(ingredients).values({ id, ...data, active: true }).run()
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
  db.update(ingredients).set(data).where(eq(ingredients.id, id)).run()
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

export function listRecipes(productId: string) {
  return listRecipeRows('recipes', 'product_id', productId)
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
  return db.select().from(ingredients)
    .where(and(eq(ingredients.active, true), sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`))
    .all()
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

export function restock(ingredientId: string, qty: number, note?: string, opts?: { unitCost?: number; packagePrice?: number; supplier?: string }) {
  requireAdmin()
  const db = getDb()
  const supplier = opts?.supplier?.trim() || null
  // The owner enters the price of the purchase package (e.g. a 1kg
  // bag); divide by the package size to get the per-stock-unit cost.
  // A raw unitCost is still accepted (API compatibility).
  const ing = db.select().from(ingredients).where(eq(ingredients.id, ingredientId)).get()
  const packQty = Number(ing?.purchaseQty) || 1
  const unitCost = opts?.packagePrice != null
    ? Number(opts.packagePrice) / (packQty > 0 ? packQty : 1)
    : (opts?.unitCost != null ? Number(opts.unitCost) : null)
  db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} + ${qty}` })
    .where(eq(ingredients.id, ingredientId)).run()
  db.insert(inventoryTransactions).values({
    id: uuid(), ingredientId, type: 'PURCHASE', quantity: qty, unitCost, supplier, note: note || 'إعادة تعبئة', createdAt: now(),
  }).run()
  if (ing && !ing.supplier && supplier) {
    db.update(ingredients).set({ supplier }).where(eq(ingredients.id, ingredientId)).run()
  }
  // Always record a price-history row so the purchase price variance report
  // reflects every purchase. Falls back to the ingredient's current cost.
  const effectiveUnitCost = unitCost != null ? unitCost : (ing?.costPerUnit || 0)
  if (effectiveUnitCost > 0) {
    db.insert(purchasePriceHistory).values({
      id: uuid(), ingredientId, supplier: supplier || ing?.supplier || null, unitCost: effectiveUnitCost, quantity: qty,
      purchasedAt: now().slice(0, 10), createdAt: now(),
    }).run()
  }
  if (unitCost != null) {
    const baseline = ing && ing.plannedCost > 0 ? ing.plannedCost : ing?.costPerUnit || 0
    const ppv = baseline > 0 ? (unitCost - baseline) * qty : 0
    return { ok: true, ppv: r2(ppv) }
  }
  return { ok: true }
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
  let running = r2(currentStock - newerTotal - sameTsNewer)
  const asc = [...rows].reverse()
  const withBal = asc.map(r => {
    const bal = running
    running = r2(running - (Number(r.quantity) || 0))
    return { ...r, quantity: Number(r.quantity) || 0, balance: bal }
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

export function deductForOrder(orderId: string) {
  deductInventory(orderId)
  return { ok: true }
}
