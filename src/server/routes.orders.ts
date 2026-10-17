// Order routes for the remote POS: create (with idempotency), list, status
// changes, driver assignment and printing. Mutations emit events so a phone
// sale appears on the desktop board immediately.
import type { FastifyInstance } from 'fastify'
import type { Backend } from '../backend'
import { getSqlite } from '../db/client'
import { now } from '../backend/shared'
import { verifyRemotePin } from '../backend/settings'
import { withDeviceLabel } from '../backend/audit'
import { emitEvent } from './events'
import { asOwner } from './privileges'
import { deviceLabel } from './util'
import { mutate } from './route-helpers'
import { readListQuery, pageMeta } from './list-query'

const ORDER_TYPES = new Set(['dine-in', 'takeaway', 'delivery'])
const ORDER_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'REFUNDED'])

export function registerOrderRoutes(app: FastifyInstance, backend: Backend) {
  // ─── Create ─────────────────────────────────────────────────
  app.post('/orders', async (req, reply) => {
    const body = (req.body || {}) as any
    const key = String(req.headers['idempotency-key'] || body.idempotencyKey || '').trim()

    // A retried sale (same key) returns the original order — never a second sale.
    if (key) {
      const existing = getSqlite().prepare('SELECT order_id FROM idempotency_keys WHERE key = ?')
        .get(key) as { order_id: string | null } | undefined
      if (existing?.order_id) {
        const order = await backend.orders.getOrderById(existing.order_id)
        return { ok: true, id: existing.order_id, order, idempotent: true }
      }
    }

    if (!ORDER_TYPES.has(body.orderType)) {
      return reply.code(400).send({ ok: false, error: 'نوع الطلب غير صحيح' })
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return reply.code(400).send({ ok: false, error: 'لا يمكن إرسال طلب بدون أصناف' })
    }

    const payload = {
      ...body,
      userId: null,
      cashierName: body.cashierName || deviceLabel(req.headers, body),
    }

    let id: string
    try {
      if (key) {
        // Create the order and record the key in one transaction, so a
        // concurrent retry with the same key can never create a second order.
        id = getSqlite().transaction(() => {
          const existing = getSqlite().prepare('SELECT order_id FROM idempotency_keys WHERE key = ?')
            .get(key) as { order_id: string | null } | undefined
          if (existing?.order_id) return existing.order_id
          const created = backend.orders.createOrder(payload) as { id: string }
          getSqlite().prepare('INSERT INTO idempotency_keys (key, scope, order_id, created_at) VALUES (?, ?, ?, ?)')
            .run(key, 'orders', created.id, now())
          return created.id
        })()
      } else {
        id = (backend.orders.createOrder(payload) as { id: string }).id
      }
    } catch (err: any) {
      return reply.code(400).send({ ok: false, error: err?.message || 'تعذّر إنشاء الطلب' })
    }

    // Same side effects as the desktop checkout.
    backend.inventory.deductForOrder(id)
    if (body.discountCodeId) {
      try {
        backend.settings.useDiscountCode(body.discountCodeId)
      } catch {
        // a missing discount row must not fail a completed sale
      }
    }

    // Printing is best-effort: the sale stands even if a printer is offline.
    let printed: unknown = null
    try {
      const withholdReceipt = payload.orderType === 'delivery' && !payload.deliveryProfileId
      printed = await backend.printing.printOrderById(id, { autoReceipt: !withholdReceipt })
    } catch {
      printed = { receipt: { ok: false, error: 'فشلت الطباعة' }, kitchen: [], unrouted: 0 }
    }

    emitEvent('order:created', { id, orderType: payload.orderType })
    const order = await backend.orders.getOrderById(id)
    return { ok: true, id, order, print: printed }
  })

  // ─── List / read ────────────────────────────────────────────
  app.get('/orders', async (req) => {
    const q = (req.query || {}) as any
    const query = readListQuery(req, {
      sortable: ['createdAt', 'total', 'id'],
      defaultSort: 'createdAt',
      defaultDir: 'desc',
    })

    const filters: any = {}
    if (q.status) filters.status = String(q.status)
    if (q.orderType) filters.orderType = String(q.orderType)
    if (q.paymentType) filters.paymentType = String(q.paymentType)
    if (q.search) filters.search = String(q.search)
    if (q.from) filters.from = String(q.from)
    if (q.to) filters.to = String(q.to)
    if (q.deliveryProfileId) filters.deliveryProfileId = String(q.deliveryProfileId)

    const { items, total } = await backend.orders.listOrdersPaged({
      filters,
      limit: query.pageSize,
      offset: query.offset,
      sort: query.sort as any,
      dir: query.dir,
    })
    // Same key as before, with the paging metadata alongside it.
    return { orders: items, ...pageMeta(query, total) }
  })

  app.get('/orders/:id', async (req, reply) => {
    const order = await backend.orders.getOrderById(String((req.params as any).id))
    if (!order) return reply.code(404).send({ ok: false, error: 'الطلب غير موجود' })
    return { order }
  })

  // Delivery customer upsert (autocomplete data captured at order time).
  app.post('/customers', async (req) =>
    mutate(req, { action: 'customer.upsert', entity: 'customer' }, () => backend.customers.upsertCustomer(req.body)))

  // ─── Status / driver / print ────────────────────────────────
  app.patch('/orders/:id/status', async (req, reply) => {
    const id = String((req.params as any).id)
    const body = (req.body || {}) as any
    const status = String(body.status || '')
    if (!ORDER_STATUSES.has(status)) {
      return reply.code(400).send({ ok: false, error: 'حالة غير صحيحة' })
    }
    const res = withDeviceLabel(deviceLabel(req.headers, body), () =>
      asOwner(() => backend.orders.updateOrderStatus(id, status, body.reason)))
    if (!res.ok) return reply.code(400).send(res)
    emitEvent('order:updated', { id, status })
    return res
  })

  // Dedicated refund: reason required, optional PIN re-entry (a second factor
  // for money going back). The audit row is written by updateOrderStatus.
  app.post('/orders/:id/refund', async (req, reply) => {
    const id = String((req.params as any).id)
    const body = (req.body || {}) as any
    const reason = String(body.reason || '').trim()
    if (!reason) return reply.code(400).send({ ok: false, error: 'سبب الاسترداد مطلوب' })
    if (body.pin) {
      const ok = await verifyRemotePin(String(body.pin))
      if (!ok) return reply.code(401).send({ ok: false, error: 'الرقم السري غلط' })
    }
    const res = withDeviceLabel(deviceLabel(req.headers, body), () =>
      asOwner(() => backend.orders.updateOrderStatus(id, 'REFUNDED', reason)))
    if (!res.ok) return reply.code(400).send(res)
    emitEvent('order:updated', { id, status: 'REFUNDED' })
    return res
  })

  app.post('/orders/:id/assign-driver', async (req, reply) => {
    const id = String((req.params as any).id)
    const body = (req.body || {}) as any
    const res = withDeviceLabel(deviceLabel(req.headers, body), () =>
      asOwner(() => backend.orders.assignDriver(id, String(body.profileId || body.driverId || ''))))
    if (!res.ok) return reply.code(400).send(res)
    emitEvent('order:updated', { id, driver: true })
    return res
  })

  app.post('/orders/:id/print', async (req, reply) => {
    const id = String((req.params as any).id)
    const kind = String(((req.body || {}) as any).kind || 'receipt')
    const order = await backend.orders.getOrderById(id)
    if (!order) return reply.code(404).send({ ok: false, error: 'الطلب غير موجود' })
    if (kind === 'kitchen') return { ok: true, print: await backend.printing.printKitchenOnly(id) }
    return { ok: true, print: { receipt: await backend.printing.printReceiptOnly(id), kitchen: [], unrouted: 0 } }
  })
}
