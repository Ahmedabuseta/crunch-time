// Shifts.
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { now, uuid } from './shared'
import { writeAudit } from './audit'

const { shifts, cashMovements } = schema

export function openShift(data: any) {
  const db = getDb()
  const existing = db.select().from(shifts).where(eq(shifts.status, 'open')).get()
  if (existing) {
    return { error: 'يوجد وردية مفتوحة بالفعل' }
  }
  const id = uuid()
  const maxRow = db.select({ number: shifts.number }).from(shifts).orderBy(desc(shifts.number)).limit(1).get()
  const number = (Number(maxRow?.number) || 0) + 1
  db.insert(shifts).values({
    id, number, userId: data.userId, startedAt: now(), openingCash: data.openingCash, status: 'open',
  }).run()
  db.insert(cashMovements).values({
    id: uuid(), shiftId: id, type: 'OPENING', amount: data.openingCash, note: 'رصيد افتتاحي', createdAt: now(),
  }).run()
  return { id }
}

export function closeShift(id: string, closingCash: number) {
  const db = getDb()
  const before = db.select().from(shifts).where(eq(shifts.id, id)).get()
  if (!before) return { ok: false, error: 'الوردية غير موجودة' }
  if (before.status === 'closed') return { ok: false, error: 'الوردية مغلقة بالفعل' }
  db.update(shifts).set({ endedAt: now(), closingCash, status: 'closed' }).where(eq(shifts.id, id)).run()
  db.insert(cashMovements).values({
    id: uuid(), shiftId: id, type: 'CLOSING', amount: closingCash, note: 'إغلاق الوردية', createdAt: now(),
  }).run()
  writeAudit({
    action: 'shift.close', entity: 'shift', entityId: id,
    before: before ? { status: before.status, openingCash: before.openingCash } : null,
    after: { status: 'closed', closingCash },
  })
  return { ok: true }
}

export function getCurrentShift() {
  const db = getDb()
  return db.select().from(shifts).where(eq(shifts.status, 'open')).get()
}

export function listShifts(filters?: any) {
  // Cashiers need the shift picker in the cash drawer (no requireAdmin)
  const db = getDb()
  const conditions: any[] = []
  if (filters?.userId) conditions.push(eq(shifts.userId, filters.userId))
  if (filters?.from) conditions.push(gte(shifts.startedAt, filters.from))
  if (filters?.to) conditions.push(lte(shifts.startedAt, filters.to))
  const query = conditions.length > 0
    ? db.select().from(shifts).where(and(...conditions))
    : db.select().from(shifts)
  return query.orderBy(desc(shifts.startedAt)).all()
}
