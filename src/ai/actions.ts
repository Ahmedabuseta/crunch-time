// Pending writes.
//
// A tool never applies a change. It inserts a row here with everything the
// confirm card needs, and `executeAction` is the only thing that writes —
// called from the confirm endpoint (via the confirmAction workflow) or from the
// MCP-free HTTP path. The row's status transition and the backend call share
// one SQLite transaction, so a double tap or a replayed workflow activity can
// apply at most once.
import { eq } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import * as catalog from '../backend/catalog'
import * as inventory from '../backend/inventory'
import * as addonsBackend from '../backend/addons'
import * as modifiersBackend from '../backend/modifiers'
import { recomputeProductCost, now, uuid } from '../backend/shared'
import { writeAudit, withDeviceLabel } from '../backend/audit'
import { asOwner } from './privileges'
import { setAlias, type AliasEntity } from './tools/alias-store'
import type { ActionPreview } from './cards'

const { aiActions } = schema

export type ActionKind =
  | 'set_product_price'
  | 'restock'
  | 'adjust_stock'
  | 'record_waste'
  | 'exchange_brand'
  | 'create_product'
  | 'update_product'
  | 'delete_product'
  | 'set_product_addons'
  | 'set_product_modifiers'
  | 'create_ingredient'
  | 'update_ingredient'
  | 'delete_ingredient'
  | 'add_recipe_line'
  | 'update_recipe_line'
  | 'remove_recipe_line'
  | 'create_subrecipe'
  | 'update_subrecipe'
  | 'delete_subrecipe'
  | 'add_subrecipe_ingredient'
  | 'update_subrecipe_ingredient'
  | 'remove_subrecipe_ingredient'
  | 'learn_alias'

export type ActionStatus = 'proposed' | 'executed' | 'failed' | 'cancelled' | 'expired'

export interface PendingAction {
  id: string
  kind: ActionKind
  payload: Record<string, unknown>
  preview: ActionPreview
  status: ActionStatus
  createdAt: string
  expiresAt: string
}

/** Long enough for a distracted owner, short enough that a stale card dies. */
export const ACTION_TTL_MS = 15 * 60 * 1000

export function createAction(
  kind: ActionKind,
  payload: Record<string, unknown>,
  preview: ActionPreview,
): PendingAction {
  const id = uuid()
  const createdAt = now()
  const expiresAt = new Date(Date.now() + ACTION_TTL_MS).toISOString()
  getDb().insert(aiActions).values({
    id,
    kind,
    payload: JSON.stringify(payload),
    preview: JSON.stringify(preview),
    status: 'proposed',
    createdAt,
    expiresAt,
  }).run()
  return { id, kind, payload, preview, status: 'proposed', createdAt, expiresAt }
}

export interface ActionRow {
  id: string
  kind: ActionKind
  payload: Record<string, unknown>
  preview: ActionPreview
  status: ActionStatus
  workflowId: string | null
  createdAt: string
  expiresAt: string
  executedAt: string | null
  error: string | null
}

export function getAction(id: string): ActionRow | null {
  const row = getDb().select().from(aiActions).where(eq(aiActions.id, id)).get()
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind as ActionKind,
    payload: safeJson(row.payload),
    preview: safeJson(row.preview) as ActionPreview,
    status: row.status as ActionStatus,
    workflowId: row.workflowId ?? null,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    executedAt: row.executedAt ?? null,
    error: row.error ?? null,
  }
}

export function attachWorkflow(id: string, workflowId: string): void {
  getDb().update(aiActions).set({ workflowId }).where(eq(aiActions.id, id)).run()
}

function safeJson<T = Record<string, unknown>>(value: string | null | undefined): T {
  try {
    return JSON.parse(String(value ?? '{}')) as T
  } catch {
    return {} as T
  }
}

export interface ExecuteResult {
  ok: boolean
  status: ActionStatus
  error?: string
  /** True only when this call performed the write, not when it found it done. */
  applied?: boolean
  /** The backend's own return value, e.g. the restock PPV. */
  detail?: unknown
}

/**
 * Applies a proposed action exactly once.
 *
 * The whole thing runs inside one synchronous better-sqlite3 transaction: the
 * status check, the backend call and the status write. Replaying it finds
 * `executed` and returns the stored result instead of applying again.
 */
export function executeAction(id: string, deviceLabel?: string | null): ExecuteResult {
  const sqlite = getSqlite()
  let outcome: ExecuteResult = { ok: false, status: 'proposed' }

  const run = sqlite.transaction(() => {
    const row = getDb().select().from(aiActions).where(eq(aiActions.id, id)).get()
    if (!row) {
      outcome = { ok: false, status: 'proposed', error: 'الإجراء غير موجود' }
      return
    }
    if (row.status === 'executed') {
      outcome = { ok: true, status: 'executed' }
      return
    }
    if (row.status !== 'proposed') {
      outcome = { ok: false, status: row.status as ActionStatus, error: 'الإجراء ده اتلغى أو انتهت صلاحيته' }
      return
    }
    if (row.expiresAt < now()) {
      getDb().update(aiActions).set({ status: 'expired' }).where(eq(aiActions.id, id)).run()
      outcome = { ok: false, status: 'expired', error: 'انتهت صلاحية التأكيد — اعمل الطلب تاني' }
      return
    }

    const payload = safeJson<Record<string, any>>(row.payload)
    const kind = row.kind as ActionKind
    let detail: unknown
    try {
      detail = withDeviceLabel(deviceLabel ?? 'المساعد', () => asOwner(() => apply(kind, payload)))
    } catch (err: any) {
      const message = err?.message || 'تعذّر تنفيذ الإجراء'
      getDb().update(aiActions).set({ status: 'failed', error: message, executedAt: now() })
        .where(eq(aiActions.id, id)).run()
      outcome = { ok: false, status: 'failed', error: message }
      return
    }

    if (detail && typeof detail === 'object' && (detail as any).ok === false) {
      const message = String((detail as any).error || 'تعذّر تنفيذ الإجراء')
      // A refused write is not a failure of the system — it is the backend
      // saying no. Leave the row proposed so the owner can cancel it cleanly.
      getDb().update(aiActions).set({ error: message }).where(eq(aiActions.id, id)).run()
      outcome = { ok: false, status: 'proposed', error: message }
      return
    }

    getDb().update(aiActions).set({ status: 'executed', executedAt: now(), error: null })
      .where(eq(aiActions.id, id)).run()
    outcome = { ok: true, status: 'executed', applied: true, detail }
  })

  run()
  // Audit only the call that wrote. A replayed confirm returns `executed`
  // without touching the ledger, so it must not add a second audit row.
  if (outcome.ok && outcome.applied) {
    writeAudit({
      action: `assistant.${kindOf(id)}`,
      entity: 'settings',
      entityId: id,
      after: { confirmed: true },
      deviceLabel: deviceLabel ?? 'المساعد',
    })
  }
  return outcome
}

function kindOf(id: string): string {
  try {
    return getAction(id)?.kind ?? 'action'
  } catch {
    return 'action'
  }
}

function apply(kind: ActionKind, payload: Record<string, any>): unknown {
  switch (kind) {
    case 'set_product_price':
      return catalog.updateProduct(String(payload.productId), { price: Number(payload.price) })
    case 'restock':
      return inventory.restock(
        String(payload.ingredientId),
        Number(payload.qty),
        payload.note ? String(payload.note) : undefined,
        {
          unitCost: payload.unitCost != null ? Number(payload.unitCost) : undefined,
          packagePrice: payload.packagePrice != null ? Number(payload.packagePrice) : undefined,
          supplier: payload.supplier ? String(payload.supplier) : undefined,
          byQuantity: Boolean(payload.byQuantity),
        },
      )
    case 'adjust_stock':
      return inventory.adjust(String(payload.ingredientId), Number(payload.delta), payload.note ? String(payload.note) : undefined)
    case 'record_waste':
      return inventory.recordWaste(String(payload.ingredientId), Number(payload.qty), payload.note ? String(payload.note) : undefined)
    case 'exchange_brand':
      return inventory.exchange({
        fromIngredientId: String(payload.fromIngredientId),
        fromPackages: Number(payload.fromPackages) || 0,
        toIngredientId: String(payload.toIngredientId),
        toPackages: Number(payload.toPackages) || 0,
        packagePrice: payload.packagePrice != null ? Number(payload.packagePrice) : undefined,
        supplier: payload.supplier ? String(payload.supplier) : undefined,
        note: payload.note ? String(payload.note) : undefined,
      })
    case 'create_product':
      return catalog.createProduct({
        name: payload.name,
        price: payload.price,
        costPrice: payload.costPrice,
        categoryId: payload.categoryId,
        emoji: payload.emoji,
        description: payload.description,
        supportsRollback: payload.supportsRollback,
      })
    case 'update_product':
      return catalog.updateProduct(String(payload.productId), payload.patch ?? {})
    case 'delete_product':
      return catalog.deleteProduct(String(payload.productId))
    case 'set_product_addons':
      return addonsBackend.setAddonLinks(String(payload.productId), Array.isArray(payload.addonIds) ? payload.addonIds.map(String) : [])
    case 'set_product_modifiers':
      return modifiersBackend.setModifierLinks(String(payload.productId), Array.isArray(payload.groupIds) ? payload.groupIds.map(String) : [])
    case 'create_ingredient':
      return inventory.createIngredient(payload)
    case 'update_ingredient':
      return inventory.updateIngredient(String(payload.ingredientId), payload.patch ?? {})
    case 'delete_ingredient':
      return inventory.deleteIngredient(String(payload.ingredientId))
    case 'add_recipe_line':
    case 'update_recipe_line':
      return inventory.upsertRecipe({
        ...(payload.recipeId ? { id: String(payload.recipeId) } : {}),
        productId: payload.productId ? String(payload.productId) : undefined,
        ingredientId: payload.ingredientId ? String(payload.ingredientId) : null,
        subRecipeId: payload.subRecipeId ? String(payload.subRecipeId) : null,
        quantityPerUnit: Number(payload.quantityPerUnit),
      })
    case 'remove_recipe_line':
      return inventory.deleteRecipe(String(payload.recipeId))
    case 'create_subrecipe':
      return inventory.upsertSubRecipe({ name: String(payload.name), unit: String(payload.unit || 'وحدة') })
    case 'update_subrecipe':
      return inventory.upsertSubRecipe({
        id: String(payload.subRecipeId),
        name: String(payload.name),
        unit: String(payload.unit || 'وحدة'),
        active: payload.active !== false,
      })
    case 'delete_subrecipe':
      return inventory.deleteSubRecipe(String(payload.subRecipeId))
    case 'add_subrecipe_ingredient':
    case 'update_subrecipe_ingredient':
      return applySubRecipeIngredient(payload)
    case 'remove_subrecipe_ingredient':
      return applyRemoveSubRecipeIngredient(payload)
    case 'learn_alias':
      // The target was resolved and shown on the card; the write itself is the
      // alias row, so a re-pointed alias simply replaces the old target.
      return setAlias(String(payload.entity) as AliasEntity, String(payload.alias ?? ''), String(payload.targetId ?? ''))
    default:
      throw new Error('نوع الإجراء غير معروف')
  }
}

function applySubRecipeIngredient(payload: Record<string, any>): unknown {
  const result = inventory.upsertSubRecipeIngredient({
    ...(payload.lineId ? { id: String(payload.lineId) } : {}),
    subRecipeId: String(payload.subRecipeId),
    ingredientId: String(payload.ingredientId),
    quantityPerUnit: Number(payload.quantityPerUnit),
  })
  recomputeSubRecipeProducts(String(payload.subRecipeId))
  return result
}

function applyRemoveSubRecipeIngredient(payload: Record<string, any>): unknown {
  const line = inventory.getSubRecipeIngredientById(String(payload.lineId)) as any
  const result = inventory.deleteSubRecipeIngredient(String(payload.lineId))
  if (line?.subRecipeId) recomputeSubRecipeProducts(String(line.subRecipeId))
  return result
}

function recomputeSubRecipeProducts(subRecipeId: string): void {
  const rows = getSqlite()
    .prepare('SELECT DISTINCT product_id AS productId FROM recipes WHERE sub_recipe_id = ?')
    .all(subRecipeId) as { productId: string }[]
  for (const row of rows) recomputeProductCost(row.productId)
}

export function cancelAction(id: string): { ok: boolean; status: ActionStatus; error?: string } {
  const row = getDb().select().from(aiActions).where(eq(aiActions.id, id)).get()
  if (!row) return { ok: false, status: 'proposed', error: 'الإجراء غير موجود' }
  if (row.status === 'executed') return { ok: false, status: 'executed', error: 'الإجراء اتنفّذ بالفعل' }
  if (row.status !== 'proposed') return { ok: true, status: row.status as ActionStatus }
  getDb().update(aiActions).set({ status: 'cancelled' }).where(eq(aiActions.id, id)).run()
  return { ok: true, status: 'cancelled' }
}

export function expireAction(id: string): { ok: boolean; status: ActionStatus } {
  const row = getDb().select().from(aiActions).where(eq(aiActions.id, id)).get()
  if (!row) return { ok: false, status: 'expired' }
  if (row.status === 'proposed') {
    getDb().update(aiActions).set({ status: 'expired' }).where(eq(aiActions.id, id)).run()
    return { ok: true, status: 'expired' }
  }
  return { ok: true, status: row.status as ActionStatus }
}

/** Every action still waiting on an owner tap, newest first. */
export function listPending(limit = 20): ActionRow[] {
  const rows = getDb().select().from(aiActions).where(eq(aiActions.status, 'proposed'))
    .orderBy(aiActions.createdAt).all()
  return rows.slice(-limit).reverse().map((row) => getAction(row.id)!).filter(Boolean)
}
