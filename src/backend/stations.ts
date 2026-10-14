// Printers + kitchen stations (print routing).
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { uuid } from './shared'
import { requireAdmin } from './session'
import { hardDelete } from './shared'
import { getElectron } from './electron'

const { kitchenStations, stationCategories, orderItems, products } = schema

export async function listPrinters(list?: () => Promise<any[]>) {
  try {
    const printers = await (list ?? getElectron().listPrinters)()
    return printers.map((p: any) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }))
  } catch {
    return []
  }
}

export function printHtml(html: string, opts?: { deviceName?: string; copies?: number; paperWidth?: string }) {
  return getElectron().print(html, opts?.deviceName, opts?.copies ?? 1, opts?.paperWidth ?? '80mm')
}

export function testPrint(deviceName?: string) {
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:monospace;text-align:center;padding:12px}hr{border:none;border-top:2px dashed #000;margin:8px 0}</style></head><body><h2>Crunch Time</h2><p>صفحة اختبار الطباعة</p><hr><p>الطابعة: ${(deviceName || 'الافتراضية')}</p><p>${new Date().toLocaleString('ar-EG')}</p><p>لو شايف الورقة دي يبقى كله تمام</p></body></html>`
  return getElectron().print(html, deviceName, 1, '80mm')
}

export function listStations(includeInactive?: boolean) {
  const db = getDb()
  const rows = (includeInactive
    ? db.select().from(kitchenStations).orderBy(kitchenStations.sortOrder)
    : db.select().from(kitchenStations).where(eq(kitchenStations.active, true)).orderBy(kitchenStations.sortOrder)
  ).all()
  const links = db.select().from(stationCategories).all()
  const byStation = new Map<string, string[]>()
  for (const l of links) {
    if (!byStation.has(l.stationId)) byStation.set(l.stationId, [])
    byStation.get(l.stationId)!.push(l.categoryId)
  }
  return rows.map((s: any) => ({ ...s, categoryIds: byStation.get(s.id) || [] }))
}

async function validateStationPrinter(listPrinters: () => Promise<any[]>, printerName: string | null | undefined, stationId?: string) {
  if (!printerName) return
  const available = await listPrinters()
  if (!available.some((printer: any) => printer.name === printerName)) {
    throw new Error('الطابعة المختارة غير متاحة حالياً. حدّث قائمة الطابعات واختر طابعة ظاهرة.')
  }
  const db = getDb()
  const duplicate = db.select({ id: kitchenStations.id, name: kitchenStations.name })
    .from(kitchenStations)
    .where(and(eq(kitchenStations.printerName, printerName), eq(kitchenStations.active, true)))
    .all()
    .find((station: any) => stationId ? station.id !== stationId : true)
  if (duplicate) {
    throw new Error(`الطابعة مستخدمة بالفعل في محطة «${duplicate.name}». اختار طابعة مختلفة حتى لا يتكرر نفس الطلب.`)
  }
}

// A department may belong to several stations at once — every one of them
// gets the ticket, so printers can share a department. Only duplicates
// INSIDE one station are rejected (mirrors the table's composite PK).
function validateStationCategories(categoryIds: unknown, _stationId?: string) {
  if (!Array.isArray(categoryIds)) return
  const ids = categoryIds.map(String)
  if (new Set(ids).size !== ids.length) {
    throw new Error('لا يمكن تكرار نفس القسم داخل المحطة.')
  }
}

export async function createStation(data: any, opts?: { listPrinters?: () => Promise<any[]> }) {
  requireAdmin()
  const db = getDb()
  const name = String(data.name || '').trim()
  if (!name) throw new Error('اكتب اسم المحطة أولاً.')
  await validateStationPrinter(opts?.listPrinters ?? getElectron().listPrinters, data.printerName || null)
  validateStationCategories(data.categoryIds)
  const id = uuid()
  const maxSort = db.select({ sort: kitchenStations.sortOrder }).from(kitchenStations).orderBy(desc(kitchenStations.sortOrder)).limit(1).get()
  db.insert(kitchenStations).values({
    id,
    name,
    printerName: data.printerName || null,
    paperWidth: data.paperWidth || '80mm',
    sortOrder: (Number(maxSort?.sort) || 0) + 1,
    active: true,
  }).run()
  if (Array.isArray(data.categoryIds)) {
    for (const cid of data.categoryIds) {
      db.insert(stationCategories).values({ stationId: id, categoryId: cid }).run()
    }
  }
  return { id }
}

export async function updateStation(id: string, data: any, opts?: { listPrinters?: () => Promise<any[]> }) {
  requireAdmin()
  const db = getDb()
  if (data.name !== undefined && !String(data.name).trim()) throw new Error('اسم المحطة لا يمكن أن يكون فارغاً.')
  if (data.printerName !== undefined) await validateStationPrinter(opts?.listPrinters ?? getElectron().listPrinters, data.printerName || null, id)
  validateStationCategories(data.categoryIds, id)
  const update: any = {}
  if (data.name !== undefined) update.name = String(data.name).trim()
  if (data.printerName !== undefined) update.printerName = data.printerName || null
  if (data.paperWidth !== undefined) update.paperWidth = data.paperWidth
  if (data.active !== undefined) update.active = !!data.active
  if (data.sortOrder !== undefined) update.sortOrder = Number(data.sortOrder) || 0
  if (Object.keys(update).length > 0) {
    db.update(kitchenStations).set(update).where(eq(kitchenStations.id, id)).run()
  }
  if (Array.isArray(data.categoryIds)) {
    db.delete(stationCategories).where(eq(stationCategories.stationId, id)).run()
    for (const cid of data.categoryIds) {
      db.insert(stationCategories).values({ stationId: id, categoryId: cid }).run()
    }
  }
  return { ok: true }
}

export function deleteStation(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    return hardDelete(
      'kitchen_stations',
      id,
      [],
      ['DELETE FROM station_categories WHERE station_id = ?'],
    )
  }
  const row = db.select({ id: kitchenStations.id }).from(kitchenStations).where(eq(kitchenStations.id, id)).get()
  if (!row) return { ok: false, error: 'محطة المطبخ غير موجودة' }
  db.update(kitchenStations).set({ active: false }).where(eq(kitchenStations.id, id)).run()
  return { ok: true }
}

// Print routing preview for an order: station → its items
export function routeOrder(orderId: string) {
  const db = getDb()
  const items = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all() as any[]
  const prods = db.select().from(products).all() as any[]
  const pMap = new Map(prods.map((p: any) => [p.id, p]))
  const stations = db.select().from(kitchenStations).where(eq(kitchenStations.active, true)).orderBy(kitchenStations.sortOrder).all() as any[]
  const activeStationIds = new Set(stations.map((station: any) => station.id))
  const links = db.select().from(stationCategories).all() as any[]
  // One department can serve several printers — the item fans out to
  // every station that owns its category.
  const catToStations = new Map<string, string[]>()
  for (const l of links) {
    if (!activeStationIds.has(l.stationId)) continue
    const owners = catToStations.get(l.categoryId)
    if (owners) {
      if (!owners.includes(l.stationId)) owners.push(l.stationId)
    } else {
      catToStations.set(l.categoryId, [l.stationId])
    }
  }
  const activeStations = stations.filter((s: any) => s.id !== 'st-receipt')
  const routes: { station: any; items: any[] }[] = activeStations.map((s: any) => ({ station: s, items: [] }))
  const unrouted: any[] = []
  for (const item of items) {
    const p = pMap.get(item.productId) as any
    const row = { ...item, productName: p?.name, productEmoji: p?.emoji, categoryId: p?.categoryId }
    const ownerIds = p?.categoryId ? catToStations.get(p.categoryId) || [] : []
    let routedSomewhere = false
    for (const sid of ownerIds) {
      const route = routes.find((r) => r.station.id === sid)
      if (route) {
        route.items.push({ ...row })
        routedSomewhere = true
      }
    }
    if (!routedSomewhere) unrouted.push(row)
  }
  // Stations with nothing to cook stay silent.
  return { routes: routes.filter((r) => r.items.length > 0), unrouted }
}
