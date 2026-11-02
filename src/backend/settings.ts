// Settings + discount codes.
import { and, eq, sql } from 'drizzle-orm'
import { randomBytes, randomInt } from 'crypto'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { hardDelete, uuid } from './shared'
import { requireAdmin } from './session'
import { getElectron } from './electron'
import { hashPin, verifyPin as verifyPinHash } from '../lib/auth'
import { writeAudit } from './audit'
import { computeDiscount, type DiscountLine, type DiscountRule } from '../lib/discount-engine'
import { isScheduleActive, serializeDaysOfWeek } from '../lib/discount-schedule'

const {
  settings, discountCodes, discountDayProducts, discountCodeProducts,
  discountCodeCategories, products, kitchenStations,
} = schema

export const DEFAULT_REMOTE_PORT = 4317

export function getSettings() {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.id, 'settings')).get()
    || { id: 'settings', deliveryFee: 25, taxRate: 0.14, restaurantName: 'Crunch Time', currency: 'EGP' }
  // Never leak the signing secret, the PIN hash or the provider key to the
  // renderer — they are only needed inside the main process. The UI gets
  // booleans instead.
  const { remoteSecret, remotePinHash, aiApiKeyEnc, aiKeyCipher, ...safe } = row as Record<string, any>
  return {
    ...safe,
    remoteHasPin: Boolean(remotePinHash),
    aiHasKey: Boolean(aiApiKeyEnc),
  }
}

// ─── Remote POS server (owner's phone app) ──────────────────
// Read WITHOUT an admin check: the HTTP server reads this on every login and
// every authenticated request, where there is no desktop session.
export function getRemoteConfig() {
  const db = getDb()
  const row = db.select({
    enabled: settings.remoteEnabled,
    port: settings.remotePort,
    pinHash: settings.remotePinHash,
    secret: settings.remoteSecret,
  }).from(settings).where(eq(settings.id, 'settings')).get()
  return {
    enabled: Boolean(row?.enabled),
    port: Number(row?.port) || DEFAULT_REMOTE_PORT,
    pinHash: row?.pinHash ?? null,
    secret: row?.secret ?? null,
  }
}

function patchSettings(patch: Record<string, any>) {
  const db = getDb()
  const existing = db.select({ id: settings.id }).from(settings).where(eq(settings.id, 'settings')).get()
  if (existing) db.update(settings).set(patch).where(eq(settings.id, 'settings')).run()
  else db.insert(settings).values({ id: 'settings', ...patch }).run()
}

// Toggle the server on/off and set its port. Enabling requires a PIN first, so
// the port can never open with no way to authenticate.
export function setRemoteConfig(data: { enabled?: boolean; port?: number }) {
  requireAdmin()
  const patch: Record<string, any> = {}
  if (data.port !== undefined) {
    const port = Math.floor(Number(data.port))
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      return { ok: false, error: 'بورت غير صالح — اختر رقماً من 1024 إلى 65535' }
    }
    patch.remotePort = port
  }
  if (data.enabled !== undefined) {
    if (data.enabled) {
      const cfg = getRemoteConfig()
      if (!cfg.pinHash) return { ok: false, error: 'حدّد الرقم السري للهاتف قبل تشغيل الخادم' }
      if (!cfg.secret) patch.remoteSecret = randomBytes(32).toString('hex')
    }
    patch.remoteEnabled = data.enabled
  }
  if (Object.keys(patch).length > 0) patchSettings(patch)
  return { ok: true }
}

// Setting a new PIN rotates the signing secret, so every token already issued
// to a phone (including a lost one) stops verifying immediately.
export async function setRemotePin(pin: string) {
  requireAdmin()
  const clean = String(pin || '').trim()
  if (clean.length < 4) return { ok: false, error: 'الرقم السري لازم يكون 4 أرقام على الأقل' }
  if (clean.length > 64) return { ok: false, error: 'الرقم السري طويل جداً' }
  const pinHash = await hashPin(clean)
  patchSettings({ remotePinHash: pinHash, remoteSecret: randomBytes(32).toString('hex'), remotePairCode: null, remotePairExpires: null })
  return { ok: true }
}

/** Verify a phone login PIN against the stored hash (no session required). */
export async function verifyRemotePin(pin: string): Promise<boolean> {
  const { pinHash } = getRemoteConfig()
  if (!pinHash) return false
  try {
    return await verifyPinHash(pinHash, String(pin ?? ''))
  } catch {
    return false
  }
}

// ─── Pairing (scan a QR instead of typing the address and PIN) ──────
export const PAIR_CODE_TTL_MS = 10 * 60 * 1000

function sixDigits(): string {
  return String(randomInt(100000, 1000000))
}

/**
 * Creates a random PIN so the owner never has to invent one. The plaintext is
 * returned once for display — only the hash is kept, and the signing secret is
 * rotated, so any phone already paired is signed out.
 */
export async function generateRemotePin() {
  requireAdmin()
  const pin = sixDigits()
  const pinHash = await hashPin(pin)
  patchSettings({
    remotePinHash: pinHash,
    remoteSecret: randomBytes(32).toString('hex'),
    remotePairCode: null,
    remotePairExpires: null,
  })
  writeAudit({ action: 'remote.pin.generate', entity: 'settings', entityId: 'settings', after: { generated: true } })
  return { ok: true, pin }
}

/** Issues a short-lived, single-use code for the pairing QR. */
export function createRemotePairCode() {
  requireAdmin()
  const { pinHash } = getRemoteConfig()
  if (!pinHash) return { ok: false as const, error: 'حدّد الرقم السري للهاتف الأول' }
  const code = sixDigits()
  const expiresAt = new Date(Date.now() + PAIR_CODE_TTL_MS).toISOString()
  patchSettings({ remotePairCode: code, remotePairExpires: expiresAt })
  return { ok: true as const, code, expiresAt }
}

export function clearRemotePairCode() {
  requireAdmin()
  patchSettings({ remotePairCode: null, remotePairExpires: null })
  return { ok: true }
}

/**
 * Checks a pairing code and burns it. No admin check: this runs on the HTTP
 * server, where there is no desktop session — possession of a live, unexpired
 * code is the credential, exactly like the PIN.
 */
export function consumeRemotePairCode(code: string): boolean {
  const db = getDb()
  const row = db.select({ pairCode: settings.remotePairCode, expires: settings.remotePairExpires })
    .from(settings).where(eq(settings.id, 'settings')).get()
  const supplied = String(code ?? '').trim()
  if (!row?.pairCode || !supplied) return false
  if (supplied !== row.pairCode) return false
  if (!row.expires || row.expires < new Date().toISOString()) {
    patchSettings({ remotePairCode: null, remotePairExpires: null })
    return false
  }
  patchSettings({ remotePairCode: null, remotePairExpires: null })
  return true
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
  writeAudit({ action: 'settings.update', entity: 'settings', entityId: 'settings', before: pickForAudit(existing, data), after: pickForAudit(data, data) })
  return { ok: true }
}

// Settings snapshots for the audit log: only the changed keys, with long
// values (the store logo data URL) replaced by a marker so the log stays small.
function pickForAudit(row: any, keys: any): Record<string, any> {
  const out: Record<string, any> = {}
  for (const key of Object.keys(keys || {})) {
    const value = row?.[key] ?? null
    out[key] = typeof value === 'string' && value.length > 200 ? `[${value.length} chars]` : value
  }
  return out
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

// Replaces the product/category targeting rows. Undefined means "leave that
// side untouched"; an empty array clears it.
function saveDiscountScopes(codeId: string, productIds?: string[], categoryIds?: string[]) {
  if (productIds === undefined && categoryIds === undefined) return
  const db = getDb()
  getSqlite().transaction(() => {
    if (productIds !== undefined) {
      db.delete(discountCodeProducts).where(eq(discountCodeProducts.discountCodeId, codeId)).run()
      for (const productId of productIds) {
        db.insert(discountCodeProducts).values({ discountCodeId: codeId, productId }).run()
      }
    }
    if (categoryIds !== undefined) {
      db.delete(discountCodeCategories).where(eq(discountCodeCategories.discountCodeId, codeId)).run()
      for (const categoryId of categoryIds) {
        db.insert(discountCodeCategories).values({ discountCodeId: codeId, categoryId }).run()
      }
    }
  })()
}

function scopeIds(codeId: string) {
  const db = getDb()
  return {
    productIds: db.select({ productId: discountCodeProducts.productId })
      .from(discountCodeProducts).where(eq(discountCodeProducts.discountCodeId, codeId)).all()
      .map((row) => row.productId),
    categoryIds: db.select({ categoryId: discountCodeCategories.categoryId })
      .from(discountCodeCategories).where(eq(discountCodeCategories.discountCodeId, codeId)).all()
      .map((row) => row.categoryId),
  }
}

function discountRule(dc: typeof discountCodes.$inferSelect): DiscountRule {
  const { productIds, categoryIds } = scopeIds(dc.id)
  return {
    id: dc.id,
    code: dc.code,
    type: dc.type === 'bogo' ? 'bogo' : dc.type === 'fixed' ? 'fixed' : 'percentage',
    value: dc.value,
    mode: dc.mode === 'daily' ? 'daily' : 'order',
    scope: dc.scope === 'products' || dc.scope === 'categories' ? dc.scope : 'order',
    productIds,
    categoryIds,
    minSubtotal: dc.minSubtotal,
    buyQty: dc.buyQty,
    getQty: dc.getQty,
    getPercent: dc.getPercent,
    autoApply: dc.autoApply,
    startsAt: dc.startsAt,
    endsAt: dc.endsAt,
    daysOfWeek: dc.daysOfWeek,
    startTime: dc.startTime,
    endTime: dc.endTime,
  }
}

function mapDiscountFields(data: any) {
  const out: Record<string, any> = {}
  if (data.code !== undefined) out.code = String(data.code).trim()
  if (data.type !== undefined) out.type = ['percentage', 'fixed', 'bogo'].includes(data.type) ? data.type : 'percentage'
  if (data.value !== undefined) out.value = Number(data.value) || 0
  if (data.mode !== undefined) out.mode = data.mode === 'daily' ? 'daily' : 'order'
  if (data.dailyUses !== undefined) out.dailyUses = Number(data.dailyUses) || 0
  if (data.active !== undefined) out.active = Boolean(data.active)
  if (data.maxUses !== undefined) out.maxUses = Number(data.maxUses) || 0
  if (data.usedCount !== undefined) out.usedCount = Number(data.usedCount) || 0
  if (data.scope !== undefined) out.scope = ['products', 'categories'].includes(data.scope) ? data.scope : 'order'
  if (data.startsAt !== undefined) out.startsAt = data.startsAt || null
  if (data.endsAt !== undefined) out.endsAt = data.endsAt || null
  if (data.daysOfWeek !== undefined) out.daysOfWeek = serializeDaysOfWeek(data.daysOfWeek)
  if (data.startTime !== undefined) out.startTime = data.startTime || null
  if (data.endTime !== undefined) out.endTime = data.endTime || null
  if (data.minSubtotal !== undefined) out.minSubtotal = Number(data.minSubtotal) || 0
  if (data.buyQty !== undefined) out.buyQty = Math.max(0, Math.floor(Number(data.buyQty) || 0))
  if (data.getQty !== undefined) out.getQty = Math.max(0, Math.floor(Number(data.getQty) || 0))
  if (data.getPercent !== undefined) out.getPercent = Number(data.getPercent) || 0
  if (data.autoApply !== undefined) out.autoApply = Boolean(data.autoApply)
  return out
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

function validateDiscountRow(row: Record<string, any>) {
  if (row.mode === 'daily' && row.autoApply) {
    throw new Error('الخصم اليومي للموظفين لا يمكن تطبيقه تلقائياً')
  }
  if (row.startsAt && !DATE_RE.test(row.startsAt)) throw new Error('تاريخ البداية غير صحيح')
  if (row.endsAt && !DATE_RE.test(row.endsAt)) throw new Error('تاريخ النهاية غير صحيح')
  if (row.startsAt && row.endsAt && row.startsAt > row.endsAt) {
    throw new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية')
  }
  if (row.startTime && !TIME_RE.test(row.startTime)) throw new Error('وقت البداية غير صحيح')
  if (row.endTime && !TIME_RE.test(row.endTime)) throw new Error('وقت النهاية غير صحيح')

  if (row.type === 'percentage' && !(row.value > 0 && row.value <= 100)) {
    throw new Error('النسبة يجب أن تكون بين 1 و 100')
  }
  if (row.type === 'fixed' && !(row.value > 0)) {
    throw new Error('المبلغ يجب أن يكون أكبر من صفر')
  }
  if (row.type === 'bogo') {
    if (!(row.buyQty >= 1) || !(row.getQty >= 1)) {
      throw new Error('حدد عدد القطع المشتراة والقطع المجانية')
    }
    if (!(row.getPercent > 0 && row.getPercent <= 100)) {
      throw new Error('نسبة خصم القطع المجانية غير صحيحة')
    }
  }
}

export function listDiscountCodes() {
  const db = getDb()
  const codes = db.select().from(discountCodes).all()
  const dayRows = db.select().from(discountDayProducts).all()
  const productRows = db.select().from(discountCodeProducts).all()
  const categoryRows = db.select().from(discountCodeCategories).all()
  return codes.map((c) => ({
    ...c,
    dayProducts: dayRows.filter((d) => d.discountCodeId === c.id),
    productIds: productRows.filter((row) => row.discountCodeId === c.id).map((row) => row.productId),
    categoryIds: categoryRows.filter((row) => row.discountCodeId === c.id).map((row) => row.categoryId),
  }))
}

export function createDiscountCode(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  const { dayProducts, productIds, categoryIds } = data
  const row: Record<string, any> = {
    type: 'percentage', value: 0, mode: 'order', dailyUses: 0, maxUses: 0,
    scope: 'order', daysOfWeek: null, minSubtotal: 0,
    buyQty: 0, getQty: 0, getPercent: 100, autoApply: false,
    ...mapDiscountFields(data),
  }
  validateDiscountRow(row)
  if (row.scope === 'products' && (!productIds || productIds.length === 0)) {
    throw new Error('اختار صنفاً واحداً على الأقل')
  }
  if (row.scope === 'categories' && (!categoryIds || categoryIds.length === 0)) {
    throw new Error('اختار قسماً واحداً على الأقل')
  }

  db.insert(discountCodes).values({
    id,
    code: row.code,
    type: row.type,
    value: row.value,
    mode: row.mode,
    dailyUses: row.dailyUses,
    active: true,
    maxUses: row.maxUses,
    usedCount: 0,
    scope: row.scope,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    daysOfWeek: row.daysOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    minSubtotal: row.minSubtotal,
    buyQty: row.buyQty,
    getQty: row.getQty,
    getPercent: row.getPercent,
    autoApply: row.autoApply,
  }).run()

  if (row.mode === 'daily') saveDayProducts(id, dayProducts)
  saveDiscountScopes(id, productIds, categoryIds)
  return { id }
}

export function updateDiscountCode(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  const existing = db.select().from(discountCodes).where(eq(discountCodes.id, id)).get()
  if (!existing) throw new Error('كود الخصم غير موجود')

  const mapped = mapDiscountFields(data)
  const row = { ...existing, ...mapped }
  validateDiscountRow(row as Record<string, any>)

  if (row.scope === 'products') {
    const ids = data.productIds !== undefined ? data.productIds : scopeIds(id).productIds
    if (!ids || ids.length === 0) throw new Error('اختار صنفاً واحداً على الأقل')
  }
  if (row.scope === 'categories') {
    const ids = data.categoryIds !== undefined ? data.categoryIds : scopeIds(id).categoryIds
    if (!ids || ids.length === 0) throw new Error('اختار قسماً واحداً على الأقل')
  }

  db.update(discountCodes).set(mapped).where(eq(discountCodes.id, id)).run()
  if (data.dayProducts) saveDayProducts(id, data.dayProducts)
  if (data.productIds !== undefined || data.categoryIds !== undefined) {
    saveDiscountScopes(id, data.productIds, data.categoryIds)
  } else if (row.scope === 'order') {
    saveDiscountScopes(id, [], [])
  }
  return { ok: true }
}

export function deleteDiscountCode(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) {
    db.delete(discountDayProducts).where(eq(discountDayProducts.discountCodeId, id)).run()
    db.delete(discountCodeProducts).where(eq(discountCodeProducts.discountCodeId, id)).run()
    db.delete(discountCodeCategories).where(eq(discountCodeCategories.discountCodeId, id)).run()
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

  const schedule = isScheduleActive(dc)
  if (!schedule.active) return { valid: false, error: schedule.reason }

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
        ...discountRule(dc),
        mode: 'daily',
        productId: product.id,
        productName: product.name,
        remaining: dc.dailyUses > 0 ? dc.dailyUses - usedToday : null,
      },
    }
  }

  return { valid: true, discount: discountRule(dc) }
}

// Best auto-applied promo for the current cart. Schedule and usage caps are
// checked here; the caller only has to compare the returned amounts.
export function resolveAutoDiscount(lines: DiscountLine[], subtotal: number) {
  const db = getDb()
  const codes = db.select().from(discountCodes)
    .where(and(eq(discountCodes.active, true), eq(discountCodes.autoApply, true)))
    .all()

  let best: { discount: DiscountRule; total: number; lineDiscounts: Record<string, number> } | null = null
  for (const dc of codes) {
    if (dc.mode === 'daily') continue
    if (dc.maxUses > 0 && dc.usedCount >= dc.maxUses) continue
    if (!isScheduleActive(dc).active) continue

    const rule = discountRule(dc)
    const result = computeDiscount(rule, lines, subtotal)
    if (result.total <= 0) continue
    if (!best || result.total > best.total) {
      best = { discount: rule, total: result.total, lineDiscounts: result.lineDiscounts }
    }
  }
  return best
}

export function useDiscountCode(id: string) {
  const db = getDb()
  db.update(discountCodes).set({ usedCount: sql`${discountCodes.usedCount} + 1` })
    .where(eq(discountCodes.id, id)).run()
  return { ok: true }
}
