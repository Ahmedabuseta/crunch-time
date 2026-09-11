import { ipcMain } from 'electron'
import { getDb } from '../db/client'
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm'
import * as schema from '../db/schema'
import { randomUUID } from 'crypto'
import { hashPin, verifyPin } from '../lib/auth'

const {
  categories, products, addons, productAddons,
  modifierGroups, modifiers, productModifierGroups,
  orders, orderItems, payments,
  users, shifts, cashMovements,
  ingredients, recipes, inventoryTransactions,
} = schema

function now() { return new Date().toISOString() }
function uuid() { return randomUUID() }

export function registerIpcHandlers() {
  const db = getDb()

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
    db.select({ id: addons.id, name: addons.name, price: addons.price, emoji: addons.emoji })
      .from(addons)
      .innerJoin(productAddons, eq(addons.id, productAddons.addonId))
      .where(eq(productAddons.productId, productId))
  )

  ipcMain.handle('addon:linkToProduct', (_e, productId: string, addonId: string) => {
    db.insert(productAddons).values({ productId, addonId }).run()
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
      groupId: modifierGroups.id, groupName: modifierGroups.name, groupType: modifierGroups.type,
    }).from(modifierGroups)
      .innerJoin(productModifierGroups, eq(modifierGroups.id, productModifierGroups.modifierGroupId))
      .where(eq(productModifierGroups.productId, productId))
      .all()

    return groups.map((g: any) => ({
      ...g,
      modifiers: db.select().from(modifiers)
        .where(and(eq(modifiers.active, true), eq(modifiers.modifierGroupId, g.groupId)))
        .orderBy(modifiers.sortOrder)
        .all(),
    }))
  })

  ipcMain.handle('modifier:linkToProduct', (_e, productId: string, groupId: string) => {
    db.insert(productModifierGroups).values({ productId, modifierGroupId: groupId }).run()
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // ORDERS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('order:create', (_e, data: any) => {
    const id = `#${Date.now().toString().slice(-6)}`
    const ts = now()
    db.insert(orders).values({
      id,
      status: 'PAID',
      orderType: data.orderType,
      tableNumber: data.tableNumber || null,
      deliveryAddress: data.deliveryAddress || null,
      deliveryPhone: data.deliveryPhone || null,
      subtotal: data.subtotal,
      tax: data.tax,
      deliveryFee: data.deliveryFee || 0,
      total: data.total,
      userId: data.userId || null,
      shiftId: data.shiftId || null,
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
        selectedModifiersJson: item.modifiers ? JSON.stringify(item.modifiers) : null,
        selectedAddonsJson: item.addons ? JSON.stringify(item.addons) : null,
      }).run()
    }

    return { id }
  })

  ipcMain.handle('order:list', (_e, filters?: any) => {
    const conditions = []
    if (filters?.status) conditions.push(eq(orders.status, filters.status))
    if (filters?.orderType) conditions.push(eq(orders.orderType, filters.orderType))
    if (filters?.from) conditions.push(gte(orders.createdAt, filters.from))
    if (filters?.to) conditions.push(lte(orders.createdAt, filters.to))

    const query = conditions.length > 0
      ? db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt))
      : db.select().from(orders).orderBy(desc(orders.createdAt))

    return query.all()
  })

  ipcMain.handle('order:getById', (_e, id: string) => {
    const order = db.select().from(orders).where(eq(orders.id, id)).get()
    if (!order) return null
    const items = db.select().from(orderItems).where(eq(orderItems.orderId, id)).all()
    const pays = db.select().from(payments).where(eq(payments.orderId, id)).all()
    return { ...order, items, payments: pays }
  })

  ipcMain.handle('order:updateStatus', (_e, id: string, status: string) => {
    db.update(orders).set({ status, updatedAt: now() }).where(eq(orders.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('order:delete', (_e, id: string) => {
    db.update(orders).set({ status: 'CANCELLED', updatedAt: now() }).where(eq(orders.id, id)).run()
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
    db.select({ id: users.id, name: users.name, role: users.role, active: users.active, createdAt: users.createdAt })
      .from(users).where(eq(users.active, true))
  )

  ipcMain.handle('user:create', async (_e, data: any) => {
    const id = uuid()
    const pinHash = await hashPin(data.pin)
    db.insert(users).values({ id, name: data.name, pinHash, role: data.role || 'cashier', active: true, createdAt: now() }).run()
    return { id }
  })

  ipcMain.handle('user:update', async (_e, id: string, data: any) => {
    const update: any = { name: data.name, role: data.role }
    if (data.pin) update.pinHash = await hashPin(data.pin)
    db.update(users).set(update).where(eq(users.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('user:delete', (_e, id: string) => {
    db.update(users).set({ active: false }).where(eq(users.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('user:verifyPin', async (_e, id: string, pin: string) => {
    const user = db.select().from(users).where(eq(users.id, id)).get()
    if (!user) return { ok: false, error: 'User not found' }
    const valid = await verifyPin(user.pinHash, pin)
    if (!valid) return { ok: false, error: 'Invalid PIN' }
    return { ok: true, user: { id: user.id, name: user.name, role: user.role } }
  })

  // ═══════════════════════════════════════════════════════════
  // SHIFTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('shift:open', (_e, data: any) => {
    const id = uuid()
    db.insert(shifts).values({
      id, userId: data.userId, startedAt: now(), openingCash: data.openingCash, status: 'open',
    }).run()
    // Record opening cash movement
    db.insert(cashMovements).values({
      id: uuid(), shiftId: id, type: 'OPENING', amount: data.openingCash, note: 'فتح الوردية', createdAt: now(),
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
    if (filters?.userId) {
      return db.select().from(shifts).where(eq(shifts.userId, filters.userId)).orderBy(desc(shifts.startedAt)).all()
    }
    return db.select().from(shifts).orderBy(desc(shifts.startedAt)).all()
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

  // ═══════════════════════════════════════════════════════════
  // INVENTORY
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('inventory:listIngredients', () =>
    db.select().from(ingredients).where(eq(ingredients.active, true))
  )

  ipcMain.handle('inventory:createIngredient', (_e, data: any) => {
    const id = uuid()
    db.insert(ingredients).values({ id, ...data, active: true }).run()
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

  ipcMain.handle('inventory:listRecipes', (_e, productId: string) =>
    db.select().from(recipes).where(eq(recipes.productId, productId)).all()
  )

  ipcMain.handle('inventory:upsertRecipe', (_e, data: any) => {
    if (data.id) {
      db.update(recipes).set({ quantityPerUnit: data.quantityPerUnit }).where(eq(recipes.id, data.id)).run()
      return { id: data.id }
    }
    const id = uuid()
    db.insert(recipes).values({ id, productId: data.productId, ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit }).run()
    return { id }
  })

  ipcMain.handle('inventory:deleteRecipe', (_e, id: string) => {
    db.delete(recipes).where(eq(recipes.id, id)).run()
    return { ok: true }
  })

  ipcMain.handle('inventory:getAlerts', () =>
    db.select().from(ingredients)
      .where(and(eq(ingredients.active, true), sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`))
      .all()
  )

  ipcMain.handle('inventory:restock', (_e, ingredientId: string, qty: number, note?: string) => {
    db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} + ${qty}` })
      .where(eq(ingredients.id, ingredientId)).run()
    db.insert(inventoryTransactions).values({
      id: uuid(), ingredientId, type: 'PURCHASE', quantity: qty, note: note || 'إعادة تعبئة', createdAt: now(),
    }).run()
    return { ok: true }
  })

  ipcMain.handle('inventory:deductForOrder', (_e, orderId: string) => {
    const items = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all()
    for (const item of items) {
      const recipeItems = db.select().from(recipes).where(eq(recipes.productId, item.productId)).all()
      for (const r of recipeItems) {
        const deduction = r.quantityPerUnit * item.quantity
        db.update(ingredients).set({ stockQuantity: sql`${ingredients.stockQuantity} - ${deduction}` })
          .where(eq(ingredients.id, r.ingredientId)).run()
        db.insert(inventoryTransactions).values({
          id: uuid(), ingredientId: r.ingredientId, type: 'CONSUMPTION', quantity: -deduction,
          referenceOrderId: orderId, note: `استهلاك طلب ${orderId}`, createdAt: now(),
        }).run()
      }
    }
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('report:dailySummary', (_e, date?: string) => {
    const targetDate = date || new Date().toISOString().slice(0, 10)
    const all = db.select().from(orders).all()
    const dayOrders = all.filter(o => o.createdAt.startsWith(targetDate) && o.status !== 'CANCELLED')
    const cancelled = all.filter(o => o.createdAt.startsWith(targetDate) && o.status === 'CANCELLED')
    const revenue = dayOrders.reduce((s, o) => s + o.total, 0)
    return {
      date: targetDate,
      totalOrders: dayOrders.length,
      totalRevenue: revenue,
      avgOrderValue: dayOrders.length > 0 ? revenue / dayOrders.length : 0,
      cancelledOrders: cancelled.length,
      cancellationRate: all.filter(o => o.createdAt.startsWith(targetDate)).length > 0
        ? cancelled.length / all.filter(o => o.createdAt.startsWith(targetDate)).length * 100 : 0,
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
        if (to && o.createdAt > to) return false
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
        if (to && o.createdAt > to) return false
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
        if (to && o.createdAt > to) return false
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
      if (to && o.createdAt > to) return false
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
      if (to && o.createdAt > to) return false
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
    return {
      shiftId,
      userName: user?.name || 'unknown',
      startedAt: shift.startedAt,
      endedAt: shift.endedAt,
      orderCount: shiftOrders.length,
      totalRevenue: shiftOrders.reduce((s, o) => s + o.total, 0),
      openingCash: shift.openingCash,
      closingCash: shift.closingCash,
      cashDifference: shift.closingCash != null ? shift.closingCash - shift.openingCash : null,
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
      if (to && o.createdAt > to) return false
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

  // ═══════════════════════════════════════════════════════════
  // BACKUP
  // ═══════════════════════════════════════════════════════════
  ipcMain.handle('backup:trigger', () => {
    // Placeholder — will be implemented in Phase 9
    return { ok: true, message: 'Backup not yet implemented' }
  })

  ipcMain.handle('backup:getStatus', () => {
    return { lastBackup: null, backupCount: 0 }
  })
}
