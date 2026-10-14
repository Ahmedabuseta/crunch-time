// Settings + discount codes.
import { and, eq, sql } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { hardDelete, uuid } from './shared'
import { requireAdmin } from './session'
import { getElectron } from './electron'

const { settings, discountCodes, discountDayProducts, products, kitchenStations } = schema

export function getSettings() {
  const db = getDb()
  return db.select().from(settings).where(eq(settings.id, 'settings')).get()
    || { id: 'settings', deliveryFee: 25, taxRate: 0.14, restaurantName: 'Crunch Time', currency: 'EGP' }
}

export async function updateSettings(data: any, opts?: { listPrinters?: () => Promise<any[]> }) {
  requireAdmin()
  const db = getDb()
  const listPrinters = opts?.listPrinters ?? getElectron().listPrinters
  if (data.autoPrintReceipt === true) {
    const available = await listPrinters()
    if (available.length === 0) throw new Error('لا توجد طابعات متاحة لتفعيل طباعة الإيصال التلقائية.')
  }
  if (data.autoPrintKitchen === true) {
    const available = await listPrinters()
    const availableNames = new Set(available.map((printer: any) => printer.name))
    const configuredStation = db.select({ id: kitchenStations.id })
      .from(kitchenStations)
      .where(and(eq(kitchenStations.active, true), sql`${kitchenStations.id} <> 'st-receipt'`))
      .all()
      .some((station: any) => {
        const row = db.select({ printerName: kitchenStations.printerName })
          .from(kitchenStations)
          .where(eq(kitchenStations.id, station.id)).get()
        return Boolean(row?.printerName && availableNames.has(row.printerName))
      })
    if (!configuredStation) {
      throw new Error('أضف محطة مطبخ نشطة واربطها بطابعة متاحة حالياً قبل تفعيل الطباعة التلقائية للمطبخ.')
    }
  }
  if (data.receiptPrinter) {
    const available = await listPrinters()
    if (!available.some((printer: any) => printer.name === data.receiptPrinter)) {
      throw new Error('طابعة الإيصال غير متاحة حالياً. حدّث قائمة الطابعات واختر طابعة ظاهرة.')
    }
  }
  const existing = db.select().from(settings).where(eq(settings.id, 'settings')).get()
  if (existing) {
    db.update(settings).set(data).where(eq(settings.id, 'settings')).run()
  } else {
    db.insert(settings).values({ id: 'settings', ...data }).run()
  }
  return { ok: true }
}

// Replaces the weekly product rotation for a 'daily' employee code.
function saveDayProducts(codeId: string, dayProducts: { dayOfWeek: number; productId: string }[] | undefined) {
  const db = getDb()
  if (!dayProducts) return
  getSqlite().transaction(() => {
    db.delete(discountDayProducts).where(eq(discountDayProducts.discountCodeId, codeId)).run()
    for (const dp of dayProducts) {
      db.insert(discountDayProducts).values({
        id: uuid(), discountCodeId: codeId,
        dayOfWeek: Number(dp.dayOfWeek), productId: dp.productId,
      }).run()
    }
  })()
}

export function listDiscountCodes() {
  const db = getDb()
  const codes = db.select().from(discountCodes).all()
  const dayRows = db.select().from(discountDayProducts).all()
  return codes.map((c) => ({
    ...c,
    dayProducts: dayRows.filter((d) => d.discountCodeId === c.id),
  }))
}

export function createDiscountCode(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  const { mode, dailyUses, dayProducts, ...rest } = data
  db.insert(discountCodes).values({
    id, ...rest,
    mode: mode || 'order',
    dailyUses: Number(dailyUses) || 0,
    active: true, usedCount: 0,
  }).run()
  if ((mode || 'order') === 'daily') saveDayProducts(id, dayProducts)
  return { id }
}

export function updateDiscountCode(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  const { mode, dailyUses, dayProducts, ...rest } = data
  db.update(discountCodes).set({
    ...rest,
    ...(mode !== undefined ? { mode } : {}),
    ...(dailyUses !== undefined ? { dailyUses: Number(dailyUses) || 0 } : {}),
  }).where(eq(discountCodes.id, id)).run()
  if (dayProducts) saveDayProducts(id, dayProducts)
  return { ok: true }
}

export function deleteDiscountCode(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    db.delete(discountDayProducts).where(eq(discountDayProducts.discountCodeId, id)).run()
    return hardDelete('discount_codes', id)
  }
  const row = db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.id, id)).get()
  if (!row) return { ok: false, error: 'كود الخصم غير موجود' }
  db.update(discountCodes).set({ active: false }).where(eq(discountCodes.id, id)).run()
  return { ok: true }
}

export function validateDiscountCode(code: string) {
  const db = getDb()
  const dc = db.select().from(discountCodes)
    .where(and(eq(discountCodes.active, true), sql`UPPER(${discountCodes.code}) = ${code.toUpperCase()}`))
    .get()
  if (!dc) return { valid: false, error: 'كود غير صالح' }
  if (dc.maxUses > 0 && dc.usedCount >= dc.maxUses) return { valid: false, error: 'انتهى الاستخدام' }

  // Employee daily code: shared pool of uses per day, and the
  // discount only applies to the product-of-the-day.
  if (dc.mode === 'daily') {
    let usedToday = 0
    if (dc.dailyUses > 0) {
      // created_at is stored as a UTC ISO string — the 'localtime'
      // modifier makes date() compare in the shop's timezone.
      usedToday = (getSqlite().prepare(
        `SELECT COUNT(*) AS c FROM orders WHERE discount_code = ? AND date(created_at, 'localtime') = date('now', 'localtime')`
      ).get(dc.code) as { c: number }).c
      if (usedToday >= dc.dailyUses) return { valid: false, error: 'تم استهلاك استخدامات اليوم' }
    }
    const dayRow = db.select().from(discountDayProducts)
      .where(and(eq(discountDayProducts.discountCodeId, dc.id), eq(discountDayProducts.dayOfWeek, new Date().getDay())))
      .get()
    if (!dayRow) return { valid: false, error: 'لا يوجد صنف محدد لهذا اليوم' }
    const product = db.select({ id: products.id, name: products.name, price: products.price })
      .from(products)
      .where(and(eq(products.id, dayRow.productId), eq(products.active, true)))
      .get()
    if (!product) return { valid: false, error: 'صنف اليوم غير موجود' }
    return {
      valid: true,
      discount: {
        id: dc.id, code: dc.code, type: dc.type, value: dc.value,
        mode: 'daily', productId: product.id, productName: product.name,
        remaining: dc.dailyUses > 0 ? dc.dailyUses - usedToday : null,
      },
    }
  }

  return { valid: true, discount: { id: dc.id, code: dc.code, type: dc.type, value: dc.value } }
}

export function useDiscountCode(id: string) {
  const db = getDb()
  db.update(discountCodes).set({ usedCount: sql`${discountCodes.usedCount} + 1` })
    .where(eq(discountCodes.id, id)).run()
  return { ok: true }
}
