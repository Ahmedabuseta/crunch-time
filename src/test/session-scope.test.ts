import { beforeEach, describe, expect, it } from 'vitest'
import { clearUser, getUser, requireAdmin, setUser } from '../backend/session'
import { asOwner, asOwnerAsync } from '../server/privileges'

describe('session isolation', () => {
  beforeEach(() => clearUser())

  it('keeps concurrent owner elevations isolated from a cashier desktop session', async () => {
    setUser({ id: 'cashier-1', role: 'cashier' })

    const results = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        asOwnerAsync(async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 5))
          requireAdmin()
          return index
        }),
      ),
    )

    expect(results).toHaveLength(25)
    // The desktop still sees its cashier; no elevation leaked out.
    expect(getUser()).toEqual({ id: 'cashier-1', role: 'cashier' })
    expect(() => requireAdmin()).toThrow()
  })

  it('restores the desktop session after a synchronous owner call', () => {
    setUser({ id: 'cashier-2', role: 'cashier' })
    expect(asOwner(() => { requireAdmin(); return getUser()?.id })).toBe('remote-owner')
    expect(getUser()).toEqual({ id: 'cashier-2', role: 'cashier' })
  })
})

describe('Fastify request owner scope', () => {
  it('propagates the owner identity through hooks into the handler', async () => {
    const Fastify = (await import('fastify')).default
    const { runAs } = await import('../backend/session')
    const app = Fastify()
    app.addHook('onRequest', (_req, _reply, done) => {
      runAs({ id: 'remote-owner', role: 'admin' }, () => done())
    })
    app.get('/admin', async () => {
      requireAdmin()
      return { ok: true }
    })
    const res = await app.inject('/admin')
    expect(res.statusCode).toBe(200)
    await app.close()
  })
})
