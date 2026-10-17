// Catalog: categories + products.
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { uuid } from './shared'
import { requireAdmin } from './session'
import { hardDelete } from './shared'

const { categories, products, productAddons, productModifierGroups } = schema

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

export function listProducts(categoryId?: string) {
  const db = getDb()
  if (categoryId) {
    return db.select().from(products)
      .where(and(eq(products.active, true), eq(products.categoryId, categoryId)))
  }
  return db.select().from(products).where(eq(products.active, true))
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
  limit: number
  offset: number
  sort?: ProductSortKey
  dir?: 'asc' | 'desc'
}) {
  const db = getDb()
  const conditions = [eq(products.active, true)]
  if (options.categoryId) conditions.push(eq(products.categoryId, options.categoryId))
  if (options.search) {
    conditions.push(sql`LOWER(${products.name}) LIKE ${`%${options.search.toLowerCase()}%`}`)
  }
  const where = and(...conditions)

  const total = Number(
    db.select({ count: sql<number>`COUNT(*)` }).from(products).where(where).get()?.count ?? 0
  )
  const column = PRODUCT_SORTS[options.sort ?? 'name']
  const items = db.select().from(products).where(where)
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
  const db = getDb()
  const id = uuid()
  db.insert(products).values({ id, ...data, active: true }).run()
  return { id }
}

export function updateProduct(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  db.update(products).set(data).where(eq(products.id, id)).run()
  return { ok: true }
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
