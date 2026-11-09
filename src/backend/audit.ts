// Audit log — who did what, with before/after snapshots.
//
// Written from the backend domain modules so both the desktop and the phone
// server are covered by one path. The acting user comes from the desktop
// session (null for phone actions); the device label is set per request by the
// server via withDeviceLabel().
import { desc, eq, and, gte, lt } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { getUser } from './session'
import { now, uuid } from './shared'
import { localDayEnd, localDayStart } from './day-range'

const { auditLog } = schema

export interface AuditEntry {
  action: string
  entity: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  deviceLabel?: string | null
}

let currentDevice: string | null = null

/**
 * Scopes a device label to a single server request (used for phone actions).
 * The label is held until a returned promise settles, so an async backend
 * function that writes its audit row after an await still sees it.
 */
export function withDeviceLabel<T>(label: string | null, fn: () => T): T {
  const prev = currentDevice
  currentDevice = label
  let result: T
  try {
    result = fn()
  } catch (err) {
    currentDevice = prev
    throw err
  }
  if (result && typeof (result as any).then === 'function') {
    return (result as any).finally(() => {
      currentDevice = prev
    })
  }
  currentDevice = prev
  return result
}

const asJson = (value: unknown) => (value === undefined ? null : JSON.stringify(value))



/**
 * Tells the database triggers who is acting, for the duration of one call.
 *
 * The triggers in `src/db/audit-triggers.ts` see every write but cannot see the
 * JavaScript session, so the actor is pushed into a one-row table and the
 * trigger copies it. This is what makes a trigger-written row name the cashier
 * instead of recording "system".
 *
 * Deliberately set from the *desktop* session only. The phone server elevates a
 * request with `runAs`, scoped to an async call chain that a single database row
 * cannot mirror — two concurrent phone requests would overwrite each other's
 * actor. A phone-initiated row therefore records the desktop user, which is
 * honest about what this mechanism can know. Device attribution for the phone
 * already travels separately, through `withDeviceLabel` on the `writeAudit`
 * path, and stays correct.
 */
export function setAuditActor(userId: string | null): void {
  try {
    getSqlite()
      .prepare('INSERT INTO audit_actor (id, actor) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET actor = excluded.actor')
      .run(userId)
  } catch {
    // A database whose audit table has not been created yet is not a reason to
    // fail the write the actor was being recorded for.
  }
}

/** The actor currently recorded for trigger-written rows. */
export function currentAuditActor(): string | null {
  try {
    return (getSqlite().prepare('SELECT actor FROM audit_actor WHERE id = 1').get() as
      | { actor: string | null }
      | undefined)?.actor ?? null
  } catch {
    return null
  }
}

export function writeAudit(entry: AuditEntry): void {
  getSqlite().prepare(
    `INSERT INTO audit_log (id, user_id, device_label, action, entity, entity_id, before, after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    getUser()?.id ?? null,
    entry.deviceLabel ?? currentDevice ?? null,
    entry.action,
    entry.entity,
    entry.entityId ?? null,
    asJson(entry.before),
    asJson(entry.after),
    now(),
  )
}

export function listAudit(filters?: {
  entity?: string
  entityId?: string
  action?: string
  from?: string
  to?: string
  limit?: number
}) {
  const db = getDb()
  const conditions: SQL[] = []
  if (filters?.entity) conditions.push(eq(auditLog.entity, filters.entity))
  if (filters?.entityId) conditions.push(eq(auditLog.entityId, filters.entityId))
  if (filters?.action) conditions.push(eq(auditLog.action, filters.action))
  if (filters?.from) conditions.push(gte(auditLog.createdAt, localDayStart(filters.from)))
  if (filters?.to) conditions.push(lt(auditLog.createdAt, localDayEnd(filters.to)))
  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 1000)
  const query = conditions.length > 0
    ? db.select().from(auditLog).where(and(...conditions))
    : db.select().from(auditLog)
  return query.orderBy(desc(auditLog.createdAt)).limit(limit).all()
}
