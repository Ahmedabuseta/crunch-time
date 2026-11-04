// Addons: admin CRUD, visibility, product links and recipes.
import { and, eq, sql } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { hardDelete, listRecipeRows, uuid } from './shared'
import { requireAdmin } from './session'

const { addons, productAddons, addonRecipes, products } = schema

function cleanAddon(data: any, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (!partial || data.name !== undefined) {
    const name = String(data.name ?? '').trim()
    if (!name) throw new Error('اسم الإضافة مطلوب')
    out.name = name
  }

  if (!partial || data.price !== undefined) {
    const price = Number(data.price)
    if (!Number.isFinite(price) || price < 0) throw new Error('سعر الإضافة غير صالح')
    out.price = price
  }

  if (!partial || data.emoji !== undefined) {
    out.emoji = String(data.emoji ?? '').trim() || '➕'
  }

  if (data.active !== undefined) out.active = Boolean(data.active)
  if (data.supportsRollback !== undefined) out.supportsRollback = Boolean(data.supportsRollback)
  return out
}

/** Active addons for the sales screens; the admin page opts into the full list. */
export function listAddons(includeInactive = false) {
  const db = getDb()
  const rows = db.select({
    id: addons.id,
    name: addons.name,
    price: addons.price,
    emoji: addons.emoji,
    supportsRollback: addons.supportsRollback,
    active: addons.active,
    productCount: sql<number>`(SELECT COUNT(*) FROM product_addons pa WHERE pa.addon_id = ${addons.id})`,
  }).from(addons).all() as any[]

  return rows
    .filter((row) => includeInactive || row.active)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'))
}

export function getAddonById(id: string) {
  return getDb().select().from(addons).where(eq(addons.id, id)).get() ?? null
}

export function createAddon(data: any) {
  requireAdmin()
  const clean = cleanAddon(data, false)
  const id = uuid()
  getDb().insert(addons).values({ id, ...clean } as any).run()
  return { id }
}

export function updateAddon(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  if (!db.select({ id: addons.id }).from(addons).where(eq(addons.id, id)).get()) {
    throw new Error('الإضافة غير موجودة')
  }
  const clean = cleanAddon(data, true)
  if (Object.keys(clean).length > 0) db.update(addons).set(clean as any).where(eq(addons.id, id)).run()
  return { ok: true }
}

export function deleteAddon(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    return hardDelete(
      'addons',
      id,
      [{ countSql: 'SELECT COUNT(*) FROM addon_recipes WHERE addon_id = ?', label: 'وصفات' }],
      ['DELETE FROM product_addons WHERE addon_id = ?'],
    )
  }
  const row = db.select({ id: addons.id }).from(addons).where(eq(addons.id, id)).get()
  if (!row) return { ok: false, error: 'الإضافة غير موجودة' }
  db.update(addons).set({ active: false }).where(eq(addons.id, id)).run()
  db.delete(productAddons).where(eq(productAddons.addonId, id)).run()
  return { ok: true }
}

export function listAddonsByProduct(productId: string) {
  const db = getDb()
  return db.select({
    id: addons.id,
    name: addons.name,
    price: addons.price,
    emoji: addons.emoji,
    supportsRollback: addons.supportsRollback,
  })
    .from(addons)
    .innerJoin(productAddons, eq(addons.id, productAddons.addonId))
    .where(and(eq(productAddons.productId, productId), eq(addons.active, true)))
}

/** Products currently offering this addon, including hidden ones. */
export function listAddonProducts(addonId: string) {
  const db = getDb()
  return db.select({
    id: products.id,
    name: products.name,
    emoji: products.emoji,
    active: products.active,
    price: products.price,
  })
    .from(products)
    .innerJoin(productAddons, eq(products.id, productAddons.productId))
    .where(eq(productAddons.addonId, addonId))
    .all()
}

/** Replace the addon's product links — the reverse of the product-side picker. */
export function setAddonProducts(addonId: string, productIds: string[]) {
  requireAdmin()
  const sqlite = getSqlite()
  const ids = [...new Set((productIds ?? []).map(String).filter(Boolean))]
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM product_addons WHERE addon_id = ?').run(addonId)
    const insert = sqlite.prepare('INSERT INTO product_addons (product_id, addon_id) VALUES (?, ?)')
    for (const productId of ids) insert.run(productId, addonId)
  })()
  return { ok: true }
}

export function linkAddonToProduct(productId: string, addonId: string) {
  requireAdmin()
  const db = getDb()
  db.insert(productAddons).values({ productId, addonId }).run()
  return { ok: true }
}

export function setAddonLinks(productId: string, addonIds: string[]) {
  requireAdmin()
  const db = getDb()
  db.delete(productAddons).where(eq(productAddons.productId, productId)).run()
  for (const addonId of addonIds) {
    db.insert(productAddons).values({ productId, addonId }).run()
  }
  return { ok: true }
}

export function listAddonRecipes(addonId: string) {
  return listRecipeRows('addon_recipes', 'addon_id', addonId)
}

export function upsertAddonRecipe(data: any) {
  requireAdmin()
  const db = getDb()
  if (data.id) {
    db.update(addonRecipes).set({ ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit })
      .where(eq(addonRecipes.id, data.id)).run()
    return { id: data.id }
  }
  const id = uuid()
  db.insert(addonRecipes).values({ id, addonId: data.addonId, ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit }).run()
  return { id }
}

export function deleteAddonRecipe(id: string) {
  requireAdmin()
  const db = getDb()
  const row = db.select({ id: addonRecipes.id }).from(addonRecipes).where(eq(addonRecipes.id, id)).get()
  if (!row) return { ok: false, error: 'ارتباط الوصفة غير موجود' }
  db.delete(addonRecipes).where(eq(addonRecipes.id, id)).run()
  return { ok: true }
}
