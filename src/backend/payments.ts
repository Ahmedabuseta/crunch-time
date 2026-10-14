// Payments.
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { now, uuid } from './shared'

const { payments } = schema

export function createPayment(data: any) {
  const db = getDb()
  const id = uuid()
  db.insert(payments).values({
    id,
    orderId: data.orderId,
    method: data.method,
    amount: data.amount,
    reference: data.reference || null,
    createdAt: now(),
  }).run()
  return { id }
}

export function listPaymentsByOrder(orderId: string) {
  const db = getDb()
  return db.select().from(payments).where(eq(payments.orderId, orderId)).all()
}

export function getTotalPaid(orderId: string) {
  const db = getDb()
  const result = db.select({ total: sql`COALESCE(SUM(${payments.amount}), 0)` })
    .from(payments).where(eq(payments.orderId, orderId)).get()
  return result?.total || 0
}
