// Orders — creation, listing, status workflow, driver assignment, delete.
import { and, asc, desc, eq, gte, inArray, isNull, like, lte, or, sql } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { getOpenShiftId, now, rollbackInventory, rollbackInventoryPartial, uuid } from './shared'
import { requireAdmin } from './session'
import { writeAudit } from './audit'

const { orders, orderItems, payments, cashMovements, shifts, products, addons, customers, deliveryZones, deliveryProfiles } = schema

// Resolve a delivery zone id to its stored name (falls back to the
// name typed at the till when the zone row is gone).
function resolveDeliveryZone(zoneId?: string | null, zoneName?: string | null) {
  const db = getDb()
  if (!zoneId) return { deliveryZoneId: null as string | null, deliveryZoneName: (zoneName || '').trim() || null as string | null }
  const row = db.select({ name: deliveryZones.name }).from(deliveryZones).where(eq(deliveryZones.id, zoneId)).get()
  return { deliveryZoneId: zoneId, deliveryZoneName: (zoneName || '').trim() || row?.name || null }
}

/** Highest sequence already used for a shift's `N-###` order ids. Read by id
 * prefix rather than by shift_id: a row count drops when an order is deleted,
 * which hands the next sale an id that is already taken. */
function maxOrderSequence(shiftNumber: number) {
  const prefix = `${shiftNumber}-`
  const rows = getSqlite().prepare('SELECT id FROM orders WHERE id LIKE ?').all(`${prefix}%`) as { id: string }[]
  let max = 0
  for (const { id } of rows) {
    if (!id.startsWith(prefix)) continue
    const seq = Number(id.slice(prefix.length))
    if (Number.isInteger(seq) && seq > max) max = seq
  }
  return max
}

export function createOrder(data: any) {
  const db = getDb()
  const shiftId = getOpenShiftId(data.shiftId) || data.shiftId || null
  if (!shiftId) {
    throw new Error('لا يمكن إنشاء طلب بدون وردية مفتوحة')
  }
  const shift = db.select({ number: shifts.number }).from(shifts).where(eq(shifts.id, shiftId)).get()
  const shiftNumber = Number(shift?.number) || 0
  const ts = now()
  const nextOrderId = () => shiftNumber > 0
    ? `${shiftNumber}-${String(maxOrderSequence(shiftNumber) + 1).padStart(3, '0')}`
    : `#${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
  let id = nextOrderId()

  const orderRow = {
    status: 'COMPLETED',
    orderType: data.orderType,
    tableNumber: data.orderType === 'dine-in' ? (String(data.tableNumber || '').trim() || null) : null,
    customerName: data.customerName || null,
    customerPhone: data.customerPhone || null,
    customerAddress: data.customerAddress || null,
    deliveryAddress: data.deliveryAddress || null,
    deliveryPhone: data.deliveryPhone || null,
    // Money is always whole pounds — never persist a float total/discount,
    // regardless of which client (Electron IPC or in-browser mock) sent it.
    subtotal: Math.round(Number(data.subtotal) || 0),
    tax: Math.round(Number(data.tax) || 0),
    deliveryFee: Math.round(Number(data.deliveryFee) || 0),
    ...resolveDeliveryZone(data.deliveryZoneId, data.deliveryZoneName),
    deliveryNote: (data.deliveryNote || '').trim() || null,
    deliveryProfileId: data.deliveryProfileId || null,
    deliveryProfileName: data.deliveryProfileName || null,
    // The server derives the delivery workflow state — a client can't claim
    // a driver it never sent, and non-delivery orders never enter it.
    driverStatus: data.orderType === 'delivery'
      ? (data.deliveryProfileId ? 'assigned' : 'unassigned')
      : null,
    discountCode: data.discountCode || null,
    discountAmount: Math.round(Number(data.discountAmount) || 0),
    total: Math.round(Number(data.total) || 0),
    paymentType: data.paymentType || 'cash',
    cashierName: data.cashierName || null,
    note: (data.note || '').trim() || null,
    statusReason: null,
    refundedAmount: 0,
    userId: data.userId || null,
    shiftId,
    createdAt: ts,
    updatedAt: ts,
  }

  // Another till (or the phone) can claim the same id between the read above
  // and the insert. Recompute from the table and retry rather than losing the
  // sale to a UNIQUE constraint.
  for (let attempt = 0; ; attempt++) {
    try {
      db.insert(orders).values({ id, ...orderRow }).run()
      break
    } catch (err) {
      const duplicateId = err instanceof Error && /UNIQUE constraint failed: orders\.id/.test(err.message)
      if (!duplicateId || attempt >= 5) throw err
      id = nextOrderId()
    }
  }

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
}

/** The WHERE clauses the plain list, the paged list and its count all share —
 * so they can never disagree about what counts as a match. */
function orderConditions(filters?: any) {
  const conditions = [] as any[]
  if (filters?.status) conditions.push(eq(orders.status, filters.status))
  if (filters?.orderType) conditions.push(eq(orders.orderType, filters.orderType))
  if (filters?.paymentType) conditions.push(eq(orders.paymentType, filters.paymentType))
  if (filters?.search) {
    const term = `%${filters.search.toLowerCase()}%`
    conditions.push(or(
      like(orders.id, term),
      like(orders.customerName, term),
      like(orders.customerPhone, term),
      like(orders.customerAddress, term),
      like(orders.deliveryZoneName, term),
      like(orders.deliveryNote, term),
      like(orders.note, term),
      like(orders.cashierName, term),
    ))
  }
  if (filters?.from) conditions.push(gte(orders.createdAt, filters.from))
  if (filters?.to) conditions.push(lte(orders.createdAt, filters.to + '￿'))
  // The board's driver tab. 'NONE' is the "no driver assigned yet" sentinel it
  // already uses, and it has to be a server filter now that the list pages —
  // narrowing one page of results is not the same as filtering the orders.
  if (filters?.deliveryProfileId) {
    conditions.push(
      filters.deliveryProfileId === 'NONE'
        ? isNull(orders.deliveryProfileId)
        : eq(orders.deliveryProfileId, filters.deliveryProfileId)
    )
  }
  return conditions
}

/** Attaches each order's items, and the product/addon names those items need.
 * Only the rows handed in are hydrated — which is what makes paging worth
 * anything. */
function hydrateOrders(rows: any[]) {
  const db = getDb()
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
}

export function listOrders(filters?: any) {
  const db = getDb()
  const conditions = orderConditions(filters)
  const rows = (conditions.length > 0
    ? db.select().from(orders).where(and(...conditions))
    : db.select().from(orders)
  ).orderBy(desc(orders.createdAt)).all() as any[]

  return hydrateOrders(rows)
}

/** Sortable order fields. The client sends one of these names and the route
 * maps it to a column, so a client-supplied string never reaches SQL. */
export const ORDER_SORTS = {
  createdAt: orders.createdAt,
  total: orders.total,
  id: orders.id,
} as const

export type OrderSortKey = keyof typeof ORDER_SORTS

/**
 * A page of orders. The count and the ordering both happen in SQL *before* the
 * limit, so `total` is the size of the whole match and the sort is over every
 * matching row rather than only the ones that happened to land on this page.
 */
export function listOrdersPaged(options: {
  filters?: any
  limit: number
  offset: number
  sort?: OrderSortKey
  dir?: 'asc' | 'desc'
}) {
  const db = getDb()
  const conditions = orderConditions(options.filters)
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const countQuery = db.select({ count: sql<number>`COUNT(*)` }).from(orders)
  const total = Number((where ? countQuery.where(where) : countQuery).get()?.count ?? 0)

  const column = ORDER_SORTS[options.sort ?? 'createdAt']
  const listQuery = db.select().from(orders)
  const rows = (where ? listQuery.where(where) : listQuery)
    // The id is a tiebreaker, not decoration: two orders created in the same
    // millisecond would otherwise order arbitrarily between queries, and page 2
    // could repeat a row from page 1.
    .orderBy(options.dir === 'asc' ? asc(column) : desc(column), desc(orders.id))
    .limit(options.limit)
    .offset(options.offset)
    .all() as any[]

  return { items: hydrateOrders(rows), total }
}

export function getOrderById(id: string) {
  const db = getDb()
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
}

export function updateOrderStatus(id: string, status: string, reason?: string) {
  requireAdmin()
  const db = getDb()
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
    writeAudit({
      action: 'order.refund', entity: 'order', entityId: id,
      before: { status: order.status, refundedAmount: order.refundedAmount },
      after: { status, reason: reason || null, refundedAmount },
    })
    return { ok: true, refundedAmount }
  }

  db.update(orders).set({ status, statusReason: reason || null, updatedAt: ts })
    .where(eq(orders.id, id)).run()
  if (status === 'CANCELLED') {
    writeAudit({
      action: 'order.cancel', entity: 'order', entityId: id,
      before: { status: order.status, refundedAmount: order.refundedAmount },
      after: { status, reason: reason || null },
    })
  }
  return { ok: true }
}

// ─── Delivery driver workflow ─────────────────────────────
// Cashier *and* admin may assign: the cashier hands orders to drivers all
// day, so this deliberately has no requireAdmin() (unlike updateStatus).
export function assignDriver(orderId: string, profileId: string) {
  const db = getDb()
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get()
  if (!order) return { ok: false, error: 'الطلب غير موجود' }
  if (order.orderType !== 'delivery') return { ok: false, error: 'التعيين متاح لطلبات التوصيل فقط' }
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    return { ok: false, error: 'الطلب ملغى أو مسترد — مفيش سبب لتعيين سائق' }
  }
  const profile = db.select().from(deliveryProfiles).where(eq(deliveryProfiles.id, profileId)).get()
  if (!profile) return { ok: false, error: 'الديلفري غير موجود' }
  if (!profile.active) return { ok: false, error: 'الديلفري معطل — اختار واحد تاني' }

  db.update(orders).set({
    deliveryProfileId: profile.id,
    deliveryProfileName: profile.name,
    driverStatus: 'assigned',
    updatedAt: now(),
  }).where(eq(orders.id, orderId)).run()
  // Receipt is released the moment a driver exists on the order.
  return { ok: true, receiptReady: true }
}

// Badge feed for the الديلفري top tab — today's unresolved delivery orders
// only, so old backfilled rows never keep the badge lit forever. A NULL
// driver_status on a delivery order means the same as 'unassigned' (rows
// written outside order:create, e.g. by the demo seed) — count those too.
export function unassignedCount() {
  const db = getDb()
  const today = new Date().toISOString().slice(0, 10)
  const row = db.select({ c: sql<number>`COUNT(*)` }).from(orders)
    .where(and(
      eq(orders.orderType, 'delivery'),
      sql`(${orders.driverStatus} IS NULL OR ${orders.driverStatus} = 'unassigned')`,
      sql`${orders.status} NOT IN ('CANCELLED', 'REFUNDED')`,
      gte(orders.createdAt, today),
    )).get() as { c: number } | undefined
  return Number(row?.c || 0)
}

export function deleteOrder(id: string) {
  requireAdmin()
  const sqlite = getSqlite()
  const deleteOrder = sqlite.transaction(() => {
    const order = sqlite.prepare('SELECT id, status, order_type, customer_phone, payment_type, shift_id FROM orders WHERE id = ?').get(id) as {
      id: string
      status: string
      order_type: string
      customer_phone: string | null
      payment_type: string
      shift_id: string | null
    } | undefined
    if (!order) return { ok: false, error: 'الطلب غير موجود' }

    // A completed order has already consumed stock. Restore it exactly once
    // before removing its order-linked inventory history.
    if (order.status === 'COMPLETED') rollbackInventory(id)

    // Foreign keys are enabled, so remove every direct order child first.
    sqlite.prepare('DELETE FROM inventory_transactions WHERE reference_order_id = ?').run(id)
    sqlite.prepare('DELETE FROM payments WHERE order_id = ?').run(id)
    sqlite.prepare('DELETE FROM order_items WHERE order_id = ?').run(id)

    // Cash movements store the order id in their note rather than a FK.
    if (order.shift_id) {
      sqlite.prepare(`
        DELETE FROM cash_movements
        WHERE shift_id = ? AND note LIKE ?
      `).run(order.shift_id, `%طلب ${id}%`)
    }

    sqlite.prepare('DELETE FROM orders WHERE id = ?').run(id)

    if (order.customer_phone) {
      const customerPhone = order.customer_phone.replace(/\D/g, '')
      const customer = sqlite.prepare('SELECT id FROM customers WHERE phone = ?').get(customerPhone) as { id: string } | undefined
      if (customer) {
        const remainingOrders = sqlite.prepare('SELECT customer_phone, created_at FROM orders WHERE customer_phone IS NOT NULL').all() as { customer_phone: string; created_at: string }[]
        const customerOrders = remainingOrders.filter((remaining) => remaining.customer_phone.replace(/\D/g, '') === customerPhone)
        const lastOrderAt = customerOrders.reduce<string | null>((latest, remaining) => !latest || remaining.created_at > latest ? remaining.created_at : latest, null)
        sqlite.prepare(`
          UPDATE customers
          SET order_count = ?, last_order_at = ?
          WHERE id = ?
        `).run(customerOrders.length, lastOrderAt, customer.id)
      }
    }

    return { ok: true }
  })

  return deleteOrder()
}
