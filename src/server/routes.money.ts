// Money routes for the remote POS: payments, cash drawer, shifts and the
// end-of-shift Z report. All owner-only (the auth guard already ran); the ones
// that call admin-gated backend functions lend an owner identity, and drawer /
// shift operations carry the phone's device label into the audit log.
import type { FastifyInstance } from 'fastify'
import type { Backend } from '../backend'
import { withDeviceLabel } from '../backend/audit'
import { emitEvent } from './events'
import { asOwner } from './privileges'
import { deviceLabel, num, ownerUserId } from './route-helpers'

export function registerMoneyRoutes(app: FastifyInstance, backend: Backend) {
  // ─── Payments ───────────────────────────────────────────────
  app.post('/payments', async (req, reply) => {
    const body = (req.body || {}) as any
    if (!body.orderId) return reply.code(400).send({ ok: false, error: 'orderId مطلوب' })
    const res = withDeviceLabel(deviceLabel(req.headers, body), () =>
      backend.payments.createPayment({ ...body, amount: num(body.amount) }))
    emitEvent('order:updated', { id: String(body.orderId), payment: true })
    return { ok: true, ...res }
  })

  app.get('/orders/:id/payments', async (req) => ({
    payments: await backend.payments.listPaymentsByOrder(String((req.params as any).id)),
  }))

  app.get('/orders/:id/payments/total', async (req) => ({
    total: await backend.payments.getTotalPaid(String((req.params as any).id)),
  }))

  // ─── Cash drawer ────────────────────────────────────────────
  app.post('/cash-drawer/movements', async (req, reply) => {
    const body = (req.body || {}) as any
    if (!body.shiftId || !body.type) return reply.code(400).send({ ok: false, error: 'بيانات الحركة ناقصة' })
    const res = withDeviceLabel(deviceLabel(req.headers, body), () =>
      backend.cashdrawer.addMovement({ ...body, amount: num(body.amount) }))
    emitEvent('cash:updated', { shiftId: String(body.shiftId) })
    return { ok: true, ...res }
  })

  app.post('/cash-drawer/reconcile', async (req, reply) => {
    const body = (req.body || {}) as any
    const shiftId = String(body.shiftId || '')
    if (!shiftId) return reply.code(400).send({ ok: false, error: 'shiftId مطلوب' })
    const result = withDeviceLabel(deviceLabel(req.headers, body), () =>
      asOwner(() => backend.cashdrawer.reconcile(shiftId)))
    if (!result) return reply.code(404).send({ ok: false, error: 'الوردية غير موجودة' })
    return { ok: true, reconciliation: result }
  })

  app.get('/cash-drawer/:shiftId', async (req) => {
    const shiftId = String((req.params as any).shiftId)
    return asOwner(async () => ({
      movements: await backend.cashdrawer.listMovementsByShift(shiftId),
      expected: await backend.cashdrawer.expectedCash(shiftId),
    }))
  })

  // ─── Shifts ─────────────────────────────────────────────────
  app.post('/shifts/open', async (req, reply) => {
    const body = (req.body || {}) as any
    const res = withDeviceLabel(deviceLabel(req.headers, body), () =>
      backend.shifts.openShift({ ...body, userId: body.userId || ownerUserId(), openingCash: num(body.openingCash) })) as any
    if (res.error) return reply.code(400).send({ ok: false, error: res.error })
    emitEvent('shift:updated', { id: res.id })
    return { ok: true, ...res }
  })

  app.post('/shifts/close', async (req, reply) => {
    const body = (req.body || {}) as any
    const id = String(body.id || body.shiftId || '')
    if (!id) return reply.code(400).send({ ok: false, error: 'معرّف الوردية مطلوب' })
    withDeviceLabel(deviceLabel(req.headers, body), () =>
      backend.shifts.closeShift(id, num(body.closingCash)))
    emitEvent('shift:updated', { id })
    return { ok: true }
  })

  app.get('/shifts/current', async () => ({ shift: await backend.shifts.getCurrentShift() }))

  app.get('/shifts', async () => ({ shifts: await asOwner(() => backend.shifts.listShifts()) }))

  // ─── Z report (end of shift) ────────────────────────────────
  app.get('/reports/z', async (req, reply) => {
    const q = (req.query || {}) as any
    let shiftId = q.shiftId ? String(q.shiftId) : ''
    if (!shiftId) {
      const current = await backend.shifts.getCurrentShift()
      shiftId = current?.id || ''
    }
    if (!shiftId) return reply.code(404).send({ ok: false, error: 'لا توجد وردية مفتوحة' })
    const report = await asOwner(() => backend.reports.shiftReport(shiftId))
    if (!report) return reply.code(404).send({ ok: false, error: 'الوردية غير موجودة' })
    return { ok: true, report }
  })
}
