// Customers (delivery autocomplete).
import { desc, eq, like } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { now, uuid } from './shared'

const { customers } = schema

export function searchCustomers(prefix: string) {
  const db = getDb()
  const digits = String(prefix || '').replace(/\D/g, '')
  if (digits.length < 3) return []
  const rows = db.select().from(customers)
    .where(like(customers.phone, `${digits}%`))
    .orderBy(desc(customers.lastOrderAt))
    .limit(8)
    .all()

  // Last delivery details let the checkout fill the zone and driver too —
  // the customer row itself only stores name/address.
  const s = getSqlite()
  const lastOrder = s.prepare(`
    SELECT delivery_zone_id AS zoneId, delivery_zone_name AS zoneName,
           delivery_profile_id AS profileId, delivery_profile_name AS profileName
    FROM orders
    WHERE order_type = 'delivery'
      AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '') = ?
    ORDER BY created_at DESC
    LIMIT 1
  `)
  return rows.map(c => {
    const last = lastOrder.get(c.phone) as {
      zoneId: string | null
      zoneName: string | null
      profileId: string | null
      profileName: string | null
    } | undefined
    return {
      ...c,
      lastZoneId: last?.zoneId ?? null,
      lastZoneName: last?.zoneName ?? null,
      lastProfileId: last?.profileId ?? null,
      lastProfileName: last?.profileName ?? null,
    }
  })
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
