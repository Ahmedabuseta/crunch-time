// Delivery zones + delivery profiles (delivery boys).
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { uuid } from './shared'
import { requireAdmin } from './session'
import { hardDelete } from './shared'

const { deliveryZones, deliveryProfiles } = schema

export function listDeliveryZones(includeInactive?: boolean) {
  const db = getDb()
  if (includeInactive) {
    return db.select().from(deliveryZones).orderBy(deliveryZones.sortOrder).all()
  }
  return db.select().from(deliveryZones).where(eq(deliveryZones.active, true)).orderBy(deliveryZones.sortOrder).all()
}

export function createDeliveryZone(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  const maxSort = db.select({ sort: deliveryZones.sortOrder }).from(deliveryZones).orderBy(desc(deliveryZones.sortOrder)).limit(1).get()
  db.insert(deliveryZones).values({
    id,
    name: String(data.name || '').trim(),
    fee: Number(data.fee) || 0,
    sortOrder: (Number(maxSort?.sort) || 0) + 1,
    active: true,
  }).run()
  return { id }
}

export function updateDeliveryZone(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  const update: any = {}
  if (data.name !== undefined) update.name = String(data.name).trim()
  if (data.fee !== undefined) update.fee = Number(data.fee) || 0
  if (data.active !== undefined) update.active = !!data.active
  if (data.sortOrder !== undefined) update.sortOrder = Number(data.sortOrder) || 0
  db.update(deliveryZones).set(update).where(eq(deliveryZones.id, id)).run()
  return { ok: true }
}

export function deleteDeliveryZone(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    return hardDelete('delivery_zones', id, [
      { countSql: 'SELECT COUNT(*) FROM orders WHERE delivery_zone_id = ?', label: 'طلبات سابقة' },
    ])
  }
  const row = db.select({ id: deliveryZones.id }).from(deliveryZones).where(eq(deliveryZones.id, id)).get()
  if (!row) return { ok: false, error: 'منطقة التوصيل غير موجودة' }
  db.update(deliveryZones).set({ active: false }).where(eq(deliveryZones.id, id)).run()
  return { ok: true }
}

export function reorderDeliveryZones(ids: string[]) {
  requireAdmin()
  const db = getDb()
  ids.forEach((id, i) => {
    db.update(deliveryZones).set({ sortOrder: i }).where(eq(deliveryZones.id, id)).run()
  })
  return { ok: true }
}

export function listDeliveryProfiles(includeInactive?: boolean) {
  const db = getDb()
  if (includeInactive) return db.select().from(deliveryProfiles).all()
  return db.select().from(deliveryProfiles).where(eq(deliveryProfiles.active, true)).all()
}

export function createDeliveryProfile(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  db.insert(deliveryProfiles).values({ id, name: data.name, phone: data.phone || null, active: true }).run()
  return { id }
}

export function updateDeliveryProfile(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  const update: any = {}
  if (data.name !== undefined) update.name = String(data.name).trim()
  if (data.phone !== undefined) update.phone = data.phone || null
  if (data.active !== undefined) update.active = data.active
  db.update(deliveryProfiles).set(update).where(eq(deliveryProfiles.id, id)).run()
  return { ok: true }
}

export function deleteDeliveryProfile(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    return hardDelete('delivery_profiles', id, [
      { countSql: 'SELECT COUNT(*) FROM orders WHERE delivery_profile_id = ?', label: 'طلبات سابقة' },
    ])
  }
  const row = db.select({ id: deliveryProfiles.id }).from(deliveryProfiles).where(eq(deliveryProfiles.id, id)).get()
  if (!row) return { ok: false, error: 'مندوب التوصيل غير موجود' }
  db.update(deliveryProfiles).set({ active: false }).where(eq(deliveryProfiles.id, id)).run()
  return { ok: true }
}
