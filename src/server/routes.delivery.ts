// Delivery, expenses, kitchen stations and printers over HTTP.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Backend } from '../backend'
import { mutate } from './route-helpers'

const hardOpt = (req: FastifyRequest) => {
  const q = (req.query || {}) as any
  return { hard: q.hard === '1' || q.hard === 'true' }
}

export function registerDeliveryRoutes(app: FastifyInstance, backend: Backend) {
  // ─── Delivery zones ─────────────────────────────────────────
  app.post('/delivery-zones', async (req) =>
    mutate(req, { action: 'deliveryZone.create', entity: 'delivery_zone' }, () => backend.delivery.createDeliveryZone(req.body)))
  app.put('/delivery-zones/:id', async (req) =>
    mutate(req, { action: 'deliveryZone.update', entity: 'delivery_zone', entityId: (req.params as any).id }, () =>
      backend.delivery.updateDeliveryZone((req.params as any).id, req.body)))
  app.delete('/delivery-zones/:id', async (req) =>
    mutate(req, { action: 'deliveryZone.delete', entity: 'delivery_zone', entityId: (req.params as any).id }, () =>
      backend.delivery.deleteDeliveryZone((req.params as any).id, hardOpt(req))))
  app.post('/delivery-zones/reorder', async (req) =>
    mutate(req, { action: 'deliveryZone.reorder', entity: 'delivery_zone' }, () =>
      backend.delivery.reorderDeliveryZones((req.body as any)?.ids || [])))

  // ─── Delivery profiles ──────────────────────────────────────
  app.get('/delivery-profiles', async (req) =>
    ({ profiles: await backend.delivery.listDeliveryProfiles((req.query as any)?.includeInactive === '1') }))
  app.post('/delivery-profiles', async (req) =>
    mutate(req, { action: 'deliveryProfile.create', entity: 'delivery_profile' }, () => backend.delivery.createDeliveryProfile(req.body)))
  app.put('/delivery-profiles/:id', async (req) =>
    mutate(req, { action: 'deliveryProfile.update', entity: 'delivery_profile', entityId: (req.params as any).id }, () =>
      backend.delivery.updateDeliveryProfile((req.params as any).id, req.body)))
  app.delete('/delivery-profiles/:id', async (req) =>
    mutate(req, { action: 'deliveryProfile.delete', entity: 'delivery_profile', entityId: (req.params as any).id }, () =>
      backend.delivery.deleteDeliveryProfile((req.params as any).id, hardOpt(req))))

  // ─── Expenses ───────────────────────────────────────────────
  app.get('/expenses', async () => ({ expenses: await backend.expenses.listExpenses() }))
  app.get('/expenses/monthly-total', async () => ({ total: await backend.expenses.totalMonthlyExpenses() }))
  app.post('/expenses', async (req) =>
    mutate(req, { action: 'expense.create', entity: 'expense' }, () => backend.expenses.createExpense(req.body)))
  app.put('/expenses/:id', async (req) =>
    mutate(req, { action: 'expense.update', entity: 'expense', entityId: (req.params as any).id }, () =>
      backend.expenses.updateExpense((req.params as any).id, req.body)))
  app.delete('/expenses/:id', async (req) =>
    mutate(req, { action: 'expense.delete', entity: 'expense', entityId: (req.params as any).id }, () =>
      backend.expenses.deleteExpense((req.params as any).id, hardOpt(req))))

  // ─── Kitchen stations ───────────────────────────────────────
  app.post('/stations', async (req) =>
    mutate(req, { action: 'station.create', entity: 'station' }, () => backend.stations.createStation(req.body)))
  app.put('/stations/:id', async (req) =>
    mutate(req, { action: 'station.update', entity: 'station', entityId: (req.params as any).id }, () =>
      backend.stations.updateStation((req.params as any).id, req.body)))
  app.delete('/stations/:id', async (req) =>
    mutate(req, { action: 'station.delete', entity: 'station', entityId: (req.params as any).id }, () =>
      backend.stations.deleteStation((req.params as any).id, hardOpt(req))))
  app.get('/stations/route/:orderId', async (req) => ({ routing: await backend.stations.routeOrder((req.params as any).orderId) }))

  // ─── Printers ───────────────────────────────────────────────
  app.post('/printers/test', async (req) => backend.stations.testPrint((req.body as any)?.deviceName))
  app.post('/printers/print', async (req) => {
    const body = (req.body || {}) as any
    if (!body.html) return { ok: false, error: 'محتوى الطباعة مطلوب' }
    return backend.stations.printHtml(String(body.html), {
      deviceName: body.deviceName, copies: body.copies, paperWidth: body.paperWidth,
    })
  })
}
