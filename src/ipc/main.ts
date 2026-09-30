import { ipcMain, app, BrowserWindow } from 'electron'
import { getDb, getSqlite } from '../db/client'
import { eq, and, desc, like, sql, gte, lte, or, inArray } from 'drizzle-orm'
import * as schema from '../db/schema'
import { runMigrations } from '../db/migrate'
import { seedDatabase } from '../db/seed'
import { randomUUID } from 'crypto'
import { hashPin, verifyPin } from '../lib/auth'
import { mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

const {
  categories, products, addons, productAddons,
  modifierGroups, modifiers, productModifierGroups,
  orders, orderItems, payments,
  users, shifts, cashMovements,
  ingredients, recipes, inventoryTransactions,
  settings, discountCodes, deliveryZones, kitchenStations, stationCategories, expenses,
  addonRecipes, modifierRecipes, customers,
  purchasePriceHistory,
  subRecipes, subRecipeIngredients,
} = schema

// ─── Silent print helper ───────────────────────────────────────
// Prints an HTML string on a hidden window to a named OS printer.
// Falls back to the default printer when deviceName is empty.
async function silentPrint(html: string, deviceName?: string | null, copies = 1, paperWidth: string = '80mm'): Promise<{ ok: boolean; error?: string }> {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) return { ok: false, error: 'لا توجد نافذة للطباعة' }
  const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  try {
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const widthMicrons = paperWidth === '58mm' ? 58000 : 80000
    for (let i = 0; i < Math.max(1, copies); i++) {
      await new Promise<void>((resolve, reject) => {
        printWin.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: deviceName || undefined,
          pageSize: { width: widthMicrons, height: 297000 } as any,
          margins: { marginType: 'none' } as any,
        }, (success: boolean, failureReason: string) => {
          if (success) resolve()
          else reject(new Error(failureReason === 'cancelled' ? 'أُلغيت الطباعة' : String(failureReason || 'فشلت الطباعة')))
        })
      })
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'فشلت الطباعة' }
  } finally {
    if (!printWin.isDestroyed()) printWin.close()
  }
}

function now() { return new Date().toISOString() }
function uuid() { return randomUUID() }
const r2 = (n: number) => Math.round(n * 100) / 100

// ─── Inventory helpers (raw SQL, snake_case) ─────────────────
function getOpenShiftId(dataShiftId?: string | null): string | null {
  const row = getSqlite().prepare("SELECT id FROM shifts WHERE status = 'open' LIMIT 1").get() as { id: string } | undefined
  return row?.id || dataShiftId || null
}

// Recalculate a product's cost_price from its recipe (Σ quantity × ingredient cost)
function recomputeProductCost(productId: string) {
  const s = getSqlite()
  const rows = s.prepare(`
    SELECT r.quantity_per_unit AS qty, i.cost_per_unit AS unitCost
    FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.product_id = ? AND r.ingredient_id IS NOT NULL
    UNION ALL
    SELECT r.quantity_per_unit * sri.quantity_per_unit AS qty, i.cost_per_unit AS unitCost
    FROM recipes r
    JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = r.sub_recipe_id
    JOIN ingredients i ON i.id = sri.ingredient_id
    WHERE r.product_id = ? AND r.sub_recipe_id IS NOT NULL
  `).all(productId, productId) as any[]
  const cost = rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0)
  s.prepare('UPDATE products SET cost_price = ? WHERE id = ?').run(cost, productId)
}

// Expand recipe rows (ingredients AND sub-recipes) into flat ingredient consumptions
function expandRecipes(rows: { ingredient_id?: string | null; sub_recipe_id?: string | null; quantity_per_unit: number }[]): { ingredientId: string; qty: number }[] {
  const s = getSqlite()
  const out: { ingredientId: string; qty: number }[] = []
  for (const r of rows) {
    const factor = Number(r.quantity_per_unit) || 0
    if (r.sub_recipe_id) {
      const parts = s.prepare('SELECT sri.ingredient_id AS ingredientId, sri.quantity_per_unit AS qty FROM sub_recipe_ingredients sri WHERE sri.sub_recipe_id = ?').all(r.sub_recipe_id) as { ingredientId: string; qty: number }[]
      for (const p of parts) out.push({ ingredientId: p.ingredientId, qty: factor * (Number(p.qty) || 0) })
    } else if (r.ingredient_id) {
      out.push({ ingredientId: r.ingredient_id, qty: factor })
    }
  }
  return out
}

// Unified recipe rows (ingredient rows + sub-recipe rows) for a product/addon/modifier
function listRecipeRows(table: string, entityCol: string, entityId: string) {
  const s = getSqlite()
  const ingredientRows = s.prepare(`
    SELECT r.id, r.ingredient_id AS ingredientId, NULL AS subRecipeId,
           r.quantity_per_unit AS quantityPerUnit,
           i.name AS ingredientName, NULL AS subRecipeName, i.unit, NULL AS subRecipeUnit,
           i.cost_per_unit AS costPerUnit, NULL AS subRecipeCostPerUnit,
           i.cost_per_unit * r.quantity_per_unit AS lineCost
    FROM ${table} r JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.${entityCol} = ? AND r.ingredient_id IS NOT NULL
  `).all(entityId) as any[]
  const subRows = s.prepare(`
    SELECT r.id, NULL AS ingredientId, r.sub_recipe_id AS subRecipeId,
           r.quantity_per_unit AS quantityPerUnit,
           NULL AS ingredientName, sr.name AS subRecipeName, NULL AS unit, sr.unit AS subRecipeUnit,
           NULL AS costPerUnit,
           (SELECT COALESCE(SUM(i.cost_per_unit * sri.quantity_per_unit), 0)
            FROM sub_recipe_ingredients sri JOIN ingredients i ON i.id = sri.ingredient_id
            WHERE sri.sub_recipe_id = sr.id) AS subRecipeCostPerUnit,
           (SELECT COALESCE(SUM(i.cost_per_unit * sri.quantity_per_unit), 0)
            FROM sub_recipe_ingredients sri JOIN ingredients i ON i.id = sri.ingredient_id
            WHERE sri.sub_recipe_id = sr.id) * r.quantity_per_unit AS lineCost
    FROM ${table} r JOIN sub_recipes sr ON sr.id = r.sub_recipe_id
    WHERE r.${entityCol} = ? AND r.sub_recipe_id IS NOT NULL
  `).all(entityId) as any[]
  return [...ingredientRows, ...subRows]
}

// Full rollback — CANCELLED: return ALL ingredients (products + addons)
function rollbackInventory(orderId: string) {
  const s = getSqlite()
  const items = s.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[]
  const restore = (ingredientId: string, qty: number, note: string) => {
    s.prepare('UPDATE ingredients SET stock_quantity = stock_quantity + ? WHERE id = ?').run(qty, ingredientId)
    s.prepare(`INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at)
      VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, ?)`)
      .run(uuid(), ingredientId, qty, orderId, note, now())
  }
  for (const item of items) {
    for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM recipes WHERE product_id = ?').all(item.product_id) as any[])) {
      restore(c.ingredientId, c.qty * item.quantity, `إرجاع منتج — طلب ${orderId}`)
    }
    if (item.selected_addons_json) {
      try {
        const addonIds = JSON.parse(item.selected_addons_json) as string[]
        for (const addonId of addonIds) {
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM addon_recipes WHERE addon_id = ?').all(addonId) as any[])) {
            restore(c.ingredientId, c.qty * item.quantity, `إرجاع إضافة — طلب ${orderId}`)
          }
        }
      } catch {}
    }
    if (item.selected_modifiers_json) {
      try {
        const mods = JSON.parse(item.selected_modifiers_json) as { modifierId: string }[]
        for (const mod of mods) {
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM modifier_recipes WHERE modifier_id = ?').all(mod.modifierId) as any[])) {
            restore(c.ingredientId, c.qty * item.quantity, `إرجاع تعديل — طلب ${orderId}`)
          }
        }
      } catch {}
    }
  }
}

// Partial rollback — REFUNDED: only products+addons that support rollback
function rollbackInventoryPartial(orderId: string): number {
  const s = getSqlite()
  const items = s.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[]
  let refundedAmount = 0
  const restore = (ingredientId: string, qty: number, note: string) => {
    s.prepare('UPDATE ingredients SET stock_quantity = stock_quantity + ? WHERE id = ?').run(qty, ingredientId)
    s.prepare(`INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at)
      VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?, ?)`)
      .run(uuid(), ingredientId, qty, orderId, note, now())
  }
  for (const item of items) {
    const product = s.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any | undefined
    if (!product) continue
    let itemRefund = 0

    if (product.supports_rollback) {
      for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM recipes WHERE product_id = ?').all(item.product_id) as any[])) {
        restore(c.ingredientId, c.qty * item.quantity, `إرجاع جزئي ${orderId} — ${product.name}`)
      }
      if (item.selected_modifiers_json) {
        try {
          const mods = JSON.parse(item.selected_modifiers_json) as { modifierId: string }[]
          for (const mod of mods) {
            for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM modifier_recipes WHERE modifier_id = ?').all(mod.modifierId) as any[])) {
              restore(c.ingredientId, c.qty * item.quantity, `إرجاع جزئي ${orderId} — ${product.name}`)
            }
          }
        } catch {}
      }
      itemRefund += (item.unit_price ?? product.price) * item.quantity
    }

    if (item.selected_addons_json) {
      try {
        const addonIds = JSON.parse(item.selected_addons_json) as string[]
        for (const addonId of addonIds) {
          const addon = s.prepare('SELECT * FROM addons WHERE id = ?').get(addonId) as any | undefined
          if (!addon || !addon.supports_rollback) continue
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM addon_recipes WHERE addon_id = ?').all(addonId) as any[])) {
            restore(c.ingredientId, c.qty * item.quantity, `إرجاع إضافة ${orderId} — ${addon.name}`)
          }
          itemRefund += addon.price * item.quantity
        }
      } catch {}
    }
    refundedAmount += itemRefund
  }
  return refundedAmount
}

// Deduct inventory for an order (products + addons + modifiers)
function deductInventory(orderId: string) {
  const s = getSqlite()
  const items = s.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[]
  const consume = (ingredientId: string, qty: number, note: string) => {
    s.prepare('UPDATE ingredients SET stock_quantity = stock_quantity - ? WHERE id = ?').run(qty, ingredientId)
    s.prepare(`INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at)
      VALUES (?, ?, 'CONSUMPTION', ?, ?, ?, ?)`)
      .run(uuid(), ingredientId, -qty, orderId, note, now())
  }
  for (const item of items) {
    for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM recipes WHERE product_id = ?').all(item.product_id) as any[])) {
      consume(c.ingredientId, c.qty * item.quantity, `استهلاك منتج — طلب ${orderId}`)
    }
    if (item.selected_addons_json) {
      try {
        const addonIds = JSON.parse(item.selected_addons_json) as string[]
        for (const addonId of addonIds) {
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM addon_recipes WHERE addon_id = ?').all(addonId) as any[])) {
            consume(c.ingredientId, c.qty * item.quantity, `استهلاك إضافة — طلب ${orderId}`)
          }
        }
      } catch {}
    }
    if (item.selected_modifiers_json) {
      try {
        const mods = JSON.parse(item.selected_modifiers_json) as { modifierId: string }[]
        for (const mod of mods) {
          for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM modifier_recipes WHERE modifier_id = ?').all(mod.modifierId) as any[])) {
            consume(c.ingredientId, c.qty * item.quantity, `استهلاك تعديل — طلب ${orderId}`)
          }
        }
      } catch {}
    }
  }
}

// ─── Resilience analytics helpers ─────────────────────────────
// ABC class by cumulative revenue share (A ≤ 70%, B ≤ 90%, C rest)
function abcClass(cumShare: number) {
  if (cumShare <= 0.7) return 'A'
  if (cumShare <= 0.9) return 'B'
  return 'C'
}

// XYZ class by coefficient of variation of daily demand (stable → volatile)
function xyzClass(cv: number) {
  if (cv < 0.2) return 'X'
  if (cv < 0.4) return 'Y'
  return 'Z'
}

// Supplier spend concentration for the 70/30 strategy check
function supplierConcentration(ingredientId: string, from?: string, to?: string) {
  const s = getSqlite()
  let where = 'WHERE ingredient_id = ?'
  const params: any[] = [ingredientId]
  if (from) { where += ' AND purchased_at >= ?'; params.push(from) }
  if (to) { where += ' AND purchased_at <= ?'; params.push(to + '\uffff') }
  const rows = s.prepare(
    `SELECT supplier, SUM(quantity) AS qty, SUM(unit_cost * quantity) AS spend
     FROM purchase_price_history ${where} GROUP BY supplier`
  ).all(...params) as any[]
  const totalQty = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
  const mapped = rows.map(r => ({
    supplier: r.supplier || 'غير محدد',
    qty: Number(r.qty) || 0,
    spend: r2(Number(r.spend) || 0),
    share: r2(totalQty > 0 ? (Number(r.qty) || 0) / totalQty : 0),
  })).sort((a, b) => b.share - a.share)
  return {
    rows: mapped,
    topSupplierPct: mapped.length ? mapped[0].share * 100 : 0,
    singleSupplierConcentration: mapped.length >= 1 && mapped[0].share > 0.7,
  }
}

export async function initBackend() {
  runMigrations()
  await seedDatabase()
  registerIpcHandlers()
}

export function registerIpcHandlers() {
  const db = getDb()

  // ═══════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('settings:get', () =>
    db.select().from(settings).where(eq(settings.id, 'settings')).get()
    || { id: 'settings', deliveryFee: 25, taxRate: 0.14, restaurantName: 'فاست فود', currency: 'EGP' }
  )

  ipcMain.handle('settings:update', (_e, data: any) => {
    const existing = db.select().from(settings).where(eq(settings.id, 'settings')).get()
    if (existing) {
      db.update(settings).set(data).where(eq(settings.id, 'settings')).run()
    } else {
      db.insert(settings).values({ id: 'settings', ...data }).run()
    }
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // DISCOUNT CODES
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('discountCode:list', () =>
    db.select().from(discountCodes)
  )

  ipcMain.handle('discountCode:create', (_e, data: any) => {
    const id = uuid()
    db.insert(discountCodes).values({ id, ...data, active: true, usedCount: 0 }).run()
    return { id }
  })

  ipcMain.handle('discountCode:update', (_e, id: string, data: any) => {
    db.update(discountCodes).set(data).where(eq(discountCodes.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('discountCode:delete', (_e, id: string) => {
    db.delete(discountCodes).where(eq(discountCodes.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('discountCode:validate', (_e, code: string) => {
    const dc = db.select().from(discountCodes)
      .where(and(eq(discountCodes.active, true), sql`UPPER(${discountCodes.code}) = ${code.toUpperCase()}`))
      .get()
    if (!dc) return { valid: false, error: 'كود غير صالح' }
    if (dc.maxUses > 0 && dc.usedCount >= dc.maxUses) return { valid: false, error: 'انتهى الاستخدام' }
    return { valid: true, discount: { id: dc.id, code: dc.code, type: dc.type, value: dc.value } }
  })

  ipcMain.handle('discountCode:use', (_e, id: string) => {
    db.update(discountCodes).set({ usedCount: sql`${discountCodes.usedCount} + 1` })
      .where(eq(discountCodes.id, id)).run()
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // DELIVERY ZONES
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('deliveryZone:list', (_e, includeInactive?: boolean) => {
    if (includeInactive) {
      return db.select().from(deliveryZones).orderBy(deliveryZones.sortOrder).all()
    }
    return db.select().from(deliveryZones).where(eq(deliveryZones.active, true)).orderBy(deliveryZones.sortOrder).all()
  })

  ipcMain.handle('deliveryZone:create', (_e, data: any) => {
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
  })

  ipcMain.handle('deliveryZone:update', (_e, id: string, data: any) => {
    const update: any = {}
    if (data.name !== undefined) update.name = String(data.name).trim()
    if (data.fee !== undefined) update.fee = Number(data.fee) || 0
    if (data.active !== undefined) update.active = !!data.active
    if (data.sortOrder !== undefined) update.sortOrder = Number(data.sortOrder) || 0
    db.update(deliveryZones).set(update).where(eq(deliveryZones.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('deliveryZone:delete', (_e, id: string) => {
    db.update(deliveryZones).set({ active: false }).where(eq(deliveryZones.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('deliveryZone:reorder', (_e: any, ids: string[]) => {
    ids.forEach((id, i) => {
      db.update(deliveryZones).set({ sortOrder: i }).where(eq(deliveryZones.id, id)).run()
    })
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // PRINTERS + KITCHEN STATIONS (print routing)
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('printer:list', async (e) => {
    try {
      const contents = e.sender
      const printers = await contents.getPrintersAsync()
      return printers.map((p: any) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }))
    } catch {
      return []
    }
  })

  ipcMain.handle('printer:printHtml', async (_e, html: string, opts?: { deviceName?: string; copies?: number; paperWidth?: string }) => {
    return silentPrint(html, opts?.deviceName, opts?.copies ?? 1, opts?.paperWidth ?? '80mm')
  })

  ipcMain.handle('printer:test', async (_e, deviceName?: string) => {
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:monospace;text-align:center;padding:12px}hr{border:none;border-top:2px dashed #000;margin:8px 0}</style></head><body><h2>🍔 فاست فود</h2><p>صفحة اختبار الطباعة</p><hr><p>الطابعة: ${(deviceName || 'الافتراضية')}</p><p>${new Date().toLocaleString('ar-EG')}</p><p>لو شايف الورقة دي يبقى كله تمام ✅</p></body></html>`
    return silentPrint(html, deviceName, 1, '80mm')
  })

  ipcMain.handle('station:list', (_e, includeInactive?: boolean) => {
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
  })

  ipcMain.handle('station:create', (_e, data: any) => {
    const id = uuid()
    const maxSort = db.select({ sort: kitchenStations.sortOrder }).from(kitchenStations).orderBy(desc(kitchenStations.sortOrder)).limit(1).get()
    db.insert(kitchenStations).values({
      id,
      name: String(data.name || 'محطة').trim(),
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
  })

  ipcMain.handle('station:update', (_e, id: string, data: any) => {
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
  })

  ipcMain.handle('station:delete', (_e, id: string) => {
    db.update(kitchenStations).set({ active: false }).where(eq(kitchenStations.id, id)).run()
    return { ok: true }
  })

  // Print routing preview for an order: station → its items
  ipcMain.handle('station:routeOrder', (_e, orderId: string) => {
    const items = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all() as any[]
    const prods = db.select().from(products).all() as any[]
    const pMap = new Map(prods.map((p: any) => [p.id, p]))
    const stations = db.select().from(kitchenStations).where(eq(kitchenStations.active, true)).orderBy(kitchenStations.sortOrder).all() as any[]
    const links = db.select().from(stationCategories).all() as any[]
    const catToStation = new Map<string, string>()
    for (const l of links) {
      if (!catToStation.has(l.categoryId)) catToStation.set(l.categoryId, l.stationId)
    }
    const activeStations = stations.filter((s: any) => s.id !== 'st-receipt')
    const routes: { station: any; items: any[] }[] = activeStations.map((s: any) => ({ station: s, items: [] }))
    const unrouted: any[] = []
    for (const item of items) {
      const p = pMap.get(item.productId) as any
      const sid = p?.categoryId ? catToStation.get(p.categoryId) : undefined
      const route = routes.find((r) => r.station.id === sid)
      if (route) route.items.push({ ...item, productName: p?.name, productEmoji: p?.emoji, categoryId: p?.categoryId })
      else unrouted.push({ ...item, productName: p?.name, productEmoji: p?.emoji, categoryId: p?.categoryId })
    }
    return { routes: routes.filter((r) => r.items.length > 0), unrouted }
  })

  // ═══════════════════════════════════════════════════════════
  // EXPENSES
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('expense:list', () =>
    db.select().from(expenses).where(eq(expenses.active, true))
  )

  ipcMain.handle('expense:create', (_e, data: any) => {
    const id = uuid()
    db.insert(expenses).values({ id, ...data, active: true }).run()
    return { id }
  })

  ipcMain.handle('expense:update', (_e, id: string, data: any) => {
    db.update(expenses).set(data).where(eq(expenses.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('expense:delete', (_e, id: string) => {
    db.update(expenses).set({ active: false }).where(eq(expenses.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('expense:totalMonthly', () => {
    const result = db.select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses).where(and(eq(expenses.active, true), eq(expenses.type, 'monthly'))).get()
    return result?.total || 0
  })

  // ═══════════════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('category:list', () =>
    db.select().from(categories).where(eq(categories.active, true)).orderBy(categories.sortOrder)
  )

  ipcMain.handle('category:create', (_e, data: any) => {
    const id = uuid()
    db.insert(categories).values({ id, ...data, active: true }).run()
    return { id }
  })

  ipcMain.handle('category:update', (_e, id: string, data: any) => {
    db.update(categories).set(data).where(eq(categories.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('category:delete', (_e, id: string) => {
    db.update(categories).set({ active: false }).where(eq(categories.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('category:reorder', (_e: any, ids: string[]) => {
    ids.forEach((id, i) => {
      db.update(categories).set({ sortOrder: i }).where(eq(categories.id, id)).run()
    })
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // PRODUCTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('product:list', (_e, categoryId?: string) => {
    if (categoryId) {
      return db.select().from(products)
        .where(and(eq(products.active, true), eq(products.categoryId, categoryId)))
    }
    return db.select().from(products).where(eq(products.active, true))
  })

  ipcMain.handle('product:getById', (_e, id: string) =>
    db.select().from(products).where(eq(products.id, id)).get()
  )

  ipcMain.handle('product:create', (_e, data: any) => {
    const id = uuid()
    db.insert(products).values({ id, ...data, active: true }).run()
    return { id }
  })

  ipcMain.handle('product:update', (_e, id: string, data: any) => {
    db.update(products).set(data).where(eq(products.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('product:delete', (_e, id: string) => {
    db.update(products).set({ active: false }).where(eq(products.id, id)).run()
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // ADDONS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('addon:list', () =>
    db.select().from(addons).where(eq(addons.active, true))
  )

  ipcMain.handle('addon:create', (_e, data: any) => {
    const id = uuid()
    db.insert(addons).values({ id, ...data, active: true }).run()
    return { id }
  })

  ipcMain.handle('addon:update', (_e, id: string, data: any) => {
    db.update(addons).set(data).where(eq(addons.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('addon:delete', (_e, id: string) => {
    db.update(addons).set({ active: false }).where(eq(addons.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('addon:listByProduct', (_e, productId: string) =>
    db.select({ id: addons.id, name: addons.name, price: addons.price, emoji: addons.emoji, supportsRollback: addons.supportsRollback })
      .from(addons)
      .innerJoin(productAddons, eq(addons.id, productAddons.addonId))
      .where(and(eq(productAddons.productId, productId), eq(addons.active, true)))
  )

  ipcMain.handle('addon:linkToProduct', (_e, productId: string, addonId: string) => {
    db.insert(productAddons).values({ productId, addonId }).run()
    return { ok: true }
  })

  ipcMain.handle('addon:setProductLinks', (_e, productId: string, addonIds: string[]) => {
    db.delete(productAddons).where(eq(productAddons.productId, productId)).run()
    for (const addonId of addonIds) {
      db.insert(productAddons).values({ productId, addonId }).run()
    }
    return { ok: true }
  })

  ipcMain.handle('addon:listRecipes', (_e, addonId: string) => listRecipeRows('addon_recipes', 'addon_id', addonId))

  ipcMain.handle('addon:upsertRecipe', (_e, data: any) => {
    if (data.id) {
      db.update(addonRecipes).set({ ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit })
        .where(eq(addonRecipes.id, data.id)).run()
      return { id: data.id }
    }
    const id = uuid()
    db.insert(addonRecipes).values({ id, addonId: data.addonId, ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit }).run()
    return { id }
  })

  ipcMain.handle('addon:deleteRecipe', (_e, id: string) => {
    db.delete(addonRecipes).where(eq(addonRecipes.id, id)).run()
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // MODIFIERS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('modifier:listGroups', () =>
    db.select().from(modifierGroups).where(eq(modifierGroups.active, true)).orderBy(modifierGroups.sortOrder)
  )

  ipcMain.handle('modifier:createGroup', (_e, data: any) => {
    const id = uuid()
    db.insert(modifierGroups).values({ id, ...data, active: true }).run()
    return { id }
  })

  ipcMain.handle('modifier:updateGroup', (_e, id: string, data: any) => {
    db.update(modifierGroups).set(data).where(eq(modifierGroups.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('modifier:deleteGroup', (_e, id: string) => {
    db.update(modifierGroups).set({ active: false }).where(eq(modifierGroups.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('modifier:listByGroup', (_e, groupId: string) =>
    db.select().from(modifiers)
      .where(and(eq(modifiers.active, true), eq(modifiers.modifierGroupId, groupId)))
      .orderBy(modifiers.sortOrder)
  )

  ipcMain.handle('modifier:createModifier', (_e, data: any) => {
    const id = uuid()
    db.insert(modifiers).values({ id, ...data, active: true }).run()
    return { id }
  })

  ipcMain.handle('modifier:updateModifier', (_e, id: string, data: any) => {
    db.update(modifiers).set(data).where(eq(modifiers.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('modifier:deleteModifier', (_e, id: string) => {
    db.update(modifiers).set({ active: false }).where(eq(modifiers.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('modifier:listByProduct', (_e: any, productId: string) => {
    const groups = db.select({
      id: modifierGroups.id, name: modifierGroups.name, type: modifierGroups.type,
    }).from(modifierGroups)
      .innerJoin(productModifierGroups, eq(modifierGroups.id, productModifierGroups.modifierGroupId))
      .where(eq(productModifierGroups.productId, productId))
      .all()

    return groups.map((g: any) => ({
      ...g,
      modifiers: db.select().from(modifiers)
        .where(and(eq(modifiers.active, true), eq(modifiers.modifierGroupId, g.id)))
        .orderBy(modifiers.sortOrder)
        .all(),
    }))
  })

  ipcMain.handle('modifier:linkToProduct', (_e, productId: string, groupId: string) => {
    db.insert(productModifierGroups).values({ productId, modifierGroupId: groupId }).run()
    return { ok: true }
  })

  ipcMain.handle('modifier:setProductLinks', (_e, productId: string, groupIds: string[]) => {
    db.delete(productModifierGroups).where(eq(productModifierGroups.productId, productId)).run()
    for (const groupId of groupIds) {
      db.insert(productModifierGroups).values({ productId, modifierGroupId: groupId }).run()
    }
    return { ok: true }
  })

  ipcMain.handle('modifier:listRecipes', (_e, modifierId: string) => listRecipeRows('modifier_recipes', 'modifier_id', modifierId))

  ipcMain.handle('modifier:upsertRecipe', (_e, data: any) => {
    if (data.id) {
      db.update(modifierRecipes).set({ ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit })
        .where(eq(modifierRecipes.id, data.id)).run()
      return { id: data.id }
    }
    const id = uuid()
    db.insert(modifierRecipes).values({ id, modifierId: data.modifierId, ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit }).run()
    return { id }
  })

  ipcMain.handle('modifier:deleteRecipe', (_e, id: string) => {
    db.delete(modifierRecipes).where(eq(modifierRecipes.id, id)).run()
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // ORDERS
  // ═══════════════════════════════════════════════════════════
  const resolveDeliveryZone = (zoneId?: string | null, zoneName?: string | null) => {
    if (!zoneId) return { deliveryZoneId: null as string | null, deliveryZoneName: (zoneName || '').trim() || null as string | null }
    const row = db.select({ name: deliveryZones.name }).from(deliveryZones).where(eq(deliveryZones.id, zoneId)).get()
    return { deliveryZoneId: zoneId, deliveryZoneName: (zoneName || '').trim() || row?.name || null }
  }
  ipcMain.handle('order:create', (_e, data: any) => {
    const shiftId = getOpenShiftId(data.shiftId) || data.shiftId || null
    if (!shiftId) {
      throw new Error('لا يمكن إنشاء طلب بدون وردية مفتوحة')
    }
    const shift = db.select({ number: shifts.number }).from(shifts).where(eq(shifts.id, shiftId)).get()
    const shiftNumber = Number(shift?.number) || 0
    const { c } = getSqlite().prepare('SELECT COUNT(*) AS c FROM orders WHERE shift_id = ?').get(shiftId) as { c: number }
    const id = shiftNumber > 0
      ? `${shiftNumber}-${String((c || 0) + 1).padStart(3, '0')}`
      : `#${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
    const ts = now()

    db.insert(orders).values({
      id,
      status: 'COMPLETED',
      orderType: data.orderType,
      tableNumber: data.tableNumber || null,
      customerName: data.customerName || null,
      customerPhone: data.customerPhone || null,
      customerAddress: data.customerAddress || null,
      deliveryAddress: data.deliveryAddress || null,
      deliveryPhone: data.deliveryPhone || null,
      subtotal: data.subtotal,
      tax: data.tax,
      deliveryFee: data.deliveryFee || 0,
      ...resolveDeliveryZone(data.deliveryZoneId, data.deliveryZoneName),
      deliveryNote: (data.deliveryNote || '').trim() || null,
      discountCode: data.discountCode || null,
      discountAmount: data.discountAmount || 0,
      total: data.total,
      paymentType: data.paymentType || 'cash',
      cashierName: data.cashierName || null,
      note: (data.note || '').trim() || null,
      statusReason: null,
      refundedAmount: 0,
      userId: data.userId || null,
      shiftId,
      createdAt: ts,
      updatedAt: ts,
    }).run()

    for (const item of data.items) {
      db.insert(orderItems).values({
        id: uuid(),
        orderId: id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        itemDiscount: item.itemDiscount || 0,
        note: (item.note || '').trim() || null,
        selectedModifiersJson: item.modifiers ? JSON.stringify(item.modifiers) : null,
        selectedAddonsJson: item.addons ? JSON.stringify(item.addons) : null,
      }).run()
    }

    // Payment record
    const payMethod = data.paymentType === 'visa' ? 'card' : (data.paymentType || 'cash')
    db.insert(payments).values({
      id: uuid(), orderId: id, method: payMethod, amount: data.total, createdAt: ts,
    }).run()

    // SALE cash movement for cash payments on an open shift
    if (shiftId && (data.paymentType || 'cash') === 'cash') {
      db.insert(cashMovements).values({
        id: uuid(), shiftId, type: 'SALE', amount: data.total, note: `طلب ${id}`, createdAt: ts,
      }).run()
    }

    // Save/update delivery customer for phone autocomplete
    if (data.orderType === 'delivery' && data.customerPhone) {
      const phone = String(data.customerPhone).replace(/\D/g, '')
      if (phone) {
        const existing = db.select().from(customers).where(eq(customers.phone, phone)).get()
        if (existing) {
          db.update(customers).set({
            name: data.customerName || existing.name,
            address: data.customerAddress || existing.address,
            orderCount: (existing.orderCount || 0) + 1,
            lastOrderAt: ts,
          }).where(eq(customers.phone, phone)).run()
        } else {
          db.insert(customers).values({
            id: uuid(), phone,
            name: data.customerName || null,
            address: data.customerAddress || null,
            orderCount: 1,
            lastOrderAt: ts,
            createdAt: ts,
          }).run()
        }
      }
    }

    return { id }
  })

  ipcMain.handle('order:list', (_e, filters?: any) => {
    const conditions = [] as any[]
    if (filters?.status) conditions.push(eq(orders.status, filters.status))
    if (filters?.search) {
      const term = `%${filters.search.toLowerCase()}%`
      conditions.push(or(
        like(orders.id, term),
        like(orders.customerName, term),
        like(orders.customerPhone, term),
      ))
    }
    if (filters?.from) conditions.push(gte(orders.createdAt, filters.from))
    if (filters?.to) conditions.push(lte(orders.createdAt, filters.to + '\uffff'))

    const rows = (conditions.length > 0
      ? db.select().from(orders).where(and(...conditions))
      : db.select().from(orders)
    ).orderBy(desc(orders.createdAt)).all() as any[]

    const ids = rows.map(r => r.id)
    const itemRows = ids.length
      ? db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).all() as any[]
      : []
    const byOrder = new Map<string, any[]>()
    for (const it of itemRows) {
      if (!byOrder.has(it.orderId)) byOrder.set(it.orderId, [])
      byOrder.get(it.orderId)!.push(it)
    }
    const allProducts = db.select().from(products).all()
    const allAddons = db.select().from(addons).all()
    const pMap = new Map(allProducts.map(p => [p.id, p]))
    const aMap = new Map(allAddons.map(a => [a.id, a]))

    return rows.map(o => {
      const items = (byOrder.get(o.id) || []).map((item: any) => {
        const p = pMap.get(item.productId)
        let addonRollbackInfo: { name: string; emoji: string; supportsRollback: boolean; price: number }[] = []
        if (item.selectedAddonsJson) {
          try {
            addonRollbackInfo = (JSON.parse(item.selectedAddonsJson) as string[]).map((aid: string) => {
              const a = aMap.get(aid)
              return a
                ? { name: a.name, emoji: a.emoji, supportsRollback: a.supportsRollback ?? true, price: a.price }
                : { name: '?', emoji: '?', supportsRollback: false, price: 0 }
            })
          } catch {}
        }
        return { ...item, productName: p?.name, productEmoji: p?.emoji, supportsRollback: p?.supportsRollback ?? false, addonRollbackInfo }
      })
      return { ...o, items }
    })
  })

  ipcMain.handle('order:getById', (_e, id: string) => {
    const allOrders = db.select().from(orders).where(eq(orders.id, id)).all()
    const order = allOrders[0]
    if (!order) return null
    const items = db.select().from(orderItems).where(eq(orderItems.orderId, id)).all()
    const pays = db.select().from(payments).where(eq(payments.orderId, id)).all()
    const allProducts = db.select().from(products).all()
    const allAddons = db.select().from(addons).all()
    const pMap = new Map(allProducts.map(p => [p.id, p]))
    const aMap = new Map(allAddons.map(a => [a.id, a]))

    const enriched = items.map((item: any) => {
      const p = pMap.get(item.productId)
      let addonRollbackInfo: { name: string; emoji: string; supportsRollback: boolean; price: number }[] = []
      if (item.selectedAddonsJson) {
        try {
          const addonIds = JSON.parse(item.selectedAddonsJson) as string[]
          addonRollbackInfo = addonIds.map((aid: string) => {
            const a = aMap.get(aid)
            return a
              ? { name: a.name, emoji: a.emoji, supportsRollback: a.supportsRollback ?? true, price: a.price }
              : { name: '?', emoji: '?', supportsRollback: false, price: 0 }
          })
        } catch {}
      }
      return { ...item, productName: p?.name, productEmoji: p?.emoji, supportsRollback: p?.supportsRollback ?? false, addonRollbackInfo }
    })

    return { ...order, items: enriched, payments: pays }
  })

  ipcMain.handle('order:updateStatus', (_e, id: string, status: string, reason?: string) => {
    const order = db.select().from(orders).where(eq(orders.id, id)).get()
    if (!order) return { ok: false, error: 'الطلب غير موجود' }
    if ((status === 'CANCELLED' || status === 'REFUNDED') && (!reason || !reason.trim())) {
      return { ok: false, error: 'يجب إدخال سبب الإلغاء/الاسترداد' }
    }
    const ts = now()

    if (status === 'CANCELLED' && order.status === 'COMPLETED') {
      rollbackInventory(id)
      if (order.paymentType === 'cash' && order.shiftId) {
        db.insert(cashMovements).values({
          id: uuid(), shiftId: order.shiftId, type: 'REFUND', amount: order.total,
          note: `إلغاء طلب ${id} — ${reason || ''}`, createdAt: ts,
        }).run()
      }
    }

    if (status === 'REFUNDED' && order.status === 'COMPLETED') {
      const refundedAmount = rollbackInventoryPartial(id)
      if (order.paymentType === 'cash' && order.shiftId && refundedAmount > 0) {
        db.insert(cashMovements).values({
          id: uuid(), shiftId: order.shiftId, type: 'REFUND', amount: refundedAmount,
          note: `استرداد طلب ${id} — ${reason || ''}`, createdAt: ts,
        }).run()
      }
      db.update(orders).set({ status, statusReason: reason || null, refundedAmount, updatedAt: ts })
        .where(eq(orders.id, id)).run()
      return { ok: true, refundedAmount }
    }

    db.update(orders).set({ status, statusReason: reason || null, updatedAt: ts })
      .where(eq(orders.id, id)).run()
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // PAYMENTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('payment:create', (_e, data: any) => {
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
  })

  ipcMain.handle('payment:listByOrder', (_e, orderId: string) =>
    db.select().from(payments).where(eq(payments.orderId, orderId)).all()
  )

  ipcMain.handle('payment:getTotalPaid', (_e, orderId: string) => {
    const result = db.select({ total: sql`COALESCE(SUM(${payments.amount}), 0)` })
      .from(payments).where(eq(payments.orderId, orderId)).get()
    return result?.total || 0
  })

  // ═══════════════════════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('user:list', () =>
    db.select({ id: users.id, name: users.name, role: users.role, active: users.active, createdAt: users.createdAt, hourlyRate: users.hourlyRate, commissionRate: users.commissionRate })
      .from(users).where(eq(users.active, true))
  )

  ipcMain.handle('user:create', async (_e, data: any) => {
    const id = uuid()
    const pinHash = await hashPin(data.pin)
    db.insert(users).values({ id, name: data.name, pinHash, role: data.role || 'cashier', active: true, createdAt: now(), hourlyRate: data.hourlyRate || 0, commissionRate: data.commissionRate || 0 }).run()
    return { id }
  })

  ipcMain.handle('user:update', async (_e, id: string, data: any) => {
    const update: any = { name: data.name, role: data.role }
    if (data.pin) update.pinHash = await hashPin(data.pin)
    if (data.hourlyRate !== undefined) update.hourlyRate = Number(data.hourlyRate) || 0
    if (data.commissionRate !== undefined) update.commissionRate = Number(data.commissionRate) || 0
    db.update(users).set(update).where(eq(users.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('user:delete', (_e, id: string) => {
    db.update(users).set({ active: false }).where(eq(users.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('user:verifyPin', async (_e, id: string, pin: string) => {
    const user = db.select().from(users).where(eq(users.id, id)).get()
    if (!user) return { ok: false, error: 'المستخدم غير موجود' }
    const valid = await verifyPin(user.pinHash, pin)
    if (!valid) return { ok: false, error: 'الرقم السري غلط' }
    return { ok: true, user: { id: user.id, name: user.name, role: user.role } }
  })

  // ═══════════════════════════════════════════════════════════
  // CUSTOMERS (delivery autocomplete)
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('customer:search', (_e, prefix: string) => {
    const digits = String(prefix || '').replace(/\D/g, '')
    if (digits.length < 3) return []
    return db.select().from(customers)
      .where(like(customers.phone, `${digits}%`))
      .orderBy(desc(customers.lastOrderAt))
      .limit(8)
      .all()
  })

  ipcMain.handle('customer:upsert', (_e, data: any) => {
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
  })

  // ═══════════════════════════════════════════════════════════
  // SHIFTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('shift:open', (_e, data: any) => {
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
  })

  ipcMain.handle('shift:close', (_e, id: string, closingCash: number) => {
    db.update(shifts).set({ endedAt: now(), closingCash, status: 'closed' }).where(eq(shifts.id, id)).run()
    db.insert(cashMovements).values({
      id: uuid(), shiftId: id, type: 'CLOSING', amount: closingCash, note: 'إغلاق الوردية', createdAt: now(),
    }).run()
    return { ok: true }
  })

  ipcMain.handle('shift:getCurrent', () =>
    db.select().from(shifts).where(eq(shifts.status, 'open')).get()
  )

  ipcMain.handle('shift:list', (_e, filters?: any) => {
    const conditions: any[] = []
    if (filters?.userId) conditions.push(eq(shifts.userId, filters.userId))
    if (filters?.from) conditions.push(gte(shifts.startedAt, filters.from))
    if (filters?.to) conditions.push(lte(shifts.startedAt, filters.to))
    const query = conditions.length > 0
      ? db.select().from(shifts).where(and(...conditions))
      : db.select().from(shifts)
    return query.orderBy(desc(shifts.startedAt)).all()
  })

  // ═══════════════════════════════════════════════════════════
  // CASH DRAWER
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('cashDrawer:addMovement', (_e, data: any) => {
    const id = uuid()
    db.insert(cashMovements).values({
      id, shiftId: data.shiftId, type: data.type, amount: data.amount, note: data.note || null, createdAt: now(),
    }).run()
    return { id }
  })

  ipcMain.handle('cashDrawer:listByShift', (_e, shiftId: string) =>
    db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).orderBy(cashMovements.createdAt).all()
  )

  ipcMain.handle('cashDrawer:reconcile', (_e, shiftId: string) => {
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
  })

  ipcMain.handle('cashDrawer:reconcileBatch', (_e, shiftIds: string[]) => {
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
  })

  ipcMain.handle('cashDrawer:expectedCash', (_e, shiftId: string) => {
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
    return { expected, breakdown }
  })

  // ═══════════════════════════════════════════════════════════
  // INVENTORY
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('inventory:listIngredients', () =>
    db.select().from(ingredients).where(eq(ingredients.active, true))
  )

  ipcMain.handle('inventory:createIngredient', (_e, data: any) => {
    const id = uuid()
    db.insert(ingredients).values({ id, ...data, active: true }).run()
    if (Number(data?.stockQuantity) > 0) {
      db.insert(inventoryTransactions).values({
        id: uuid(), ingredientId: id, type: 'ADJUSTMENT', quantity: Number(data.stockQuantity), note: 'رصيد افتتاحي', createdAt: now(),
      }).run()
    }
    return { id }
  })

  ipcMain.handle('inventory:updateIngredient', (_e, id: string, data: any) => {
    db.update(ingredients).set(data).where(eq(ingredients.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('inventory:deleteIngredient', (_e, id: string) => {
    db.update(ingredients).set({ active: false }).where(eq(ingredients.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('inventory:listRecipes', (_e, productId: string) => listRecipeRows('recipes', 'product_id', productId))

  ipcMain.handle('inventory:upsertRecipe', (_e, data: any) => {
    if (data.id) {
      db.update(recipes).set({ ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit })
        .where(eq(recipes.id, data.id)).run()
      const row = db.select().from(recipes).where(eq(recipes.id, data.id)).get()
      if (row?.productId) recomputeProductCost(row.productId)
      return { id: data.id }
    }
    const id = uuid()
    db.insert(recipes).values({ id, productId: data.productId, ingredientId: data.ingredientId ?? null, subRecipeId: data.subRecipeId ?? null, quantityPerUnit: data.quantityPerUnit }).run()
    if (data.productId) recomputeProductCost(data.productId)
    return { id }
  })

  ipcMain.handle('inventory:deleteRecipe', (_e, id: string) => {
    const row = db.select().from(recipes).where(eq(recipes.id, id)).get()
    db.delete(recipes).where(eq(recipes.id, id)).run()
    if (row?.productId) recomputeProductCost(row.productId)
    return { ok: true }
  })

  ipcMain.handle('inventory:getAlerts', () =>
    db.select().from(ingredients)
      .where(and(eq(ingredients.active, true), sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`))
      .all()
  )

  // ─── Sub-recipes (reusable prepared components) ──────────────
  ipcMain.handle('subRecipe:listAll', () => {
    const s = getSqlite()
    return s.prepare(`
      SELECT sr.id, sr.name, sr.unit, sr.active AS active,
             (SELECT COALESCE(SUM(i.cost_per_unit * sri.quantity_per_unit), 0)
              FROM sub_recipe_ingredients sri JOIN ingredients i ON i.id = sri.ingredient_id
              WHERE sri.sub_recipe_id = sr.id) AS costPerUnit,
             (SELECT COUNT(*) FROM sub_recipe_ingredients sri WHERE sri.sub_recipe_id = sr.id) AS ingredientCount
      FROM sub_recipes sr
      ORDER BY sr.name
    `).all()
  })

  ipcMain.handle('subRecipe:upsert', (_e, data: { id?: string; name: string; unit: string; active?: boolean }) => {
    if (data.id) {
      db.update(subRecipes).set({ name: data.name, unit: data.unit, active: data.active ?? true }).where(eq(subRecipes.id, data.id)).run()
      return { id: data.id }
    }
    const id = uuid()
    db.insert(subRecipes).values({ id, name: data.name, unit: data.unit || 'وحدة', active: data.active ?? true, createdAt: now() }).run()
    return { id }
  })

  ipcMain.handle('subRecipe:delete', (_e, id: string) => {
    db.update(subRecipes).set({ active: false }).where(eq(subRecipes.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('subRecipe:listIngredients', (_e, subRecipeId: string) => {
    const s = getSqlite()
    return s.prepare(`
      SELECT sri.id, sri.sub_recipe_id AS subRecipeId, sri.ingredient_id AS ingredientId,
             sri.quantity_per_unit AS quantityPerUnit, i.name AS ingredientName,
             i.unit, i.cost_per_unit AS costPerUnit,
             i.cost_per_unit * sri.quantity_per_unit AS lineCost
      FROM sub_recipe_ingredients sri JOIN ingredients i ON i.id = sri.ingredient_id
      WHERE sri.sub_recipe_id = ?
      ORDER BY i.name
    `).all(subRecipeId)
  })

  ipcMain.handle('subRecipe:upsertIngredient', (_e, data: { id?: string; subRecipeId: string; ingredientId: string; quantityPerUnit: number }) => {
    if (data.id) {
      db.update(subRecipeIngredients).set({ ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit })
        .where(eq(subRecipeIngredients.id, data.id)).run()
      return { id: data.id }
    }
    const id = uuid()
    db.insert(subRecipeIngredients).values({ id, subRecipeId: data.subRecipeId, ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit }).run()
    return { id }
  })

  ipcMain.handle('subRecipe:deleteIngredient', (_e, id: string) => {
    db.delete(subRecipeIngredients).where(eq(subRecipeIngredients.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('inventory:getPurchaseSavings', () => {
    const s = getSqlite()
    const rows = s.prepare(`
      SELECT ph.ingredient_id AS ingredientId, ph.unit_cost AS unitCost, ph.quantity AS quantity,
             i.cost_per_unit AS costPerUnit, i.name AS name
      FROM purchase_price_history ph
      JOIN ingredients i ON i.id = ph.ingredient_id
      ORDER BY ph.purchased_at DESC, ph.created_at DESC
    `).all() as any[]
    const out: Record<string, { name: string; standard: number; lastUnitCost: number | null; totalSaved: number }> = {}
    for (const r of rows) {
      const standard = r.costPerUnit || 0
      if (!out[r.ingredientId]) {
        out[r.ingredientId] = { name: r.name, standard, lastUnitCost: null, totalSaved: 0 }
      }
      if (out[r.ingredientId].lastUnitCost == null) out[r.ingredientId].lastUnitCost = r.unitCost
      if (standard > r.unitCost && r.quantity) {
        out[r.ingredientId].totalSaved += (standard - r.unitCost) * r.quantity
      }
    }
    for (const k of Object.keys(out)) out[k].totalSaved = r2(out[k].totalSaved)
    return out
  })

  ipcMain.handle('inventory:restock', (_e, ingredientId: string, qty: number, note?: string, opts?: { unitCost?: number; supplier?: string }) => {
    const unitCost = opts?.unitCost != null ? Number(opts.unitCost) : null
    const supplier = opts?.supplier?.trim() || null
    db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} + ${qty}` })
      .where(eq(ingredients.id, ingredientId)).run()
    db.insert(inventoryTransactions).values({
      id: uuid(), ingredientId, type: 'PURCHASE', quantity: qty, unitCost, supplier, note: note || 'إعادة تعبئة', createdAt: now(),
    }).run()
    const ing = db.select().from(ingredients).where(eq(ingredients.id, ingredientId)).get()
    if (ing && !ing.supplier && supplier) {
      db.update(ingredients).set({ supplier }).where(eq(ingredients.id, ingredientId)).run()
    }
    // Always record a price-history row so the purchase price variance report
    // reflects every purchase. Falls back to the ingredient's current cost.
    const effectiveUnitCost = unitCost != null ? unitCost : (ing?.costPerUnit || 0)
    if (effectiveUnitCost > 0) {
      db.insert(purchasePriceHistory).values({
        id: uuid(), ingredientId, supplier: supplier || ing?.supplier || null, unitCost: effectiveUnitCost, quantity: qty,
        purchasedAt: now().slice(0, 10), createdAt: now(),
      }).run()
    }
    if (unitCost != null) {
      const baseline = ing && ing.plannedCost > 0 ? ing.plannedCost : ing?.costPerUnit || 0
      const ppv = baseline > 0 ? (unitCost - baseline) * qty : 0
      return { ok: true, ppv: r2(ppv) }
    }
    return { ok: true }
  })

  const r2 = (n: number) => Math.round(n * 100) / 100

  ipcMain.handle('inventory:listTransactions', (_e, ingredientId: string, filters?: { type?: string; from?: string; to?: string; page?: number; pageSize?: number }) => {
    const s = getSqlite()
    const ingredient = s.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingredientId) as any
    if (!ingredient) return { ingredient: null, currentStock: 0, openingBalance: 0, movements: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
    const conds = ['t.ingredient_id = ?']
    const params: any[] = [ingredientId]
    if (filters?.type) { conds.push('t.type = ?'); params.push(filters.type) }
    if (filters?.from) { conds.push('t.created_at >= ?'); params.push(filters.from) }
    if (filters?.to) { conds.push('t.created_at <= ?'); params.push(filters.to + '\uffff') }
    const where = `WHERE ${conds.join(' AND ')}`
    const total = (s.prepare(`SELECT COUNT(*) as c FROM inventory_transactions t ${where}`).get(...params) as any).c
    const pageSize = Math.min(Math.max(filters?.pageSize || 20, 5), 100)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(Math.max(filters?.page || 1, 1), totalPages)
    const offset = (page - 1) * pageSize
    const rows = s.prepare(`
      SELECT t.id, t.ingredient_id AS ingredientId, t.type, t.quantity,
             t.reference_order_id AS referenceOrderId, t.note, t.created_at AS createdAt
      FROM inventory_transactions t
      ${where}
      ORDER BY t.created_at DESC, t.rowid DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[]
    const currentStock = Number(ingredient.stock_quantity) || 0
    const grandTotal = (s.prepare(`SELECT COALESCE(SUM(quantity), 0) as t FROM inventory_transactions t ${where}`).get(...params) as any).t || 0
    // Balance-after per row: walk backwards from current stock over strictly-newer movements
    const newerIds = rows.length ? rows.map(r => `'${String(r.id).replace(/'/g, "''")}'`).join(',') : null
    const newerTotal = newerIds
      ? ((s.prepare(`SELECT COALESCE(SUM(quantity), 0) as t FROM inventory_transactions t ${where} AND t.created_at > (SELECT MIN(created_at) FROM inventory_transactions WHERE id IN (${newerIds}))`).get(...params) as any).t || 0)
      : 0
    const sameTsNewer = newerIds
      ? ((s.prepare(`SELECT COALESCE(SUM(quantity), 0) as t FROM inventory_transactions t ${where} AND t.created_at = (SELECT MIN(created_at) FROM inventory_transactions WHERE id IN (${newerIds})) AND t.id NOT IN (${newerIds})`).get(...params) as any).t || 0)
      : 0
    let running = r2(currentStock - newerTotal - sameTsNewer)
    const asc = [...rows].reverse()
    const withBal = asc.map(r => {
      const bal = running
      running = r2(running - (Number(r.quantity) || 0))
      return { ...r, quantity: Number(r.quantity) || 0, balance: bal }
    })
    const movements = withBal.reverse()
    return { ingredient, currentStock, openingBalance: r2(currentStock - grandTotal), movements, total, page, pageSize, totalPages }
  })

  ipcMain.handle('inventory:recordWaste', (_e, ingredientId: string, qty: number, note?: string) => {
    const amount = -Math.abs(Number(qty) || 0)
    db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} + ${amount}` })
      .where(eq(ingredients.id, ingredientId)).run()
    db.insert(inventoryTransactions).values({
      id: uuid(), ingredientId, type: 'WASTE', quantity: amount, note: note || 'تالف', createdAt: now(),
    }).run()
    return { ok: true }
  })

  ipcMain.handle('inventory:adjust', (_e, ingredientId: string, delta: number, note?: string) => {
    const qty = Number(delta) || 0
    db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} + ${qty}` })
      .where(eq(ingredients.id, ingredientId)).run()
    db.insert(inventoryTransactions).values({
      id: uuid(), ingredientId, type: 'ADJUSTMENT', quantity: qty, note: note || 'تسوية يدوية', createdAt: now(),
    }).run()
    return { ok: true }
  })

  ipcMain.handle('inventory:deductForOrder', (_e, orderId: string) => {
    deductInventory(orderId)
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('report:dailySummary', (_e, date?: string) => {
    const targetDate = date || new Date().toISOString().slice(0, 10)
    const s = getSqlite()
    const all = s.prepare('SELECT * FROM orders').all() as any[]
    const dayOrders = all.filter(o => o.created_at?.startsWith(targetDate) && o.status !== 'CANCELLED')
    const cancelled = all.filter(o => o.created_at?.startsWith(targetDate) && o.status === 'CANCELLED')
    const refunded = all.filter(o => o.created_at?.startsWith(targetDate) && o.status === 'REFUNDED')
    const totalRefunded = refunded.reduce((sum, o) => sum + (o.refunded_amount || 0), 0)
    const revenue = dayOrders.reduce((sum, o) => sum + o.total, 0) - totalRefunded

    const costOfGoods = dayOrders.reduce((sum, o) => {
      const items = s.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id) as any[]
      return sum + items.reduce((is, item) => {
        const p = s.prepare('SELECT cost_price FROM products WHERE id = ?').get(item.product_id) as { cost_price: number } | undefined
        return is + (p?.cost_price || 0) * item.quantity
      }, 0)
    }, 0)

    return {
      date: targetDate,
      totalOrders: dayOrders.length,
      totalRevenue: revenue,
      avgOrderValue: dayOrders.length > 0 ? revenue / dayOrders.length : 0,
      cancelledOrders: cancelled.length,
      refundedOrders: refunded.length,
      totalRefunded,
      cancellationRate: 0,
      costOfGoods,
      grossProfit: revenue - costOfGoods,
    }
  })

  ipcMain.handle('report:periodSummary', (_e, from?: string, to?: string) => {
    const s = getSqlite()
    const allOrders = s.prepare('SELECT * FROM orders').all() as any[]
    const inRange = (o: any) => {
      if (from && o.created_at < from) return false
      if (to && o.created_at > to + '\uffff') return false
      return true
    }
    const active = allOrders.filter(o => o.status !== 'CANCELLED' && inRange(o))
    const cancelled = allOrders.filter(o => o.status === 'CANCELLED' && inRange(o))
    const refunded = active.filter(o => o.status === 'REFUNDED')
    const totalRefunded = refunded.reduce((sum, o) => sum + (o.refunded_amount || 0), 0)
    const totalRevenue = active.reduce((sum, o) => sum + o.total, 0) - totalRefunded

    const costOfGoods = active.reduce((sum, o) => {
      const items = s.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id) as any[]
      return sum + items.reduce((is, item) => {
        const p = s.prepare('SELECT cost_price FROM products WHERE id = ?').get(item.product_id) as { cost_price: number } | undefined
        return is + (p?.cost_price || 0) * item.quantity
      }, 0)
    }, 0)

    return {
      from: from || null,
      to: to || null,
      totalOrders: active.length,
      totalRevenue,
      avgOrderValue: active.length > 0 ? totalRevenue / active.length : 0,
      cancelledOrders: cancelled.length,
      refundedOrders: refunded.length,
      totalRefunded,
      costOfGoods,
      grossProfit: totalRevenue - costOfGoods,
    }
  })

  ipcMain.handle('report:profitSummary', (_e, from?: string, to?: string) => {
    const s = getSqlite()
    const all = (s.prepare('SELECT * FROM orders').all() as any[]).filter(o => {
      if (o.status === 'CANCELLED') return false
      if (from && o.created_at < from) return false
      if (to && o.created_at > to + '\uffff') return false
      return true
    })
    const refunded = all.filter(o => o.status === 'REFUNDED')
    const totalRefunded = refunded.reduce((sum, o) => sum + (o.refunded_amount || 0), 0)
    const revenue = all.reduce((sum, o) => sum + o.total, 0) - totalRefunded

    const costOfGoods = all.reduce((sum, o) => {
      const items = s.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id) as any[]
      return sum + items.reduce((is, item) => {
        const p = s.prepare('SELECT cost_price FROM products WHERE id = ?').get(item.product_id) as { cost_price: number } | undefined
        return is + (p?.cost_price || 0) * item.quantity
      }, 0)
    }, 0)

    const totalExpenses = (s.prepare('SELECT amount FROM expenses WHERE active = 1').all() as any[])
      .reduce((sum, e) => sum + e.amount, 0)
    const deliveryFees = all.filter(o => o.order_type === 'delivery').reduce((sum, o) => sum + (o.delivery_fee || 0), 0)
    const discounts = all.reduce((sum, o) => sum + (o.discount_amount || 0), 0)
    const taxCollected = all.reduce((sum, o) => sum + o.tax, 0)

    return {
      revenue,
      costOfGoods,
      grossProfit: revenue - costOfGoods,
      totalExpenses,
      deliveryFees,
      discounts,
      taxCollected,
      totalRefunded,
      netProfit: revenue - costOfGoods - totalExpenses,
    }
  })

  ipcMain.handle('report:hourlyBreakdown', (_e, date?: string) => {
    const targetDate = date || new Date().toISOString().slice(0, 10)
    const all = db.select().from(orders).all()
    const dayOrders = all.filter(o => o.createdAt.startsWith(targetDate) && o.status !== 'CANCELLED')
    const hours: Record<number, { orderCount: number; revenue: number }> = {}
    for (let h = 0; h < 24; h++) hours[h] = { orderCount: 0, revenue: 0 }
    for (const o of dayOrders) {
      const h = new Date(o.createdAt).getHours()
      hours[h].orderCount++
      hours[h].revenue += o.total
    }
    return Object.entries(hours).map(([hour, data]) => ({ hour: Number(hour), ...data }))
  })

  ipcMain.handle('report:topItems', (_e, limit = 10, from?: string, to?: string) => {
    const all = db.select().from(orderItems).all()
    const allOrders = db.select().from(orders).all()
    const validOrderIds = new Set(
      allOrders.filter(o => {
        if (o.status === 'CANCELLED') return false
        if (from && o.createdAt < from) return false
        if (to && o.createdAt > to + '\uffff') return false
        return true
      }).map(o => o.id)
    )
    const allProducts = db.select().from(products).all()
    const productMap = new Map(allProducts.map(p => [p.id, p]))

    const counts: Record<string, { name: string; emoji: string; totalQuantity: number; totalRevenue: number }> = {}
    for (const item of all) {
      if (!validOrderIds.has(item.orderId)) continue
      const p = productMap.get(item.productId)
      if (!p) continue
      if (!counts[p.id]) counts[p.id] = { name: p.name, emoji: p.emoji, totalQuantity: 0, totalRevenue: 0 }
      counts[p.id].totalQuantity += item.quantity
      counts[p.id].totalRevenue += item.unitPrice * item.quantity
    }
    return Object.values(counts).sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, limit)
  })

  ipcMain.handle('report:categoryRevenue', (_e, from?: string, to?: string) => {
    const allOrders = db.select().from(orders).all()
    const validOrderIds = new Set(
      allOrders.filter(o => {
        if (o.status === 'CANCELLED') return false
        if (from && o.createdAt < from) return false
        if (to && o.createdAt > to + '\uffff') return false
        return true
      }).map(o => o.id)
    )
    const allItems = db.select().from(orderItems).all().filter(i => validOrderIds.has(i.orderId))
    const allProducts = db.select().from(products).all()
    const productMap = new Map(allProducts.map(p => [p.id, p]))
    const allCats = db.select().from(categories).all()
    const catMap = new Map(allCats.map(c => [c.id, c]))

    const catRevenue: Record<string, { name: string; totalRevenue: number }> = {}
    for (const item of allItems) {
      const p = productMap.get(item.productId)
      if (!p) continue
      const c = catMap.get(p.categoryId)
      if (!c) continue
      if (!catRevenue[c.id]) catRevenue[c.id] = { name: c.name, totalRevenue: 0 }
      catRevenue[c.id].totalRevenue += item.unitPrice * item.quantity
    }
    return Object.entries(catRevenue).map(([id, data]) => ({ categoryId: id, ...data }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
  })

  ipcMain.handle('report:addonStats', (_e, from?: string, to?: string) => {
    const allOrders = db.select().from(orders).all()
    const validOrderIds = new Set(
      allOrders.filter(o => {
        if (o.status === 'CANCELLED') return false
        if (from && o.createdAt < from) return false
        if (to && o.createdAt > to + '\uffff') return false
        return true
      }).map(o => o.id)
    )
    const allItems = db.select().from(orderItems).all().filter(i => validOrderIds.has(i.orderId))
    const allAddons = db.select().from(addons).all()
    const addonMap = new Map(allAddons.map(a => [a.id, a]))

    const counts: Record<string, { name: string; emoji: string; totalQuantity: number; totalRevenue: number }> = {}
    for (const item of allItems) {
      if (!item.selectedAddonsJson) continue
      const ids = JSON.parse(item.selectedAddonsJson) as string[]
      for (const addonId of ids) {
        const a = addonMap.get(addonId)
        if (!a) continue
        if (!counts[a.id]) counts[a.id] = { name: a.name, emoji: a.emoji, totalQuantity: 0, totalRevenue: 0 }
        counts[a.id].totalQuantity += item.quantity
        counts[a.id].totalRevenue += a.price * item.quantity
      }
    }
    return Object.values(counts).sort((a, b) => b.totalQuantity - a.totalQuantity)
  })

  ipcMain.handle('report:ticketDistribution', (_e, from?: string, to?: string) => {
    const allOrders = db.select().from(orders).all().filter(o => {
      if (o.status === 'CANCELLED') return false
      if (from && o.createdAt < from) return false
      if (to && o.createdAt > to + '\uffff') return false
      return true
    })
    const ranges = [
      { range: '< 50', min: 0, max: 50 },
      { range: '50-100', min: 50, max: 100 },
      { range: '100-200', min: 100, max: 200 },
      { range: '200-300', min: 200, max: 300 },
      { range: '300+', min: 300, max: Infinity },
    ]
    return ranges.map(r => ({
      range: r.range,
      count: allOrders.filter(o => o.total >= r.min && o.total < r.max).length,
      percentage: allOrders.length > 0 ? allOrders.filter(o => o.total >= r.min && o.total < r.max).length / allOrders.length * 100 : 0,
    }))
  })

  ipcMain.handle('report:orderTypeSplit', (_e, from?: string, to?: string) => {
    const allOrders = db.select().from(orders).all().filter(o => {
      if (o.status === 'CANCELLED') return false
      if (from && o.createdAt < from) return false
      if (to && o.createdAt > to + '\uffff') return false
      return true
    })
    const delivery = allOrders.filter(o => o.orderType === 'delivery')
    const dineIn = allOrders.filter(o => o.orderType === 'dine-in')
    const total = allOrders.length || 1
    return {
      delivery: { count: delivery.length, revenue: delivery.reduce((s, o) => s + o.total, 0), percentage: delivery.length / total * 100 },
      dineIn: { count: dineIn.length, revenue: dineIn.reduce((s, o) => s + o.total, 0), percentage: dineIn.length / total * 100 },
    }
  })

  ipcMain.handle('report:shiftReport', (_e, shiftId: string) => {
    const shift = db.select().from(shifts).where(eq(shifts.id, shiftId)).get()
    if (!shift) return null
    const user = db.select().from(users).where(eq(users.id, shift.userId)).get()
    const shiftOrders = db.select().from(orders)
      .where(and(eq(orders.shiftId, shiftId), sql`${orders.status} != 'CANCELLED'`)).all()
    const movs = db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).all()

    let expectedCash = shift.openingCash
    for (const m of movs) {
      if (m.type === 'OPENING' || m.type === 'CLOSING') continue
      const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
      expectedCash += m.amount * sign
    }

    return {
      shiftId,
      userName: user?.name || 'غير معروف',
      startedAt: shift.startedAt,
      endedAt: shift.endedAt,
      orderCount: shiftOrders.length,
      totalRevenue: shiftOrders.reduce((s, o) => s + o.total, 0),
      openingCash: shift.openingCash,
      closingCash: shift.closingCash,
      expectedCash,
      cashDifference: shift.closingCash != null ? shift.closingCash - expectedCash : null,
    }
  })

  ipcMain.handle('report:shiftSummary', (_e, from?: string, to?: string) => {
    const conditions: any[] = []
    if (from) conditions.push(gte(shifts.startedAt, from))
    if (to) {
      const toDate = new Date(to)
      toDate.setHours(23, 59, 59, 999)
      conditions.push(lte(shifts.startedAt, toDate.toISOString()))
    }
    const query = conditions.length > 0
      ? db.select().from(shifts).where(and(...conditions))
      : db.select().from(shifts)
    const allShifts = query.orderBy(desc(shifts.startedAt)).all()

    let totalRevenue = 0
    let totalOrders = 0
    let totalExpectedCash = 0
    let totalActualCash = 0
    let totalShorts = 0
    let totalOverages = 0
    let closedCount = 0
    const shiftDetails: any[] = []

    for (const s of allShifts) {
      const shiftOrders = db.select().from(orders)
        .where(and(eq(orders.shiftId, s.id), sql`${orders.status} != 'CANCELLED'`)).all()
      const movs = db.select().from(cashMovements).where(eq(cashMovements.shiftId, s.id)).all()
      const user = db.select().from(users).where(eq(users.id, s.userId)).get()

      let expected = s.openingCash
      const breakdown: Record<string, number> = {}
      for (const m of movs) {
        if (m.type === 'OPENING' || m.type === 'CLOSING') continue
        const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
        expected += m.amount * sign
        breakdown[m.type] = (breakdown[m.type] || 0) + m.amount * sign
      }

      const revenue = shiftOrders.reduce((sum, o) => sum + o.total, 0)
      totalRevenue += revenue
      totalOrders += shiftOrders.length
      totalExpectedCash += expected

      const diff = s.closingCash != null ? s.closingCash - expected : null
      if (diff != null) {
        totalActualCash += s.closingCash!
        if (diff < 0) totalShorts += Math.abs(diff)
        else if (diff > 0) totalOverages += diff
        closedCount++
      }

      const duration = s.endedAt
        ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 3600000)
        : null

      shiftDetails.push({
        id: s.id,
        userName: user?.name || 'غير معروف',
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        status: s.status,
        duration,
        orderCount: shiftOrders.length,
        revenue,
        openingCash: s.openingCash,
        closingCash: s.closingCash,
        expectedCash: expected,
        difference: diff,
        breakdown,
      })
    }

    return {
      totalShifts: allShifts.length,
      closedCount,
      openCount: allShifts.filter(s => s.status === 'open').length,
      totalRevenue,
      totalOrders,
      avgRevenuePerShift: closedCount > 0 ? totalRevenue / closedCount : 0,
      avgOrdersPerShift: closedCount > 0 ? totalOrders / closedCount : 0,
      totalExpectedCash,
      totalActualCash,
      totalShorts,
      totalOverages,
      shifts: shiftDetails,
    }
  })

  ipcMain.handle('report:laborSummary', (_e, from?: string, to?: string) => {
    const inRange = (ts: string) => {
      if (from && ts < from) return false
      if (to && ts > to + '\uffff') return false
      return true
    }
    const allUsers = db.select().from(users).where(eq(users.active, true)).all()
    const allShifts = db.select().from(shifts).all().filter(x => inRange(x.startedAt))
    const allOrders = db.select().from(orders).all().filter(o => o.status !== 'CANCELLED' && inRange(o.createdAt))

    const totalRevenue = allOrders.reduce((sum, o) => sum + o.total, 0)
    let totalLaborCost = 0
    const staff: any[] = []

    for (const u of allUsers) {
      const uShifts = allShifts.filter(x => x.userId === u.id)
      const hoursWorked = uShifts.reduce((sum, x) => {
        if (!x.endedAt) return sum
        return sum + (new Date(x.endedAt).getTime() - new Date(x.startedAt).getTime()) / 3600000
      }, 0)
      const uOrders = allOrders.filter(o => o.userId === u.id)
      const sales = uOrders.reduce((sum, o) => sum + o.total, 0)
      const wage = hoursWorked * (u.hourlyRate || 0)
      const commission = sales * ((u.commissionRate || 0) / 100)
      const laborCost = wage + commission
      totalLaborCost += laborCost
      staff.push({
        id: u.id,
        name: u.name,
        role: u.role,
        hourlyRate: u.hourlyRate || 0,
        commissionRate: u.commissionRate || 0,
        shiftCount: uShifts.length,
        hoursWorked: Math.round(hoursWorked * 10) / 10,
        orderCount: uOrders.length,
        sales,
        wage: Math.round(wage),
        commission: Math.round(commission),
        laborCost: Math.round(laborCost),
      })
    }

    staff.sort((a, b) => b.sales - a.sales)
    return {
      totalRevenue,
      totalLaborCost: Math.round(totalLaborCost),
      laborCostPct: totalRevenue > 0 ? (totalLaborCost / totalRevenue) * 100 : 0,
      staff,
    }
  })

  ipcMain.handle('report:voidSummary', (_e, from?: string, to?: string) => {
    const inRange = (ts: string) => {
      if (from && ts < from) return false
      if (to && ts > to + '\uffff') return false
      return true
    }
    const allOrders = db.select().from(orders).all().filter(o => inRange(o.createdAt))
    const cancelled = allOrders.filter(o => o.status === 'CANCELLED')
    const refunded = allOrders.filter(o => o.status === 'REFUNDED')
    const allUsers = db.select().from(users).all()

    const voidByUser: Record<string, any> = {}
    const bump = (userId: string | null, cashierName: string | null, kind: 'cancel' | 'refund', amount: number) => {
      const key = userId || cashierName || 'unknown'
      if (!voidByUser[key]) {
        const u = allUsers.find(x => x.id === userId)
        voidByUser[key] = { name: u?.name || cashierName || 'غير معروف', cancels: 0, refunds: 0, cancelAmount: 0, refundAmount: 0 }
      }
      if (kind === 'cancel') { voidByUser[key].cancels++; voidByUser[key].cancelAmount += amount }
      else { voidByUser[key].refunds++; voidByUser[key].refundAmount += amount }
    }
    for (const o of cancelled) bump(o.userId, o.cashierName, 'cancel', o.total)
    for (const o of refunded) bump(o.userId, o.cashierName, 'refund', o.refundedAmount || o.total)

    const discounted = allOrders.filter(o => o.status !== 'CANCELLED' && (o.discountAmount || 0) > 0)
    const discountByUser: Record<string, any> = {}
    for (const o of discounted) {
      const key = o.userId || o.cashierName || 'unknown'
      if (!discountByUser[key]) {
        const u = allUsers.find(x => x.id === o.userId)
        discountByUser[key] = { name: u?.name || o.cashierName || 'غير معروف', count: 0, total: 0 }
      }
      discountByUser[key].count++
      discountByUser[key].total += o.discountAmount || 0
    }

    return {
      cancelCount: cancelled.length,
      cancelAmount: cancelled.reduce((sum, o) => sum + o.total, 0),
      refundCount: refunded.length,
      refundAmount: refunded.reduce((sum, o) => sum + (o.refundedAmount || 0), 0),
      discountCount: discounted.length,
      discountAmount: discounted.reduce((sum, o) => sum + (o.discountAmount || 0), 0),
      cancels: cancelled.slice(0, 20).map(o => ({
        id: o.id, total: o.total, reason: o.statusReason, cashierName: o.cashierName, createdAt: o.createdAt,
      })),
      refunds: refunded.slice(0, 20).map(o => ({
        id: o.id, total: o.total, refundedAmount: o.refundedAmount, reason: o.statusReason, cashierName: o.cashierName, createdAt: o.createdAt,
      })),
      discounts: discounted.slice(0, 20).map(o => ({
        id: o.id, total: o.total, discountAmount: o.discountAmount, discountCode: o.discountCode, cashierName: o.cashierName, createdAt: o.createdAt,
      })),
      voidByUser: Object.values(voidByUser).sort((a: any, b: any) => (b.cancelAmount + b.refundAmount) - (a.cancelAmount + a.refundAmount)),
      discountByUser: Object.values(discountByUser).sort((a: any, b: any) => b.total - a.total),
    }
  })

  ipcMain.handle('report:revenueTrend', (_e, days = 7) => {
    const allOrders = db.select().from(orders).all().filter(o => o.status !== 'CANCELLED')
    const result: { date: string; revenue: number; orderCount: number }[] = []
    for (let d = days - 1; d >= 0; d--) {
      const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
      const dayOrders = allOrders.filter(o => o.createdAt.startsWith(date))
      result.push({ date, revenue: dayOrders.reduce((s, o) => s + o.total, 0), orderCount: dayOrders.length })
    }
    return result
  })

  ipcMain.handle('report:inventoryAlerts', () =>
    db.select().from(ingredients)
      .where(and(eq(ingredients.active, true), sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`))
      .all()
  )

  ipcMain.handle('report:paymentMethodBreakdown', (_e, from?: string, to?: string) => {
    const allOrders = db.select().from(orders).all().filter(o => {
      if (o.status === 'CANCELLED') return false
      if (from && o.createdAt < from) return false
      if (to && o.createdAt > to + '\uffff') return false
      return true
    })
    const validOrderIds = new Set(allOrders.map(o => o.id))
    const allPayments = db.select().from(payments).all().filter(p => validOrderIds.has(p.orderId))
    const methods: Record<string, { method: string; count: number; total: number }> = {}
    for (const p of allPayments) {
      if (!methods[p.method]) methods[p.method] = { method: p.method, count: 0, total: 0 }
      methods[p.method].count++
      methods[p.method].total += p.amount
    }
    return Object.values(methods)
  })

  // ─── Market-resilience analytics (ABC/XYZ, turnover, PPV, trend, DIO) ──
  const ABC_XYZ_POLICIES: Record<string, string> = {
    AX: 'إعادة طلب يومية + مراقبة مستمرة',
    AY: 'طلب أسبوعي + مراقبة مستمرة',
    AZ: 'طلب أسبوعي + مخزون أمان مرتفع',
    BX: 'طلب أسبوعي',
    BY: 'طلب كل أسبوعين',
    BZ: 'طلب كل أسبوعين + مخزون أمان',
    CX: 'طلب شهري بكميات كبيرة',
    CY: 'طلب شهري',
    CZ: 'أولوية منخفضة — دفعة شهرية',
  }

  ipcMain.handle('report:abcXyz', (_e, from?: string, to?: string) => {
    const allOrders = db.select().from(orders).all().filter(o => {
      if (o.status === 'CANCELLED') return false
      if (from && o.createdAt < from) return false
      if (to && o.createdAt > to + '\uffff') return false
      return true
    })
    const validOrderIds = new Set(allOrders.map(o => o.id))
    const items = db.select().from(orderItems).all().filter(i => validOrderIds.has(i.orderId))
    const productMap = new Map(db.select().from(products).all().map(p => [p.id, p]))

    const agg: Record<string, { productId: string; name: string; emoji: string; revenue: number; qty: number }> = {}
    let totalRevenue = 0
    for (const item of items) {
      const p = productMap.get(item.productId)
      if (!p) continue
      if (!agg[p.id]) agg[p.id] = { productId: p.id, name: p.name, emoji: p.emoji, revenue: 0, qty: 0 }
      agg[p.id].revenue += item.unitPrice * item.quantity
      agg[p.id].qty += item.quantity
      totalRevenue += item.unitPrice * item.quantity
    }
    const ranked = Object.values(agg).sort((a, b) => b.revenue - a.revenue)
    let cum = 0
    const productRows = ranked.map(row => {
      const share = totalRevenue > 0 ? row.revenue / totalRevenue : 0
      cum += share
      return { ...row, revenue: r2(row.revenue), share: r2(share), cumShare: r2(cum), abc: abcClass(cum) }
    })

    // XYZ: coefficient of variation of daily qty over the last 90 days
    const lookback = 90
    const cutoff = new Date(Date.now() - lookback * 86400000).toISOString().slice(0, 10)
    const histOrders = db.select().from(orders).all()
    const histValid = new Set(histOrders.filter(o => o.status !== 'CANCELLED' && o.createdAt >= cutoff).map(o => o.id))
    const histOrderMap = new Map(histOrders.map(o => [o.id, o]))
    const dailyQty: Record<string, Record<string, number>> = {}
    for (const item of db.select().from(orderItems).all()) {
      if (!histValid.has(item.orderId)) continue
      const date = histOrderMap.get(item.orderId)?.createdAt.slice(0, 10)
      if (!date) continue
      if (!dailyQty[item.productId]) dailyQty[item.productId] = {}
      dailyQty[item.productId][date] = (dailyQty[item.productId][date] || 0) + item.quantity
    }
    const dayList: string[] = []
    for (let d = lookback - 1; d >= 0; d--) dayList.push(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10))
    const xyzMap: Record<string, { xyz: string; cv: number }> = {}
    for (const pid of Object.keys(agg)) {
      const values = dayList.map(dd => dailyQty[pid]?.[dd] || 0)
      const mean = values.reduce((sum, v) => sum + v, 0) / lookback
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / lookback
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 999
      xyzMap[pid] = { xyz: xyzClass(cv), cv: r2(cv > 999 ? 999 : cv) }
    }

    const classified = productRows.map(row => ({
      ...row,
      xyz: xyzMap[row.productId]?.xyz || 'Z',
      cv: xyzMap[row.productId]?.cv ?? 0,
    }))

    const classes: string[] = []
    for (const abc of ['A', 'B', 'C']) for (const xyz of ['X', 'Y', 'Z']) classes.push(abc + xyz)
    const matrixCounts = Object.fromEntries(classes.map(c => [c, 0]))
    for (const row of classified) matrixCounts[row.abc + row.xyz]++

    return {
      from: from || null,
      to: to || null,
      totalRevenue: r2(totalRevenue),
      totalProducts: classified.length,
      products: classified,
      matrixCounts,
      policies: ABC_XYZ_POLICIES,
    }
  })

  ipcMain.handle('report:inventoryTurnover', (_e, from?: string, to?: string) => {
    const s = getSqlite()
    const allOrders = db.select().from(orders).all().filter(o => {
      if (o.status === 'CANCELLED') return false
      if (from && o.createdAt < from) return false
      if (to && o.createdAt > to + '\uffff') return false
      return true
    })
    const validOrderIds = new Set(allOrders.map(o => o.id))
    const items = db.select().from(orderItems).all().filter(i => validOrderIds.has(i.orderId))
    const consumption: Record<string, number> = {}
    const bump = (ingredientId: string, qty: number) => {
      consumption[ingredientId] = (consumption[ingredientId] || 0) + qty
    }
    for (const item of items) {
      for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM recipes WHERE product_id = ?').all(item.productId) as any[]))
        bump(c.ingredientId, c.qty * item.quantity)
      if (item.selectedAddonsJson) {
        try {
          for (const addonId of JSON.parse(item.selectedAddonsJson) as string[])
            for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM addon_recipes WHERE addon_id = ?').all(addonId) as any[]))
              bump(c.ingredientId, c.qty * item.quantity)
        } catch {}
      }
      if (item.selectedModifiersJson) {
        try {
          for (const mod of JSON.parse(item.selectedModifiersJson) as { modifierId: string }[])
            for (const c of expandRecipes(s.prepare('SELECT ingredient_id, sub_recipe_id, quantity_per_unit FROM modifier_recipes WHERE modifier_id = ?').all(mod.modifierId) as any[]))
              bump(c.ingredientId, c.qty * item.quantity)
        } catch {}
      }
    }

    // Reconstruct stock at period boundaries from the transaction ledger
    const txRows = s.prepare('SELECT ingredient_id, quantity, created_at FROM inventory_transactions').all() as any[]
    const totalTx: Record<string, number> = {}
    const txBeforeStart: Record<string, number> = {}
    const txUpToEnd: Record<string, number> = {}
    for (const t of txRows) {
      const q = Number(t.quantity) || 0
      totalTx[t.ingredient_id] = (totalTx[t.ingredient_id] || 0) + q
      if (from && t.created_at < from) txBeforeStart[t.ingredient_id] = (txBeforeStart[t.ingredient_id] || 0) + q
      if (to && t.created_at <= to + '\uffff') txUpToEnd[t.ingredient_id] = (txUpToEnd[t.ingredient_id] || 0) + q
    }

    const active = db.select().from(ingredients).where(eq(ingredients.active, true)).all()
    let totalCogs = 0
    let totalAvgStockValue = 0
    const rows = active.map(ing => {
      const unitCost = Number(ing.costPerUnit) || 0
      const base = Number(ing.stockQuantity || 0) - (totalTx[ing.id] || 0)
      const stockStart = from ? base + (txBeforeStart[ing.id] || 0) : Number(ing.stockQuantity || 0)
      const stockEnd = to ? base + (txUpToEnd[ing.id] || 0) : Number(ing.stockQuantity || 0)
      const avgStockUnits = (stockStart + stockEnd) / 2
      const avgStockValue = Math.max(0, avgStockUnits) * unitCost
      const cogs = (consumption[ing.id] || 0) * unitCost
      const turnover = avgStockValue > 0 && cogs > 0 ? cogs / avgStockValue : 0
      totalCogs += cogs
      totalAvgStockValue += avgStockValue
      return {
        ingredientId: ing.id,
        name: ing.name,
        unit: ing.unit,
        supplier: ing.supplier,
        unitCost: r2(unitCost),
        consumptionUnits: r2(consumption[ing.id] || 0),
        cogsPeriod: r2(cogs),
        stockStart: r2(stockStart),
        stockEnd: r2(stockEnd),
        avgStockUnits: r2(avgStockUnits),
        avgStockValue: r2(avgStockValue),
        stockValueCurrent: r2(Number(ing.stockQuantity || 0) * unitCost),
        turnover: turnover > 0 ? r2(turnover) : 0,
      }
    }).sort((a, b) => b.turnover - a.turnover)

    return {
      from: from || null,
      to: to || null,
      rows,
      totalCogs: r2(totalCogs),
      totalAvgStockValue: r2(totalAvgStockValue),
      weightedTurnover: totalAvgStockValue > 0 ? r2(totalCogs / totalAvgStockValue) : 0,
    }
  })

  ipcMain.handle('report:purchasePriceVariance', (_e, from?: string, to?: string) => {
    const s = getSqlite()
    let where = 'WHERE 1=1'
    const params: any[] = []
    if (from) { where += ' AND purchased_at >= ?'; params.push(from) }
    if (to) { where += ' AND purchased_at <= ?'; params.push(to + '\uffff') }
    const rows = s.prepare(
      `SELECT ingredient_id AS ingredientId, supplier, unit_cost AS unitCost, quantity, purchased_at AS purchasedAt
       FROM purchase_price_history ${where} ORDER BY purchased_at ASC`
    ).all(...params) as any[]
    const ingredientMap = new Map(db.select().from(ingredients).all().map(i => [i.id, i]))
    const agg: Record<string, any> = {}
    for (const r of rows) {
      const ing = ingredientMap.get(r.ingredientId)
      if (!ing) continue
      if (!agg[ing.id]) {
        agg[ing.id] = {
          ingredientId: ing.id, name: ing.name, unit: ing.unit,
          plannedCost: Number(ing.plannedCost) || 0,
          currentCost: Number(ing.costPerUnit) || 0,
          standardCost: (Number(ing.plannedCost) || 0) > 0 ? Number(ing.plannedCost) : (Number(ing.costPerUnit) || 0),
          purchases: 0, qty: 0, spend: 0, lastCost: 0, lastDate: null as string | null, lastSupplier: null as string | null,
        }
      }
      const a = agg[ing.id]
      a.purchases++
      const qty = Number(r.quantity) || 0
      const cost = Number(r.unitCost) || 0
      a.qty += qty
      a.spend += cost * qty
      a.lastCost = cost
      a.lastDate = r.purchasedAt
      if (r.supplier) a.lastSupplier = r.supplier
    }
    let totalSpend = 0
    let totalPPV = 0
    let highConcentrationCount = 0
    const result = Object.values(agg).map((a: any) => {
      const conc = supplierConcentration(a.ingredientId, from, to)
      const ppv = a.spend - a.standardCost * a.qty
      totalSpend += a.spend
      totalPPV += ppv
      if (conc.singleSupplierConcentration) highConcentrationCount++
      return {
        ...a,
        qty: a.qty,
        spend: r2(a.spend),
        avgCost: a.qty > 0 ? r2(a.spend / a.qty) : 0,
        ppv: r2(ppv),
        ppvPct: a.standardCost > 0 && a.spend > 0 ? r2((ppv / a.spend) * 100) : 0,
        concentration: conc.rows,
        topSupplierPct: r2(conc.topSupplierPct),
        singleSupplierConcentration: conc.singleSupplierConcentration,
      }
    }).sort((a, b) => Math.abs(b.ppv) - Math.abs(a.ppv))

    return {
      from: from || null,
      to: to || null,
      rows: result,
      totalSpend: r2(totalSpend),
      totalPPV: r2(totalPPV),
      totalPurchases: result.reduce((s2, a) => s2 + a.purchases, 0),
      highConcentrationCount,
    }
  })

  ipcMain.handle('report:salesTrend', (_e, opts?: { days?: number; forecastDays?: number }) => {
    const days = Math.max(7, Math.min(90, Number(opts?.days) || 60))
    const forecastDays = Math.max(7, Math.min(90, Number(opts?.forecastDays) || 30))
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const allOrders = db.select().from(orders).all().filter(o => o.status !== 'CANCELLED' && o.createdAt >= cutoff)
    const dayList: string[] = []
    for (let d = days - 1; d >= 0; d--) dayList.push(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10))
    const daySet = new Set(dayList)

    const daily = new Map<string, { revenue: number; orderCount: number; qty: number }>()
    const orderMap = new Map(allOrders.map(o => [o.id, o]))
    for (const o of allOrders) {
      const d = o.createdAt.slice(0, 10)
      if (!daySet.has(d)) continue
      if (!daily.has(d)) daily.set(d, { revenue: 0, orderCount: 0, qty: 0 })
      const rec = daily.get(d)!
      rec.revenue += o.total
      rec.orderCount++
    }
    const validIds = new Set(allOrders.map(o => o.id))
    const perProductDaily: Record<string, Record<string, number>> = {}
    for (const item of db.select().from(orderItems).all()) {
      if (!validIds.has(item.orderId)) continue
      const d = orderMap.get(item.orderId)?.createdAt.slice(0, 10)
      if (!d || !daySet.has(d)) continue
      const rec = daily.get(d)!
      rec.qty += item.quantity
      if (!perProductDaily[item.productId]) perProductDaily[item.productId] = {}
      perProductDaily[item.productId][d] = (perProductDaily[item.productId][d] || 0) + item.quantity
    }
    const historical = dayList.map(d => {
      const v = daily.get(d)
      return { date: d, revenue: v?.revenue || 0, orderCount: v?.orderCount || 0, qty: v?.qty || 0 }
    })

    const hRevenue = historical.reduce((sum, r) => sum + r.revenue, 0)
    const baseDailyRevenue = hRevenue / days
    const sumLast = (n: number) => {
      const slice = historical.slice(Math.max(0, historical.length - n))
      return slice.reduce((acc, r) => acc + r.revenue, 0) / Math.max(1, slice.length)
    }

    const byWeekday: Record<number, { sum: number; count: number }> = {}
    for (const r of historical) {
      const wd = new Date(r.date + 'T12:00:00').getDay()
      if (!byWeekday[wd]) byWeekday[wd] = { sum: 0, count: 0 }
      byWeekday[wd].sum += r.revenue
      byWeekday[wd].count++
    }
    const weekdayFactors = [0, 1, 2, 3, 4, 5, 6].map(wd => {
      const b = byWeekday[wd]
      const avg = b && b.count > 0 ? b.sum / b.count : 0
      return {
        weekday: wd,
        avg: r2(avg),
        factor: baseDailyRevenue > 0 ? r2(avg / baseDailyRevenue) : 0,
      }
    })

    const forecast: { date: string; revenue: number; factor: number }[] = []
    for (let f = 1; f <= forecastDays; f++) {
      const d = new Date(Date.now() + f * 86400000)
      const dateStr = d.toISOString().slice(0, 10)
      const wd = d.getDay()
      const factor = weekdayFactors[wd].factor
      forecast.push({ date: dateStr, revenue: r2(baseDailyRevenue * factor), factor })
    }

    const productMap = new Map(db.select().from(products).all().map(p => [p.id, p]))
    const itemRows = Object.entries(perProductDaily)
      .map(([pid, dm]) => {
        const p = productMap.get(pid)
        if (!p) return null
        const values = dayList.map(d => dm[d] || 0)
        const total = values.reduce((acc, v) => acc + v, 0)
        const baseDailyQty = total / values.length
        const last7 = values.slice(-7).reduce((acc, v) => acc + v, 0)
        const prior7 = values.slice(-14, -7).reduce((acc, v) => acc + v, 0)
        const trend = prior7 > 0 ? r2(((last7 - prior7) / prior7) * 100) : last7 > 0 ? 100 : 0
        return { productId: pid, name: p.name, emoji: p.emoji, baseDailyQty: r2(baseDailyQty), last7Qty: r2(last7 / 7), trend, forecast30d: r2(baseDailyQty * 30) }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.baseDailyQty - a.baseDailyQty)
      .slice(0, 10)

    return {
      days,
      forecastDays,
      historical,
      forecast,
      baseDailyRevenue: r2(baseDailyRevenue),
      avgDailyRevenue30: r2(sumLast(30)),
      avgDailyRevenue60: r2(sumLast(60)),
      avgDailyRevenue90: r2(sumLast(90)),
      weekdayFactors,
      items: itemRows,
    }
  })

  ipcMain.handle('report:daysOnHand', () => {
    const s = getSqlite()
    const active = db.select().from(ingredients).where(eq(ingredients.active, true)).all()
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const consumptionRows = s.prepare("SELECT ingredient_id, quantity FROM inventory_transactions WHERE type = 'CONSUMPTION' AND created_at >= ?").all(cutoff) as any[]
    const used: Record<string, number> = {}
    for (const r of consumptionRows) {
      const q = Math.abs(Number(r.quantity) || 0)
      used[r.ingredient_id] = (used[r.ingredient_id] || 0) + q
    }
    const rows = active.map(ing => {
      const stock = Number(ing.stockQuantity) || 0
      const unitCost = Number(ing.costPerUnit) || 0
      const avgDailyUse = (used[ing.id] || 0) / 30
      const dio = avgDailyUse > 0 ? stock / avgDailyUse : null
      let status: 'ok' | 'low' | 'critical' = 'ok'
      if (Number(ing.minStock || 0) > 0 && stock <= Number(ing.minStock)) status = 'critical'
      else if (dio != null && dio <= 3) status = 'low'
      return {
        ingredientId: ing.id,
        name: ing.name,
        unit: ing.unit,
        supplier: ing.supplier,
        secondarySupplier: ing.secondarySupplier,
        supplierRatio: Number(ing.supplierRatio) || 0.7,
        plannedCost: Number(ing.plannedCost) || 0,
        stock: r2(stock),
        minStock: Number(ing.minStock) || 0,
        unitCost: r2(unitCost),
        stockValue: r2(stock * unitCost),
        avgDailyUse: r2(avgDailyUse),
        dio: dio != null ? r2(dio) : null,
        status,
      }
    }).sort((a, b) => (a.dio ?? Infinity) - (b.dio ?? Infinity))

    const conc = rows.map(r => ({ ingredientId: r.ingredientId, ...supplierConcentration(r.ingredientId, undefined, undefined) }))
    return { rows, concentrations: conc }
  })

  // ═══════════════════════════════════════════════════════════
  // BACKUP
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('backup:trigger', async () => {
    try {
      const backupsDir = path.join(app.getPath('userData'), 'backups')
      mkdirSync(backupsDir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
      const dest = path.join(backupsDir, `fastfood-${stamp}.db`)
      await getSqlite().backup(dest)
      return { ok: true, path: dest, message: 'تم إنشاء النسخة الاحتياطية بنجاح' }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'فشل النسخ الاحتياطي' }
    }
  })

  ipcMain.handle('backup:getStatus', () => {
    try {
      const backupsDir = path.join(app.getPath('userData'), 'backups')
      const files = readdirSync(backupsDir)
        .filter(f => f.startsWith('fastfood-') && f.endsWith('.db'))
        .sort()
      return { lastBackup: files.length ? files[files.length - 1] : null, backupCount: files.length }
    } catch {
      return { lastBackup: null, backupCount: 0 }
    }
  })
}