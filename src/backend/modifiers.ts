// Modifiers.
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { listRecipeRows, uuid } from './shared'
import { requireAdmin } from './session'
import { hardDelete } from './shared'

const { modifierGroups, modifiers, productModifierGroups, modifierRecipes } = schema

export function listModifierGroups() {
  const db = getDb()
  return db.select().from(modifierGroups).where(eq(modifierGroups.active, true)).orderBy(modifierGroups.sortOrder)
}

export function createModifierGroup(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  db.insert(modifierGroups).values({ id, ...data, active: true }).run()
  return { id }
}

export function updateModifierGroup(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  db.update(modifierGroups).set(data).where(eq(modifierGroups.id, id)).run()
  return { ok: true }
}

export function deleteModifierGroup(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    // Member modifiers carry their own recipes; if any exist the
    // group is history-linked and must be refused, not cascaded.
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

export function listModifiersByGroup(groupId: string) {
  const db = getDb()
  return db.select().from(modifiers)
    .where(and(eq(modifiers.active, true), eq(modifiers.modifierGroupId, groupId)))
    .orderBy(modifiers.sortOrder)
}

export function createModifier(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  db.insert(modifiers).values({ id, ...data, active: true }).run()
  return { id }
}

export function updateModifier(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  db.update(modifiers).set(data).where(eq(modifiers.id, id)).run()
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

export function listModifiersByProduct(productId: string) {
  const db = getDb()
  const groups = db.select({
    id: modifierGroups.id, name: modifierGroups.name, type: modifierGroups.type,
  }).from(modifierGroups)
    .innerJoin(productModifierGroups, eq(modifierGroups.id, productModifierGroups.modifierGroupId))
    .where(eq(productModifierGroups.productId, productId))
    .all()

  return groups.map((g: any) => ({
    ...g,
    modifiers: db.select().from(modifiers)
      .where(and(eq(modifiers.active, true), eq(modifiers.modifierGroupId, g.id)))
      .orderBy(modifiers.sortOrder)
      .all(),
  }))
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
