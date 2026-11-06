// Catalog: categories + products.
import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { uuid } from './shared'
import { requireAdmin } from './session'
import { hardDelete } from './shared'

const { categories, products, productAddons, productModifierGroups, recipes } = schema

const productColumns = getTableColumns(products)
const productCounts = {
  addonCount: sql<number>`(SELECT COUNT(*) FROM product_addons pa WHERE pa.product_id = ${products.id})`,
  modifierCount: sql<number>`(SELECT COUNT(*) FROM product_modifier_groups pmg WHERE pmg.product_id = ${products.id})`,
  recipeCount: sql<number>`(SELECT COUNT(*) FROM recipes r WHERE r.product_id = ${products.id})`,
}

function ensureCategory(categoryId: string): void {
  const row = getDb().select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).get()
  if (!row) throw new Error('القسم غير موجود')
}

function cleanProduct(data: any, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (!partial || data.name !== undefined) {
    const name = String(data.name ?? '').trim()
    if (!name) throw new Error('اسم المنتج مطلوب')
    out.name = name
  }

  if (!partial || data.price !== undefined) {
    const price = Number(data.price)
    if (!Number.isFinite(price) || price < 0) throw new Error('سعر المنتج غير صالح')
    out.price = price
  }

  if (!partial || data.categoryId !== undefined) {
    const categoryId = String(data.categoryId ?? '').trim()
    if (!categoryId) throw new Error('القسم مطلوب')
    out.categoryId = categoryId
  }

  if (!partial || data.emoji !== undefined) out.emoji = String(data.emoji ?? '').trim() || '🍽️'
  if (!partial || data.description !== undefined) out.description = String(data.description ?? '').trim()

  if (data.costPrice !== undefined) {
    const cost = Number(data.costPrice)
    if (!Number.isFinite(cost) || cost < 0) throw new Error('تكلفة المنتج غير صالحة')
    out.costPrice = cost
  }
  if (data.active !== undefined) out.active = Boolean(data.active)
  if (data.supportsRollback !== undefined) out.supportsRollback = Boolean(data.supportsRollback)
  return out
}

export function listCategories() {
  const db = getDb()
  return db.select().from(categories).where(eq(categories.active, true)).orderBy(categories.sortOrder, categories.name)
}

/** One category, for the edit form — which otherwise had to download the whole
 * list and search it, and would miss the record once the list pages. */
export function getCategoryById(id: string) {
  const db = getDb()
  return db.select().from(categories).where(eq(categories.id, id)).get() ?? null
}

export function createCategory(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  const maxOrderRow = db.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(categories).get()
  const maxOrder = maxOrderRow?.max ?? 0
  const sortOrder = typeof data.sortOrder === 'number' && !isNaN(data.sortOrder) ? data.sortOrder : maxOrder + 1
  db.insert(categories).values({ id, ...data, sortOrder, active: true }).run()
  return { id }
}

export function updateCategory(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  db.update(categories).set(data).where(eq(categories.id, id)).run()
  return { ok: true }
}

export function deleteCategory(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const sqlite = getSqlite()
  if (opts?.hard) {
    return hardDelete(
      'categories',
      id,
      [{ countSql: 'SELECT COUNT(*) FROM products WHERE category_id = ?', label: 'منتجات' }],
      ['DELETE FROM station_categories WHERE category_id = ?'],
    )
  }
  const removeCategory = sqlite.transaction(() => {
    const category = sqlite.prepare('SELECT id FROM categories WHERE id = ?').get(id) as { id: string } | undefined
    if (!category) return { ok: false, error: 'القسم غير موجود' }
    const activeProductsCount = (sqlite.prepare('SELECT COUNT(*) AS count FROM products WHERE category_id = ? AND active = 1').get(id) as { count: number }).count
    if (activeProductsCount > 0) {
      return { ok: false, error: 'لا يمكن تعطيل القسم وفيه منتجات نشطة. عطّل المنتجات أولاً.' }
    }
    sqlite.prepare('UPDATE categories SET active = 0 WHERE id = ?').run(id)
    sqlite.prepare('DELETE FROM station_categories WHERE category_id = ?').run(id)
    return { ok: true }
  })
  return removeCategory()
}

export function reorderCategories(ids: string[]) {
  requireAdmin()
  const sqlite = getSqlite()
  const updateOrder = sqlite.prepare('UPDATE categories SET sort_order = ? WHERE id = ?')
  sqlite.transaction(() => {
    ids.forEach((id, i) => {
      updateOrder.run(i + 1, id)
    })
  })()
  return { ok: true }
}

export function listProducts(categoryId?: string, includeInactive?: boolean) {
  const db = getDb()
  const where = includeInactive
    ? (categoryId ? eq(products.categoryId, categoryId) : undefined)
    : (categoryId ? and(eq(products.active, true), eq(products.categoryId, categoryId)) : eq(products.active, true))
  const query = db.select({ ...productColumns, ...productCounts }).from(products)
  return where ? query.where(where).all() : query.all()
}

/** Sortable product fields. A client sends one of these names and the route maps
 * it to a column, so a client-supplied string never reaches SQL. */
export const PRODUCT_SORTS = {
  name: products.name,
  price: products.price,
  cost: products.costPrice,
} as const

export type ProductSortKey = keyof typeof PRODUCT_SORTS

/**
 * A page of products. Search, filters, ordering and the count all happen in SQL
 * before the limit, so `total` is the size of the whole match and the sort is
 * over every matching row rather than only this page.
 */
export function listProductsPaged(options: {
  categoryId?: string
  search?: string
  /** Admin lists need the retired rows too; the till menu leaves this off. */
  includeInactive?: boolean
  /** Explicit status filter; overrides `includeInactive` when set. */
  active?: boolean
  limit: number
  offset: number
  sort?: ProductSortKey
  dir?: 'asc' | 'desc'
}) {
  const db = getDb()
  const conditions: any[] = []
  if (options.active === true) conditions.push(eq(products.active, true))
  else if (options.active === false) conditions.push(eq(products.active, false))
  else if (!options.includeInactive) conditions.push(eq(products.active, true))
  if (options.categoryId) conditions.push(eq(products.categoryId, options.categoryId))
  if (options.search) {
    conditions.push(sql`LOWER(${products.name}) LIKE ${`%${options.search.toLowerCase()}%`}`)
  }
  const where = conditions.length ? and(...conditions) : undefined

  const total = Number(
    db.select({ count: sql<number>`COUNT(*)` }).from(products).where(where).get()?.count ?? 0
  )
  const column = PRODUCT_SORTS[options.sort ?? 'name']
  const items = db.select({ ...productColumns, ...productCounts }).from(products).where(where)
    // The id is a tiebreaker: two products with the same name would otherwise
    // order arbitrarily between queries, and page 2 could repeat a row.
    .orderBy(options.dir === 'desc' ? desc(column) : asc(column), asc(products.id))
    .limit(options.limit)
    .offset(options.offset)
    .all() as any[]

  return { items, total }
}

/** Sortable category fields. */
export const CATEGORY_SORTS = {
  name: categories.name,
  sortOrder: categories.sortOrder,
} as const

export type CategorySortKey = keyof typeof CATEGORY_SORTS

export function listCategoriesPaged(options: {
  search?: string
  limit: number
  offset: number
  sort?: CategorySortKey
  dir?: 'asc' | 'desc'
}) {
  const db = getDb()
  const conditions = [eq(categories.active, true)]
  if (options.search) {
    conditions.push(sql`LOWER(${categories.name}) LIKE ${`%${options.search.toLowerCase()}%`}`)
  }
  const where = and(...conditions)

  const total = Number(
    db.select({ count: sql<number>`COUNT(*)` }).from(categories).where(where).get()?.count ?? 0
  )
  // Categories are authored in a deliberate order, so that stays the default.
  const column = CATEGORY_SORTS[options.sort ?? 'sortOrder']
  const dir = options.dir ?? 'asc'
  const items = db.select().from(categories).where(where)
    .orderBy(dir === 'desc' ? desc(column) : asc(column), asc(categories.name), asc(categories.id))
    .limit(options.limit)
    .offset(options.offset)
    .all() as any[]

  return { items, total }
}

export function getProductById(id: string) {
  const db = getDb()
  return db.select().from(products).where(eq(products.id, id)).get()
}

export function createProduct(data: any) {
  requireAdmin()
  const clean = cleanProduct(data, false)
  ensureCategory(String(clean.categoryId))
  const db = getDb()
  const id = uuid()
  db.insert(products).values({ id, ...clean } as any).run()
  return { id }
}

export function updateProduct(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  if (!db.select({ id: products.id }).from(products).where(eq(products.id, id)).get()) {
    throw new Error('المنتج غير موجود')
  }
  const clean = cleanProduct(data, true)
  if (clean.categoryId !== undefined) ensureCategory(String(clean.categoryId))
  if (Object.keys(clean).length > 0) db.update(products).set(clean as any).where(eq(products.id, id)).run()
  return { ok: true }
}

/** Copy a product's catalogue row, its option links and its recipe. */
export function duplicateProduct(id: string) {
  requireAdmin()
  const db = getDb()
  const source = db.select().from(products).where(eq(products.id, id)).get()
  if (!source) throw new Error('المنتج غير موجود')

  const newId = uuid()
  db.transaction((tx) => {
    tx.insert(products).values({ ...source, id: newId, name: `${source.name} (نسخة)`, active: false }).run()
    for (const link of tx.select().from(productAddons).where(eq(productAddons.productId, id)).all()) {
      tx.insert(productAddons).values({ productId: newId, addonId: link.addonId }).run()
    }
    for (const link of tx.select().from(productModifierGroups).where(eq(productModifierGroups.productId, id)).all()) {
      tx.insert(productModifierGroups).values({ productId: newId, modifierGroupId: link.modifierGroupId }).run()
    }
    for (const line of tx.select().from(recipes).where(eq(recipes.productId, id)).all()) {
      tx.insert(recipes).values({ ...line, id: uuid(), productId: newId }).run()
    }
  })
  return { id: newId }
}

export function deleteProduct(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    return hardDelete(
      'products',
      id,
      [{ countSql: 'SELECT COUNT(*) FROM order_items WHERE product_id = ?', label: 'طلبات سابقة' }],
      [
        'DELETE FROM product_addons WHERE product_id = ?',
        'DELETE FROM product_modifier_groups WHERE product_id = ?',
        'DELETE FROM recipes WHERE product_id = ?',
        // Configuration join rows — deleting a product drops
        // it out of any discount rotation (that day then
        // reports no product until the admin re-picks one).
        'DELETE FROM discount_day_products WHERE product_id = ?',
      ],
    )
  }
  const row = db.select({ id: products.id }).from(products).where(eq(products.id, id)).get()
  if (!row) return { ok: false, error: 'المنتج غير موجود' }
  db.update(products).set({ active: false }).where(eq(products.id, id)).run()
  db.delete(productAddons).where(eq(productAddons.productId, id)).run()
  db.delete(productModifierGroups).where(eq(productModifierGroups.productId, id)).run()
  return { ok: true }
}
