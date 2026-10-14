// Catalog: categories + products.
import { and, eq, sql } from 'drizzle-orm'
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
