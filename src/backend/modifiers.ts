// Modifier groups and options: admin CRUD, visibility, ordering and links.
import { and, eq, sql } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { hardDelete, listRecipeRows, uuid } from './shared'
import { requireAdmin } from './session'

const { modifierGroups, modifiers, productModifierGroups, modifierRecipes, products } = schema

function cleanGroup(data: any, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (!partial || data.name !== undefined) {
    const name = String(data.name ?? '').trim()
    if (!name) throw new Error('اسم مجموعة الخيارات مطلوب')
    out.name = name
  }

  if (!partial || data.type !== undefined) {
    const type = String(data.type ?? '').trim()
    if (type !== 'single-select' && type !== 'multi-select') throw new Error('نوع المجموعة غير صالح')
    out.type = type
  }

  if (data.sortOrder !== undefined) {
    const order = Number(data.sortOrder)
    if (!Number.isFinite(order) || order < 0) throw new Error('ترتيب المجموعة غير صالح')
    out.sortOrder = Math.trunc(order)
  }
  if (data.active !== undefined) out.active = Boolean(data.active)
  return out
}

function cleanModifier(data: any, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (!partial || data.name !== undefined) {
    const name = String(data.name ?? '').trim()
    if (!name) throw new Error('اسم الخيار مطلوب')
    out.name = name
  }

  if (!partial || data.priceAdjustment !== undefined) {
    const price = Number(data.priceAdjustment ?? 0)
    if (!Number.isFinite(price)) throw new Error('سعر الخيار غير صالح')
    out.priceAdjustment = price
  }

  if (data.sortOrder !== undefined) {
    const order = Number(data.sortOrder)
    if (!Number.isFinite(order) || order < 0) throw new Error('ترتيب الخيار غير صالح')
    out.sortOrder = Math.trunc(order)
  }
  if (data.active !== undefined) out.active = Boolean(data.active)
  return out
}

/** Active groups for the sales screens; the admin page opts into the full list. */
export function listModifierGroups(includeInactive = false) {
  const db = getDb()
  const rows = db.select({
    id: modifierGroups.id,
    name: modifierGroups.name,
    type: modifierGroups.type,
    sortOrder: modifierGroups.sortOrder,
    active: modifierGroups.active,
    productCount: sql<number>`(SELECT COUNT(*) FROM product_modifier_groups pmg WHERE pmg.modifier_group_id = ${modifierGroups.id})`,
    modifierCount: sql<number>`(SELECT COUNT(*) FROM modifiers m WHERE m.modifier_group_id = ${modifierGroups.id})`,
  }).from(modifierGroups).all() as any[]

  return rows
    .filter((row) => includeInactive || row.active)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name), 'ar'))
}

export function getModifierGroupById(id: string) {
  return getDb().select().from(modifierGroups).where(eq(modifierGroups.id, id)).get() ?? null
}

export function createModifierGroup(data: any) {
  requireAdmin()
  const clean = cleanGroup(data, false)
  if (clean.sortOrder === undefined) {
    const max = getDb().select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(modifierGroups).get()?.max ?? 0
    clean.sortOrder = max + 1
  }
  const id = uuid()
  getDb().insert(modifierGroups).values({ id, ...clean } as any).run()
  return { id }
}

export function updateModifierGroup(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  if (!db.select({ id: modifierGroups.id }).from(modifierGroups).where(eq(modifierGroups.id, id)).get()) {
    throw new Error('مجموعة الخيارات غير موجودة')
  }
  const clean = cleanGroup(data, true)
  if (Object.keys(clean).length > 0) {
    db.update(modifierGroups).set(clean as any).where(eq(modifierGroups.id, id)).run()
  }
  return { ok: true }
}

export function deleteModifierGroup(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    return hardDelete(
      'modifier_groups',
      id,
      [{ countSql: 'SELECT COUNT(*) FROM modifier_recipes WHERE modifier_id IN (SELECT id FROM modifiers WHERE modifier_group_id = ?)', label: 'وصفات خيارات' }],
      [
        'DELETE FROM product_modifier_groups WHERE modifier_group_id = ?',
        'DELETE FROM modifiers WHERE modifier_group_id = ?',
      ],
    )
  }
  const row = db.select({ id: modifierGroups.id }).from(modifierGroups).where(eq(modifierGroups.id, id)).get()
  if (!row) return { ok: false, error: 'مجموعة الخيارات غير موجودة' }
  db.update(modifierGroups).set({ active: false }).where(eq(modifierGroups.id, id)).run()
  db.update(modifiers).set({ active: false }).where(eq(modifiers.modifierGroupId, id)).run()
  db.delete(productModifierGroups).where(eq(productModifierGroups.modifierGroupId, id)).run()
  return { ok: true }
}

export function reorderModifierGroups(ids: string[]) {
  requireAdmin()
  const sqlite = getSqlite()
  const update = sqlite.prepare('UPDATE modifier_groups SET sort_order = ? WHERE id = ?')
  sqlite.transaction(() => {
    (ids ?? []).map(String).forEach((id, index) => update.run(index + 1, id))
  })()
  return { ok: true }
}

export function listModifiersByGroup(groupId: string, includeInactive = false) {
  const db = getDb()
  const conditions = [eq(modifiers.modifierGroupId, groupId)]
  if (!includeInactive) conditions.push(eq(modifiers.active, true))
  return db.select().from(modifiers)
    .where(and(...conditions))
    .orderBy(modifiers.sortOrder)
    .all()
}

export function getModifierById(id: string) {
  return getDb().select().from(modifiers).where(eq(modifiers.id, id)).get() ?? null
}

export function createModifier(data: any) {
  requireAdmin()
  const groupId = String(data.modifierGroupId ?? '').trim()
  if (!groupId) throw new Error('المجموعة مطلوبة')
  const clean = cleanModifier(data, false)
  if (clean.sortOrder === undefined) {
    const max = getDb().select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
      .from(modifiers)
      .where(eq(modifiers.modifierGroupId, groupId))
      .get()?.max ?? 0
    clean.sortOrder = max + 1
  }
  const id = uuid()
  getDb().insert(modifiers).values({ id, modifierGroupId: groupId, ...clean } as any).run()
  return { id }
}

export function updateModifier(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  if (!db.select({ id: modifiers.id }).from(modifiers).where(eq(modifiers.id, id)).get()) {
    throw new Error('الخيار غير موجود')
  }
  const clean = cleanModifier(data, true)
  if (Object.keys(clean).length > 0) db.update(modifiers).set(clean as any).where(eq(modifiers.id, id)).run()
  return { ok: true }
}

export function deleteModifier(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    return hardDelete(
      'modifiers',
      id,
      [{ countSql: 'SELECT COUNT(*) FROM modifier_recipes WHERE modifier_id = ?', label: 'وصفات' }],
    )
  }
  const row = db.select({ id: modifiers.id }).from(modifiers).where(eq(modifiers.id, id)).get()
  if (!row) return { ok: false, error: 'الخيار غير موجود' }
  db.update(modifiers).set({ active: false }).where(eq(modifiers.id, id)).run()
  return { ok: true }
}

export function reorderModifiers(ids: string[]) {
  requireAdmin()
  const sqlite = getSqlite()
  const update = sqlite.prepare('UPDATE modifiers SET sort_order = ? WHERE id = ?')
  sqlite.transaction(() => {
    (ids ?? []).map(String).forEach((id, index) => update.run(index + 1, id))
  })()
  return { ok: true }
}

export function listModifiersByProduct(productId: string) {
  const db = getDb()
  const groups = db.select({
    id: modifierGroups.id, name: modifierGroups.name, type: modifierGroups.type,
  }).from(modifierGroups)
    .innerJoin(productModifierGroups, eq(modifierGroups.id, productModifierGroups.modifierGroupId))
    .where(and(eq(productModifierGroups.productId, productId), eq(modifierGroups.active, true)))
    .all()

  return groups.map((g: any) => ({
    ...g,
    modifiers: db.select().from(modifiers)
      .where(and(eq(modifiers.active, true), eq(modifiers.modifierGroupId, g.id)))
      .orderBy(modifiers.sortOrder)
      .all(),
  }))
}

/** Products currently offering this modifier group, including hidden ones. */
export function listModifierGroupProducts(groupId: string) {
  const db = getDb()
  return db.select({
    id: products.id,
    name: products.name,
    emoji: products.emoji,
    active: products.active,
    price: products.price,
  })
    .from(products)
    .innerJoin(productModifierGroups, eq(products.id, productModifierGroups.productId))
    .where(eq(productModifierGroups.modifierGroupId, groupId))
    .all()
}

/** Replace the group's product links — the reverse of the product-side picker. */
export function setModifierGroupProducts(groupId: string, productIds: string[]) {
  requireAdmin()
  const sqlite = getSqlite()
  const ids = [...new Set((productIds ?? []).map(String).filter(Boolean))]
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM product_modifier_groups WHERE modifier_group_id = ?').run(groupId)
    const insert = sqlite.prepare('INSERT INTO product_modifier_groups (product_id, modifier_group_id) VALUES (?, ?)')
    for (const productId of ids) insert.run(productId, groupId)
  })()
  return { ok: true }
}

export function linkModifierToProduct(productId: string, groupId: string) {
  requireAdmin()
  const db = getDb()
  db.insert(productModifierGroups).values({ productId, modifierGroupId: groupId }).run()
  return { ok: true }
}

export function setModifierLinks(productId: string, groupIds: string[]) {
  requireAdmin()
  const db = getDb()
  db.delete(productModifierGroups).where(eq(productModifierGroups.productId, productId)).run()
  for (const groupId of groupIds) {
    db.insert(productModifierGroups).values({ productId, modifierGroupId: groupId }).run()
  }
  return { ok: true }
}

export function listModifierRecipes(modifierId: string) {
  return listRecipeRows('modifier_recipes', 'modifier_id', modifierId)
}

export function upsertModifierRecipe(data: any) {
  requireAdmin()
  const db = getDb()
  if (data.id) {
    db.update(modifierRecipes).set({ ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit })
      .where(eq(modifierRecipes.id, data.id)).run()
    return { id: data.id }
  }
  const id = uuid()
  db.insert(modifierRecipes).values({ id, modifierId: data.modifierId, ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit }).run()
  return { id }
}

export function deleteModifierRecipe(id: string) {
  requireAdmin()
  const db = getDb()
  const row = db.select({ id: modifierRecipes.id }).from(modifierRecipes).where(eq(modifierRecipes.id, id)).get()
  if (!row) return { ok: false, error: 'ارتباط الوصفة غير موجود' }
  db.delete(modifierRecipes).where(eq(modifierRecipes.id, id)).run()
  return { ok: true }
}
