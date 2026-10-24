// Reports — the full analytics surface.
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { abcClass, expandRecipes, r2, supplierConcentration, xyzClass } from './shared'
import { requireAdmin } from './session'
import { allocateNetRevenue } from '../lib/net-revenue'

const {
  orders, orderItems, products, addons, categories, payments,
  shifts, users, cashMovements, ingredients, deliveryProfiles, discountCodes,
} = schema

type ReportItem = {
  productId: string
  quantity: number
  unitPrice: number
  itemDiscount?: number | null
  selectedAddonsJson?: string | null
}

function parseAddonIds(json: string | null | undefined): string[] {
  if (!json) return []
  try { return JSON.parse(json) as string[] } catch { return [] }
}

// Product/add-on revenue per line with the order's discount taken out, so
// item-level reports agree with the order totals they sit next to.
function netRevenueByItem(
  order: { discountAmount?: number | null },
  items: ReportItem[],
  addonPrices: Map<string, number>,
) {
  const addonIds = items.map(i => parseAddonIds(i.selectedAddonsJson))
  const lines = items.map((i, idx) => ({
    productGross: Number(i.unitPrice || 0) * Number(i.quantity || 0),
    addonGross: addonIds[idx].reduce((s, id) => s + (addonPrices.get(id) || 0) * Number(i.quantity || 0), 0),
    itemDiscount: Number(i.itemDiscount || 0),
  }))
  const nets = allocateNetRevenue(lines, Number(order.discountAmount || 0))
  return items.map((item, idx) => ({ item, addonIds: addonIds[idx], ...nets[idx] }))
}

export function dailySummary(date?: string) {
  requireAdmin()
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
}

export function periodSummary(from?: string, to?: string) {
  requireAdmin()
  const s = getSqlite()
  const allOrders = s.prepare('SELECT * FROM orders').all() as any[]
  const inRange = (o: any) => {
    if (from && o.created_at < from) return false
    if (to && o.created_at > to + '￿') return false
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
}

export function profitSummary(_from?: string, to?: string) {
  requireAdmin()
  const s = getSqlite()
  // Fixed expenses are monthly and are charged from the 1st, so the profit
  // window always opens there — picking "today" or a rolling week must not
  // charge a whole month's rent against a few days of revenue.
  const toDate = (to || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const fromDate = `${toDate.slice(0, 7)}-01`
  const all = (s.prepare('SELECT * FROM orders').all() as any[]).filter(o => {
    if (o.status === 'CANCELLED') return false
    if (o.created_at < fromDate) return false
    if (o.created_at > toDate + '￿') return false
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
    from: fromDate,
    to: toDate,
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
}

export function hourlyBreakdown(date?: string) {
  requireAdmin()
  const targetDate = date || new Date().toISOString().slice(0, 10)
  const db = getDb()
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
}

export function topItems(limit = 10, from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const orderMap = new Map(
    db.select().from(orders).all().filter(o => {
      if (o.status === 'CANCELLED') return false
      if (from && o.createdAt < from) return false
      if (to && o.createdAt > to + '￿') return false
      return true
    }).map(o => [o.id, o])
  )
  const productMap = new Map(db.select().from(products).all().map(p => [p.id, p]))
  const addonPrices = new Map(db.select().from(addons).all().map(a => [a.id, a.price]))

  const itemsByOrder = new Map<string, ReportItem[]>()
  for (const item of db.select().from(orderItems).all()) {
    if (!orderMap.has(item.orderId)) continue
    const list = itemsByOrder.get(item.orderId)
    if (list) list.push(item)
    else itemsByOrder.set(item.orderId, [item])
  }

  const counts: Record<string, { name: string; emoji: string; totalQuantity: number; totalRevenue: number }> = {}
  for (const [orderId, items] of itemsByOrder) {
    const order = orderMap.get(orderId)!
    for (const { item, productNet } of netRevenueByItem(order, items, addonPrices)) {
      const p = productMap.get(item.productId)
      if (!p) continue
      if (!counts[p.id]) counts[p.id] = { name: p.name, emoji: p.emoji, totalQuantity: 0, totalRevenue: 0 }
      counts[p.id].totalQuantity += item.quantity
      counts[p.id].totalRevenue += productNet
    }
  }
  return Object.values(counts).sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, limit)
}

export function categoryRevenue(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const orderMap = new Map(
    db.select().from(orders).all().filter(o => {
      if (o.status === 'CANCELLED') return false
      if (from && o.createdAt < from) return false
      if (to && o.createdAt > to + '￿') return false
      return true
    }).map(o => [o.id, o])
  )
  const productMap = new Map(db.select().from(products).all().map(p => [p.id, p]))
  const addonPrices = new Map(db.select().from(addons).all().map(a => [a.id, a.price]))
  const catMap = new Map(db.select().from(categories).all().map(c => [c.id, c]))

  const itemsByOrder = new Map<string, ReportItem[]>()
  for (const item of db.select().from(orderItems).all()) {
    if (!orderMap.has(item.orderId)) continue
    const list = itemsByOrder.get(item.orderId)
    if (list) list.push(item)
    else itemsByOrder.set(item.orderId, [item])
  }

  const catRevenue: Record<string, { name: string; totalRevenue: number }> = {}
  for (const [orderId, items] of itemsByOrder) {
    const order = orderMap.get(orderId)!
    for (const { item, productNet } of netRevenueByItem(order, items, addonPrices)) {
      const p = productMap.get(item.productId)
      if (!p) continue
      const c = catMap.get(p.categoryId)
      if (!c) continue
      if (!catRevenue[c.id]) catRevenue[c.id] = { name: c.name, totalRevenue: 0 }
      catRevenue[c.id].totalRevenue += productNet
    }
  }
  return Object.entries(catRevenue).map(([id, data]) => ({ categoryId: id, ...data }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
}

export function addonStats(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const orderMap = new Map(
    db.select().from(orders).all().filter(o => {
      if (o.status === 'CANCELLED') return false
      if (from && o.createdAt < from) return false
      if (to && o.createdAt > to + '￿') return false
      return true
    }).map(o => [o.id, o])
  )
  const addonMap = new Map(db.select().from(addons).all().map(a => [a.id, a]))
  const addonPrices = new Map([...addonMap.values()].map(a => [a.id, a.price]))

  const itemsByOrder = new Map<string, ReportItem[]>()
  for (const item of db.select().from(orderItems).all()) {
    if (!orderMap.has(item.orderId)) continue
    const list = itemsByOrder.get(item.orderId)
    if (list) list.push(item)
    else itemsByOrder.set(item.orderId, [item])
  }

  const counts: Record<string, { name: string; emoji: string; totalQuantity: number; totalRevenue: number }> = {}
  for (const [orderId, items] of itemsByOrder) {
    const order = orderMap.get(orderId)!
    for (const { item, addonIds, ratio } of netRevenueByItem(order, items, addonPrices)) {
      for (const addonId of addonIds) {
        const a = addonMap.get(addonId)
        if (!a) continue
        if (!counts[a.id]) counts[a.id] = { name: a.name, emoji: a.emoji, totalQuantity: 0, totalRevenue: 0 }
        counts[a.id].totalQuantity += item.quantity
        counts[a.id].totalRevenue += a.price * item.quantity * ratio
      }
    }
  }
  return Object.values(counts).sort((a, b) => b.totalQuantity - a.totalQuantity)
}

export function ticketDistribution(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const allOrders = db.select().from(orders).all().filter(o => {
    if (o.status === 'CANCELLED') return false
    if (from && o.createdAt < from) return false
    if (to && o.createdAt > to + '￿') return false
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
}

export function orderTypeSplit(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const allOrders = db.select().from(orders).all().filter(o => {
    if (o.status === 'CANCELLED') return false
    if (from && o.createdAt < from) return false
    if (to && o.createdAt > to + '￿') return false
    return true
  })
  const delivery = allOrders.filter(o => o.orderType === 'delivery')
  const dineIn = allOrders.filter(o => o.orderType === 'dine-in')
  const takeaway = allOrders.filter(o => o.orderType === 'takeaway')
  const total = allOrders.length || 1
  return {
    delivery: { count: delivery.length, revenue: delivery.reduce((s, o) => s + o.total, 0), percentage: delivery.length / total * 100 },
    dineIn: { count: dineIn.length, revenue: dineIn.reduce((s, o) => s + o.total, 0), percentage: dineIn.length / total * 100 },
    takeaway: { count: takeaway.length, revenue: takeaway.reduce((s, o) => s + o.total, 0), percentage: takeaway.length / total * 100 },
  }
}

export function shiftReport(shiftId: string) {
  requireAdmin()
  return buildShiftReport(shiftId)
}

/** Same data without the admin gate — used by the cashier's close print. */
export function shiftReportForPrint(shiftId: string) {
  return buildShiftReport(shiftId)
}

function buildShiftReport(shiftId: string) {
  const db = getDb()
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

  // Payment method breakdown for the shift
  const payAgg: Record<string, { method: string; count: number; total: number }> = {}
  for (const o of shiftOrders) {
    const method = o.paymentType || 'cash'
    if (!payAgg[method]) payAgg[method] = { method, count: 0, total: 0 }
    payAgg[method].count++
    payAgg[method].total += o.total
  }

  // Top 5 items by quantity in the shift
  const productMap = new Map(db.select().from(products).all().map(p => [p.id, p]))
  const addonPrices = new Map(db.select().from(addons).all().map(a => [a.id, a.price]))
  const itemAgg: Record<string, { productId: string; qty: number; revenue: number }> = {}
  for (const o of shiftOrders) {
    const items = db.select().from(orderItems).where(eq(orderItems.orderId, o.id)).all()
    for (const { item, productNet } of netRevenueByItem(o, items, addonPrices)) {
      if (!itemAgg[item.productId]) itemAgg[item.productId] = { productId: item.productId, qty: 0, revenue: 0 }
      itemAgg[item.productId].qty += item.quantity
      itemAgg[item.productId].revenue += productNet
    }
  }
  const topItems = Object.values(itemAgg)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5)
    .map(t => {
      const p = productMap.get(t.productId)
      return { name: p?.name || 'غير معروف', emoji: p?.emoji || '', qty: t.qty, revenue: r2(t.revenue) }
    })

  // Revenue by hour — only hours with activity in the shift
  const hourAgg: Record<number, { orderCount: number; revenue: number }> = {}
  for (const o of shiftOrders) {
    const h = new Date(o.createdAt).getHours()
    if (!hourAgg[h]) hourAgg[h] = { orderCount: 0, revenue: 0 }
    hourAgg[h].orderCount++
    hourAgg[h].revenue += o.total
  }
  const hourly = Object.entries(hourAgg)
    .map(([hour, data]) => ({ hour: Number(hour), orderCount: data.orderCount, revenue: r2(data.revenue) }))
    .sort((a, b) => a.hour - b.hour)

  // Cash movements aggregated by type (opening/closing are the shift's bookends)
  const movAgg: Record<string, number> = {}
  for (const m of movs) {
    if (m.type === 'OPENING' || m.type === 'CLOSING') continue
    const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
    movAgg[m.type] = (movAgg[m.type] || 0) + m.amount * sign
  }
  const movements = Object.entries(movAgg).map(([type, amount]) => ({ type, amount: r2(amount) }))

  // Every order type in the shift, including delivery COD.
  const orderTypes = ['delivery', 'dine-in', 'takeaway'].map(type => {
    const list = shiftOrders.filter(o => o.orderType === type)
    return {
      type,
      count: list.length,
      revenue: r2(list.reduce((s, o) => s + o.total, 0)),
      percentage: shiftOrders.length > 0 ? (list.length / shiftOrders.length) * 100 : 0,
    }
  })
  const deliveryCashOrders = shiftOrders
    .filter(o => o.orderType === 'delivery' && o.paymentType === 'cash' && o.status !== 'REFUNDED').length
  const deliveryCash = r2(shiftOrders
    .filter(o => o.orderType === 'delivery' && o.paymentType === 'cash' && o.status !== 'REFUNDED')
    .reduce((s, o) => s + o.total, 0))
  // Delivery fees are company revenue (paid by the customer / handed over by
  // the driver), not part of the cashier's own sales.
  const deliveryFees = r2(shiftOrders
    .filter(o => o.orderType === 'delivery')
    .reduce((s, o) => s + Number(o.deliveryFee || 0), 0))

  return {
    shiftId,
    shiftNumber: shift.number,
    userName: user?.name || 'غير معروف',
    startedAt: shift.startedAt,
    endedAt: shift.endedAt,
    orderCount: shiftOrders.length,
    totalRevenue: r2(shiftOrders.reduce((s, o) => s + o.total, 0)),
    discountTotal: r2(shiftOrders.reduce((s, o) => s + Number(o.discountAmount || 0), 0)),
    openingCash: shift.openingCash,
    closingCash: shift.closingCash,
    expectedCash: r2(expectedCash),
    cashDifference: shift.closingCash != null ? r2(shift.closingCash - expectedCash) : null,
    payments: Object.values(payAgg).map(p => ({ ...p, total: r2(p.total) })),
    orderTypes,
    deliveryCash,
    deliveryCashOrders,
    deliveryFees,
    topItems,
    hourly,
    movements,
  }
}

export function shiftSummary(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
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
}

export function laborSummary(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const inRange = (ts: string) => {
    if (from && ts < from) return false
    if (to && ts > to + '￿') return false
    return true
  }
  const allUsers = db.select().from(users).where(eq(users.active, true)).all()
  const allShifts = db.select().from(shifts).all().filter(x => inRange(x.startedAt))
  const allOrders = db.select().from(orders).all().filter(o => o.status !== 'CANCELLED' && inRange(o.createdAt))

  const totalRevenue = allOrders.reduce((sum, o) => sum + o.total, 0)
  const totalDeliveryFees = allOrders.reduce((sum, o) =>
    sum + (o.orderType === 'delivery' ? Number(o.deliveryFee) || 0 : 0), 0)
  let totalLaborCost = 0
  const staff: any[] = []

  for (const u of allUsers) {
    const uShifts = allShifts.filter(x => x.userId === u.id)
    const hoursWorked = uShifts.reduce((sum, x) => {
      const end = x.endedAt ? new Date(x.endedAt) : new Date()
      return sum + (end.getTime() - new Date(x.startedAt).getTime()) / 3600000
    }, 0)
    const uOrders = allOrders.filter(o => o.userId === u.id)
    const deliveryFees = uOrders.reduce((sum, o) =>
      sum + (o.orderType === 'delivery' ? Number(o.deliveryFee) || 0 : 0), 0)
    // Delivery fees are company money, not employee sales — commission must not
    // be earned on them.
    const sales = uOrders.reduce((sum, o) =>
      sum + o.total - (o.orderType === 'delivery' ? Number(o.deliveryFee) || 0 : 0), 0)
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
      hoursWorked: Math.round(hoursWorked * 100) / 100,
      orderCount: uOrders.length,
      sales,
      deliveryFees,
      wage: Math.round(wage),
      commission: Math.round(commission),
      laborCost: Math.round(laborCost),
    })
  }

  staff.sort((a, b) => b.sales - a.sales)
  const totalSales = staff.reduce((sum, s) => sum + s.sales, 0)
  return {
    totalRevenue,
    totalSales,
    totalDeliveryFees,
    totalLaborCost: Math.round(totalLaborCost),
    laborCostPct: totalSales > 0 ? (totalLaborCost / totalSales) * 100 : 0,
    staff,
  }
}

export function voidSummary(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const inRange = (ts: string) => {
    if (from && ts < from) return false
    if (to && ts > to + '￿') return false
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
}

// ─── Delivery settlement (report-only) ─────────────────────
// Groups a day's (or a range's) delivery orders by driver. cashTotal is the
// COD money that driver collected and hands over at end of day; visa is
// shown separately because it never passes through their hands.
export function driverSummary(opts?: { from?: string; to?: string }) {
  requireAdmin()
  const db = getDb()
  const from = (opts?.from || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const to = (opts?.to || from).slice(0, 10)
  const rows = db.select().from(orders).where(and(
    eq(orders.orderType, 'delivery'),
    gte(orders.createdAt, from),
    lte(orders.createdAt, to + '￿'),
    sql`${orders.status} NOT IN ('CANCELLED', 'REFUNDED')`,
  )).all()
  const profiles = db.select().from(deliveryProfiles).all()

  const bucket = () => ({ orderCount: 0, cashTotal: 0, visaTotal: 0, deliveryFee: 0, total: 0 })
  const groups = new Map<string | null, ReturnType<typeof bucket>>()
  for (const o of rows) {
    // null key = the بدون سائق bucket (nothing assigned yet).
    const key = o.driverStatus === 'assigned' && o.deliveryProfileId ? o.deliveryProfileId : null
    if (!groups.has(key)) groups.set(key, bucket())
    const b = groups.get(key)!
    b.orderCount++
    b.deliveryFee += Number(o.deliveryFee) || 0
    b.total += Number(o.total) || 0
    if (o.paymentType === 'cash') b.cashTotal += Number(o.total) || 0
    else b.visaTotal += Number(o.total) || 0
  }

  const named = [...groups.entries()].map(([profileId, b]) => {
    const p = profileId ? profiles.find((x) => x.id === profileId) : null
    const sample = rows.find((o) => (o.deliveryProfileId || null) === profileId)
    return {
      profileId,
      // Fall back to the name stored on the order so a removed profile can
      // never hide money it already collected.
      name: p?.name || (profileId ? sample?.deliveryProfileName : 'بدون سائق') || 'ديلفري محذوف',
      phone: p?.phone || null,
      active: p ? p.active : false,
      orderCount: b.orderCount,
      cashTotal: Math.round(b.cashTotal),
      visaTotal: Math.round(b.visaTotal),
      deliveryFee: Math.round(b.deliveryFee),
      total: Math.round(b.total),
    }
  })

  const all = bucket()
  for (const o of rows) {
    all.orderCount++
    all.deliveryFee += Number(o.deliveryFee) || 0
    all.total += Number(o.total) || 0
    if (o.paymentType === 'cash') all.cashTotal += Number(o.total) || 0
    else all.visaTotal += Number(o.total) || 0
  }

  return {
    from,
    to,
    drivers: named.filter((d) => d.profileId !== null).sort((a, b) => b.total - a.total),
    unassigned: named.find((d) => d.profileId === null) || {
      profileId: null, name: 'بدون سائق', phone: null, active: false,
      orderCount: 0, cashTotal: 0, visaTotal: 0, deliveryFee: 0, total: 0,
    },
    totals: {
      orderCount: all.orderCount,
      cashTotal: Math.round(all.cashTotal),
      visaTotal: Math.round(all.visaTotal),
      deliveryFee: Math.round(all.deliveryFee),
      total: Math.round(all.total),
    },
  }
}

export function revenueTrend(days = 7) {
  requireAdmin()
  const db = getDb()
  const allOrders = db.select().from(orders).all().filter(o => o.status !== 'CANCELLED')
  const result: { date: string; revenue: number; orderCount: number }[] = []
  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
    const dayOrders = allOrders.filter(o => o.createdAt.startsWith(date))
    result.push({ date, revenue: dayOrders.reduce((s, o) => s + o.total, 0), orderCount: dayOrders.length })
  }
  return result
}

export function inventoryAlerts() {
  requireAdmin()
  const db = getDb()
  return db.select().from(ingredients)
    .where(and(eq(ingredients.active, true), sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`))
    .all()
}

export function paymentMethodBreakdown(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const allOrders = db.select().from(orders).all().filter(o => {
    if (o.status === 'CANCELLED') return false
    if (from && o.createdAt < from) return false
    if (to && o.createdAt > to + '￿') return false
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
}

export function discountSummary(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const allOrders = db.select().from(orders).all().filter(o => {
    if (o.status === 'CANCELLED') return false
    if (from && o.createdAt < from) return false
    if (to && o.createdAt > to + '￿') return false
    return true
  })
  const byCode: Record<string, { code: string; count: number; totalDiscount: number; totalRevenue: number }> = {}
  const noDiscountOrders: typeof allOrders = []
  for (const o of allOrders) {
    if (o.discountCode && (o.discountAmount || 0) > 0) {
      if (!byCode[o.discountCode]) byCode[o.discountCode] = { code: o.discountCode, count: 0, totalDiscount: 0, totalRevenue: 0 }
      byCode[o.discountCode].count++
      byCode[o.discountCode].totalDiscount += o.discountAmount || 0
      byCode[o.discountCode].totalRevenue += o.total
    } else {
      noDiscountOrders.push(o)
    }
  }
  const codes = Object.values(byCode).sort((a, b) => b.totalDiscount - a.totalDiscount)
  const allCodes = db.select().from(discountCodes).all()
  const codesWithRemaining = codes.map(c => {
    const dc = allCodes.find(d => d.code === c.code)
    return {
      ...c,
      avgDiscount: c.count > 0 ? c.totalDiscount / c.count : 0,
      maxUses: dc?.maxUses || 0,
      usedCount: dc?.usedCount || 0,
      remaining: dc ? (dc.maxUses > 0 ? Math.max(0, dc.maxUses - dc.usedCount) : null) : null,
      type: dc?.type || 'unknown',
      value: dc?.value || 0,
    }
  })
  const totalDiscountOrders = codes.reduce((s, c) => s + c.count, 0)
  const totalDiscountAmount = codes.reduce((s, c) => s + c.totalDiscount, 0)
  const totalDiscountRevenue = codes.reduce((s, c) => s + c.totalRevenue, 0)
  const totalNoDiscountRevenue = noDiscountOrders.reduce((s, o) => s + o.total, 0)
  return {
    codes: codesWithRemaining,
    summary: {
      totalDiscountOrders,
      totalDiscountAmount,
      totalDiscountRevenue,
      totalNoDiscountOrders: noDiscountOrders.length,
      totalNoDiscountRevenue,
      totalRevenue: totalDiscountRevenue + totalNoDiscountRevenue,
      discountRate: allOrders.length > 0 ? (totalDiscountOrders / allOrders.length) * 100 : 0,
      avgDiscountPerOrder: totalDiscountOrders > 0 ? totalDiscountAmount / totalDiscountOrders : 0,
      discountToRevenueRatio: (totalDiscountRevenue + totalNoDiscountRevenue) > 0
        ? (totalDiscountAmount / (totalDiscountRevenue + totalNoDiscountRevenue)) * 100 : 0,
      avgOrderWithDiscount: totalDiscountOrders > 0 ? totalDiscountRevenue / totalDiscountOrders : 0,
      avgOrderWithoutDiscount: noDiscountOrders.length > 0 ? totalNoDiscountRevenue / noDiscountOrders.length : 0,
    },
  }
}

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

export function abcXyz(from?: string, to?: string) {
  requireAdmin()
  const db = getDb()
  const allOrders = db.select().from(orders).all().filter(o => {
    if (o.status === 'CANCELLED') return false
    if (from && o.createdAt < from) return false
    if (to && o.createdAt > to + '￿') return false
    return true
  })
  const orderMap = new Map(allOrders.map(o => [o.id, o]))
  const itemsByOrder = new Map<string, ReportItem[]>()
  for (const item of db.select().from(orderItems).all()) {
    if (!orderMap.has(item.orderId)) continue
    const list = itemsByOrder.get(item.orderId)
    if (list) list.push(item)
    else itemsByOrder.set(item.orderId, [item])
  }
  const productMap = new Map(db.select().from(products).all().map(p => [p.id, p]))
  const addonPrices = new Map(db.select().from(addons).all().map(a => [a.id, a.price]))

  const agg: Record<string, { productId: string; name: string; emoji: string; revenue: number; qty: number }> = {}
  let totalRevenue = 0
  for (const [orderId, items] of itemsByOrder) {
    const order = orderMap.get(orderId)!
    for (const { item, productNet } of netRevenueByItem(order, items, addonPrices)) {
      const p = productMap.get(item.productId)
      if (!p) continue
      if (!agg[p.id]) agg[p.id] = { productId: p.id, name: p.name, emoji: p.emoji, revenue: 0, qty: 0 }
      agg[p.id].revenue += productNet
      agg[p.id].qty += item.quantity
      totalRevenue += productNet
    }
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
}

export function inventoryTurnover(from?: string, to?: string) {
  requireAdmin()
  const s = getSqlite()
  const db = getDb()
  const allOrders = db.select().from(orders).all().filter(o => {
    if (o.status === 'CANCELLED') return false
    if (from && o.createdAt < from) return false
    if (to && o.createdAt > to + '￿') return false
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
    if (to && t.created_at <= to + '￿') txUpToEnd[t.ingredient_id] = (txUpToEnd[t.ingredient_id] || 0) + q
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
}

export function purchasePriceVariance(from?: string, to?: string) {
  requireAdmin()
  const s = getSqlite()
  const db = getDb()
  let where = 'WHERE 1=1'
  const params: any[] = []
  if (from) { where += ' AND purchased_at >= ?'; params.push(from) }
  if (to) { where += ' AND purchased_at <= ?'; params.push(to + '￿') }
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
}

export function salesTrend(opts?: { days?: number; forecastDays?: number }) {
  requireAdmin()
  const db = getDb()
  const days = Math.max(7, Math.min(90, Number(opts?.days) || 60))
  const forecastDays = Math.max(7, Math.min(90, Number(opts?.forecastDays) || 30))
  // The 30/60/90-day averages each need their own window, so always collect a
  // full 90 days even when the chart shows fewer — otherwise sumLast(90) over a
  // 60-row history silently repeats the 60-day figure. REFUNDED money went back
  // to the customer, so like every other report here it never counts as revenue.
  const statDays = 90
  const cutoff = new Date(Date.now() - Math.max(days, statDays) * 86400000).toISOString().slice(0, 10)
  const allOrders = db.select().from(orders).all().filter(o => o.status !== 'CANCELLED' && o.status !== 'REFUNDED' && o.createdAt >= cutoff)
  const dayList: string[] = []
  for (let d = days - 1; d >= 0; d--) dayList.push(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10))
  const daySet = new Set(dayList)
  const statList: string[] = []
  for (let d = statDays - 1; d >= 0; d--) statList.push(new Date(Date.now() - d * 86400000).toISOString().slice(0, 10))
  const statSet = new Set(statList)

  const daily = new Map<string, { revenue: number; orderCount: number; qty: number }>()
  const orderMap = new Map(allOrders.map(o => [o.id, o]))
  for (const o of allOrders) {
    const d = o.createdAt.slice(0, 10)
    if (!statSet.has(d)) continue
    if (!daily.has(d)) daily.set(d, { revenue: 0, orderCount: 0, qty: 0 })
    const rec = daily.get(d)!
    rec.revenue += o.total
    rec.orderCount++
  }
  const addonPrices = new Map(db.select().from(addons).all().map(a => [a.id, a.price]))
  const itemsByOrder = new Map<string, ReportItem[]>()
  for (const item of db.select().from(orderItems).all()) {
    if (!orderMap.has(item.orderId)) continue
    const list = itemsByOrder.get(item.orderId)
    if (list) list.push(item)
    else itemsByOrder.set(item.orderId, [item])
  }
  const perProductDaily: Record<string, Record<string, number>> = {}
  const productGross: Record<string, number> = {}
  const productNet: Record<string, number> = {}
  for (const [orderId, items] of itemsByOrder) {
    const order = orderMap.get(orderId)
    if (!order) continue
    const d = order.createdAt.slice(0, 10)
    if (!daySet.has(d)) continue
    const rec = daily.get(d)!
    for (const { item, productNet: net } of netRevenueByItem(order, items, addonPrices)) {
      rec.qty += item.quantity
      if (!perProductDaily[item.productId]) perProductDaily[item.productId] = {}
      perProductDaily[item.productId][d] = (perProductDaily[item.productId][d] || 0) + item.quantity
      productGross[item.productId] = (productGross[item.productId] || 0) + item.unitPrice * item.quantity
      productNet[item.productId] = (productNet[item.productId] || 0) + net
    }
  }
  const historical = dayList.map(d => {
    const v = daily.get(d)
    return { date: d, revenue: v?.revenue || 0, orderCount: v?.orderCount || 0, qty: v?.qty || 0 }
  })

  const hRevenue = historical.reduce((sum, r) => sum + r.revenue, 0)
  const baseDailyRevenue = hRevenue / days
  // The averages read the full 90-day series, not the chart window, so each
  // card shows the window it names.
  const statHistorical = statList.map(d => daily.get(d)?.revenue || 0)
  const sumLast = (n: number) => {
    const slice = statHistorical.slice(Math.max(0, statHistorical.length - n))
    return slice.reduce((acc, r) => acc + r, 0) / Math.max(1, slice.length)
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
      // 70% of last week's run rate + 30% of the long-run base: recent
      // momentum drives the forecast without letting one spike own it.
      const dailyQty = 0.7 * (last7 / 7) + 0.3 * baseDailyQty
      // Value the forecast at what customers actually paid, not list price.
      const gross = productGross[pid] || 0
      const netRatio = gross > 0 ? (productNet[pid] || 0) / gross : 1
      const value30d = dailyQty * 30 * (Number(p.price) || 0) * netRatio
      return { productId: pid, name: p.name, emoji: p.emoji, baseDailyQty: r2(baseDailyQty), last7Qty: r2(last7 / 7), trend, forecast30d: r2(dailyQty * 30), value30d: r2(value30d) }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.value30d - a.value30d)
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
}

export function daysOnHand() {
  requireAdmin()
  const s = getSqlite()
  const db = getDb()
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
}
