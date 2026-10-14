// Report routes for the remote POS: the whole analytics surface of
// backend.reports over authenticated HTTP. Every backend report function is
// admin-gated (requireAdmin), and the server has no desktop session, so each
// call runs under a lent owner identity (asOwner).
//
// Backend calls are always awaited: a drizzle query builder nested unawaited
// inside the response object breaks JSON serialization.
import type { FastifyInstance } from 'fastify'
import type { Backend } from '../backend'
import { asOwner } from './privileges'

export function registerReportRoutes(app: FastifyInstance, backend: Backend) {
  const s = (v: unknown) => (v ? String(v) : undefined)
  const n = (v: unknown) => (v ? Number(v) : undefined)

  app.get('/reports/daily', async (req) => ({
    report: await asOwner(() => backend.reports.dailySummary(s((req.query as any)?.date))),
  }))

  app.get('/reports/period', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.periodSummary(s(q.from), s(q.to))) }
  })

  app.get('/reports/profit', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.profitSummary(s(q.from), s(q.to))) }
  })

  app.get('/reports/hourly', async (req) => ({
    report: await asOwner(() => backend.reports.hourlyBreakdown(s((req.query as any)?.date))),
  }))

  app.get('/reports/top-items', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.topItems(n(q.limit), s(q.from), s(q.to))) }
  })

  app.get('/reports/category-revenue', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.categoryRevenue(s(q.from), s(q.to))) }
  })

  app.get('/reports/addon-stats', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.addonStats(s(q.from), s(q.to))) }
  })

  app.get('/reports/ticket-distribution', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.ticketDistribution(s(q.from), s(q.to))) }
  })

  app.get('/reports/order-type-split', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.orderTypeSplit(s(q.from), s(q.to))) }
  })

  app.get('/reports/shift/:id', async (req, reply) => {
    const report = await asOwner(() => backend.reports.shiftReport(String((req.params as any).id)))
    if (!report) return reply.code(404).send({ ok: false, error: 'الوردية غير موجودة' })
    return { report }
  })

  app.get('/reports/shift-summary', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.shiftSummary(s(q.from), s(q.to))) }
  })

  app.get('/reports/labor', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.laborSummary(s(q.from), s(q.to))) }
  })

  app.get('/reports/voids', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.voidSummary(s(q.from), s(q.to))) }
  })

  app.get('/reports/driver-summary', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.driverSummary({ from: s(q.from), to: s(q.to) })) }
  })

  app.get('/reports/revenue-trend', async (req) => ({
    report: await asOwner(() => backend.reports.revenueTrend(n((req.query as any)?.days))),
  }))

  app.get('/reports/inventory-alerts', async () => ({ report: await asOwner(() => backend.reports.inventoryAlerts()) }))

  app.get('/reports/payment-methods', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.paymentMethodBreakdown(s(q.from), s(q.to))) }
  })

  app.get('/reports/discounts', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.discountSummary(s(q.from), s(q.to))) }
  })

  app.get('/reports/abc-xyz', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.abcXyz(s(q.from), s(q.to))) }
  })

  app.get('/reports/inventory-turnover', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.inventoryTurnover(s(q.from), s(q.to))) }
  })

  app.get('/reports/purchase-price-variance', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.purchasePriceVariance(s(q.from), s(q.to))) }
  })

  app.get('/reports/sales-trend', async (req) => {
    const q = (req.query || {}) as any
    return { report: await asOwner(() => backend.reports.salesTrend({ days: n(q.days), forecastDays: n(q.forecastDays) })) }
  })

  app.get('/reports/days-on-hand', async () => ({ report: await asOwner(() => backend.reports.daysOnHand()) }))
}
