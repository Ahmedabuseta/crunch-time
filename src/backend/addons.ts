// Addons.
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { listRecipeRows, uuid } from './shared'
import { requireAdmin } from './session'
import { hardDelete } from './shared'

const { addons, productAddons, addonRecipes } = schema

export function listAddons() {
  const db = getDb()
  return db.select().from(addons).where(eq(addons.active, true))
}

export function createAddon(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  db.insert(addons).values({ id, ...data, active: true }).run()
  return { id }
}

export function updateAddon(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  db.update(addons).set(data).where(eq(addons.id, id)).run()
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
  return db.select({ id: addons.id, name: addons.name, price: addons.price, emoji: addons.emoji, supportsRollback: addons.supportsRollback })
    .from(addons)
    .innerJoin(productAddons, eq(addons.id, productAddons.addonId))
    .where(and(eq(productAddons.productId, productId), eq(addons.active, true)))
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
