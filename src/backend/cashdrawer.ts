// Cash drawer movements + reconciliation.
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { now, uuid } from './shared'
import { requireAdmin } from './session'
import { writeAudit } from './audit'

const { cashMovements, shifts, orders } = schema

export function addMovement(data: any) {
  // Cashiers can add movements (no requireAdmin)
  const db = getDb()
  const id = uuid()
  db.insert(cashMovements).values({
    id, shiftId: data.shiftId, type: data.type, amount: data.amount, note: data.note || null, createdAt: now(),
  }).run()
  // Drawer corrections are audit-logged (money entering/leaving the till
  // outside a sale).
  writeAudit({
    action: 'cash.movement', entity: 'cash_movement', entityId: id,
    after: { shiftId: data.shiftId, type: data.type, amount: data.amount, note: data.note || null },
  })
  return { id }
}

export function listMovementsByShift(shiftId: string) {
  // Cashiers need the drawer view (no requireAdmin)
  const db = getDb()
  return db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).orderBy(cashMovements.createdAt).all()
}

export function reconcile(shiftId: string) {
  requireAdmin()
  const db = getDb()
  const movs = db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).all()
  const shift = db.select().from(shifts).where(eq(shifts.id, shiftId)).get()
  if (!shift) return null

  let expected = shift.openingCash
  const breakdown: Record<string, number> = {}

  for (const m of movs) {
    if (m.type === 'OPENING') continue // already counted
    if (m.type === 'CLOSING') continue
    const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
    expected += m.amount * sign
    breakdown[m.type] = (breakdown[m.type] || 0) + m.amount * sign
  }

  const actual = shift.closingCash ?? 0
  return {
    openingCash: shift.openingCash,
    breakdown,
    expected,
    actual,
    difference: actual - expected,
  }
}

export function reconcileBatch(shiftIds: string[]) {
  requireAdmin()
  const db = getDb()
  const results: Record<string, any> = {}
  for (const shiftId of shiftIds) {
    const movs = db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).all()
    const shift = db.select().from(shifts).where(eq(shifts.id, shiftId)).get()
    if (!shift) continue
    let expected = shift.openingCash
    const breakdown: Record<string, number> = {}
    for (const m of movs) {
      if (m.type === 'OPENING' || m.type === 'CLOSING') continue
      const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
      expected += m.amount * sign
      breakdown[m.type] = (breakdown[m.type] || 0) + m.amount * sign
    }
    const actual = shift.closingCash ?? 0
    results[shiftId] = { openingCash: shift.openingCash, breakdown, expected, actual, difference: actual - expected }
  }
  return results
}

export function expectedCash(shiftId: string) {
  // Cashiers need this for closing their shift (no requireAdmin)
  const db = getDb()
  const movs = db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).all()
  const shift = db.select().from(shifts).where(eq(shifts.id, shiftId)).get()
  if (!shift) return null
  let expected = shift.openingCash
  const breakdown: Record<string, number> = {}
  for (const m of movs) {
    if (m.type === 'OPENING' || m.type === 'CLOSING') continue
    const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
    expected += m.amount * sign
    breakdown[m.type] = (breakdown[m.type] || 0) + m.amount * sign
  }
  // Delivery COD is posted as a SALE when the order is created; surface it
  // separately so the cashier knows how much of the drawer must come back
  // from the drivers before closing.
  const deliveryRows = db.select({ total: orders.total }).from(orders).where(and(
    eq(orders.shiftId, shiftId),
    eq(orders.orderType, 'delivery'),
    eq(orders.paymentType, 'cash'),
    sql`${orders.status} NOT IN ('CANCELLED', 'REFUNDED')`,
  )).all()
  const deliveryCash = Math.round(
    deliveryRows.reduce((sum, o) => sum + (Number(o.total) || 0), 0),
  )
  return { expected, breakdown, deliveryCash, deliveryCashOrders: deliveryRows.length }
}
