// Customers (delivery autocomplete).
import { desc, eq, like } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { now, uuid } from './shared'

const { customers } = schema

export function searchCustomers(prefix: string) {
  const db = getDb()
  const digits = String(prefix || '').replace(/\D/g, '')
  if (digits.length < 3) return []
  return db.select().from(customers)
    .where(like(customers.phone, `${digits}%`))
    .orderBy(desc(customers.lastOrderAt))
    .limit(8)
    .all()
}

export function upsertCustomer(data: any) {
  const db = getDb()
  const phone = String(data.phone || '').replace(/\D/g, '')
  if (!phone) return { ok: false }
  const existing = db.select().from(customers).where(eq(customers.phone, phone)).get()
  if (existing) {
    db.update(customers).set({
      name: data.name || existing.name,
      address: data.address || existing.address,
      orderCount: (existing.orderCount || 0) + 1,
      lastOrderAt: now(),
    }).where(eq(customers.phone, phone)).run()
    return { ok: true, id: existing.id }
  }
  const id = uuid()
  db.insert(customers).values({
    id, phone,
    name: data.name || null,
    address: data.address || null,
    orderCount: 1,
    lastOrderAt: now(),
    createdAt: now(),
  }).run()
  return { ok: true, id }
}
