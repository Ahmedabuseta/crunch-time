// Admin routes: users, settings, discount codes and the audit log.
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Backend } from '../backend'
import { mutate } from './route-helpers'

const hardOpt = (req: FastifyRequest) => {
  const q = (req.query || {}) as any
  return { hard: q.hard === '1' || q.hard === 'true' }
}

export function registerAdminRoutes(app: FastifyInstance, backend: Backend) {
  // ─── Users ──────────────────────────────────────────────────
  app.get('/users', async () => ({ users: await backend.users.listUsers() }))
  app.post('/users', async (req) =>
    mutate(req, { action: 'user.create', entity: 'user' }, () => backend.users.createUser(req.body)))
  app.put('/users/:id', async (req) =>
    mutate(req, { action: 'user.update', entity: 'user', entityId: (req.params as any).id }, () =>
      backend.users.updateUser((req.params as any).id, req.body)))
  app.delete('/users/:id', async (req) =>
    mutate(req, { action: 'user.delete', entity: 'user', entityId: (req.params as any).id }, () =>
      backend.users.deleteUser((req.params as any).id, hardOpt(req))))
  app.post('/users/:id/verify-pin', async (req) =>
    ({ result: await backend.users.verifyPin((req.params as any).id, String((req.body as any)?.pin ?? '')) }))

  // ─── Settings ───────────────────────────────────────────────
  app.get('/settings', async () => ({ settings: await backend.settings.getSettings() }))
  app.put('/settings', async (req) => {
    const before = (await backend.settings.getSettings()) as any
    const keys = Object.keys((req.body || {}) as any)
    const beforeSubset: Record<string, any> = {}
    for (const k of keys) beforeSubset[k] = before?.[k] ?? null
    return mutate(req, { action: 'settings.update', entity: 'settings', entityId: 'settings', before: beforeSubset }, () =>
      backend.settings.updateSettings(req.body))
  })

  // ─── Discount codes ─────────────────────────────────────────
  app.get('/discount-codes', async () => ({ codes: await backend.settings.listDiscountCodes() }))
  app.post('/discount-codes', async (req) =>
    mutate(req, { action: 'discountCode.create', entity: 'discount_code' }, () => backend.settings.createDiscountCode(req.body)))
  app.put('/discount-codes/:id', async (req) =>
    mutate(req, { action: 'discountCode.update', entity: 'discount_code', entityId: (req.params as any).id }, () =>
      backend.settings.updateDiscountCode((req.params as any).id, req.body)))
  app.delete('/discount-codes/:id', async (req) =>
    mutate(req, { action: 'discountCode.delete', entity: 'discount_code', entityId: (req.params as any).id }, () =>
      backend.settings.deleteDiscountCode((req.params as any).id, hardOpt(req))))
  app.post('/discount-codes/validate', async (req) =>
    ({ validation: await backend.settings.validateDiscountCode(String((req.body as any)?.code ?? '')) }))
  app.post('/discount-codes/:id/use', async (req) =>
    mutate(req, { action: 'discountCode.use', entity: 'discount_code', entityId: (req.params as any).id, afterFrom: () => null }, () =>
      backend.settings.useDiscountCode((req.params as any).id)))

  // ─── Audit log ──────────────────────────────────────────────
  app.get('/audit', async (req) => {
    const q = (req.query || {}) as any
    return {
      entries: await backend.audit.listAudit({
        entity: q.entity ? String(q.entity) : undefined,
        entityId: q.entityId ? String(q.entityId) : undefined,
        action: q.action ? String(q.action) : undefined,
        from: q.from ? String(q.from) : undefined,
        to: q.to ? String(q.to) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      }),
    }
  })
}
