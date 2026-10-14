// Audit log — who did what, with before/after snapshots.
//
// Written from the backend domain modules so both the desktop and the phone
// server are covered by one path. The acting user comes from the desktop
// session (null for phone actions); the device label is set per request by the
// server via withDeviceLabel().
import { desc, eq, and, gte, lte } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { getUser } from './session'
import { now, uuid } from './shared'

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

/** Scopes a device label to a single server request (used for phone actions). */
export function withDeviceLabel<T>(label: string | null, fn: () => T): T {
  const prev = currentDevice
  currentDevice = label
  try {
    return fn()
  } finally {
    currentDevice = prev
  }
}

const asJson = (value: unknown) => (value === undefined ? null : JSON.stringify(value))

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
  if (filters?.from) conditions.push(gte(auditLog.createdAt, filters.from))
  if (filters?.to) conditions.push(lte(auditLog.createdAt, filters.to + '￿'))
  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 1000)
  const query = conditions.length > 0
    ? db.select().from(auditLog).where(and(...conditions))
    : db.select().from(auditLog)
  return query.orderBy(desc(auditLog.createdAt)).limit(limit).all()
}
