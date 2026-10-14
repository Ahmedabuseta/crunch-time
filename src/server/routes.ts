// HTTP routes for the remote POS server.
// Every route except /health and /auth/login requires a valid bearer token —
// all phone users are owners, so there is no role logic here (the desktop's
// admin gate lives in the IPC session, which the server never uses).
import type { FastifyInstance } from 'fastify'
import type { Backend } from '../backend'
import { consumeRemotePairCode, getRemoteConfig, verifyRemotePin } from '../backend/settings'
import { withDeviceLabel, writeAudit } from '../backend/audit'
import { createRateLimiter } from './ratelimit'
import { deviceLabel } from './util'
import { registerOrderRoutes } from './routes.orders'
import { registerMoneyRoutes } from './routes.money'
import { registerCatalogRoutes } from './routes.catalog'
import { registerInventoryRoutes } from './routes.inventory'
import { registerAdminRoutes } from './routes.admin'
import { registerDeliveryRoutes } from './routes.delivery'
import { registerBackupRoutes } from './routes.backup'
import { registerReportRoutes } from './routes.reports'
import {
  TOKEN_REFRESH_AFTER_MS,
  TOKEN_TTL_MS,
  extractToken,
  signToken,
  verifyToken,
} from './tokens'

// Paths reachable without a token.
const PUBLIC_PATHS = new Set(['/health', '/auth/login', '/auth/pair'])

// 8 wrong PINs from one IP inside 5 minutes locks that IP out for 10 minutes.
const loginLimiter = createRateLimiter({ max: 8, windowMs: 5 * 60_000, lockMs: 10 * 60_000 })

// Funnel puts this server on the public internet, where guessing can come from
// many addresses at once. On top of the per-IP limit, a global brake pauses
// login and pairing for everyone after 40 failures in 15 minutes.
const globalLoginLimiter = createRateLimiter({ max: 40, windowMs: 15 * 60_000, lockMs: 15 * 60_000 })

const GLOBAL_KEY = 'all'

/** null when allowed, otherwise the Arabic "too many attempts" reply. */
function throttle(ip: string) {
  const globalWait = globalLoginLimiter.retryAfter(GLOBAL_KEY)
  if (globalWait !== null) return `محاولات كثيرة — انتظر ${globalWait} ثانية`
  const wait = loginLimiter.retryAfter(ip)
  if (wait !== null) return `محاولات كثيرة — انتظر ${wait} ثانية`
  return null
}

function recordAuthFailure(ip: string) {
  loginLimiter.recordFailure(ip)
  globalLoginLimiter.recordFailure(GLOBAL_KEY)
}

/** Builds the auth guard + registers every route on the instance. */
export function registerRoutes(app: FastifyInstance, backend: Backend) {
  // Business errors thrown by the backend (validation, refused deletes) become
  // a 400 with their Arabic message instead of a bare 500.
  app.setErrorHandler((err: any, _req, reply) => {
    const status = typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500
      ? err.statusCode
      : 400
    reply.code(status).send({ ok: false, error: err?.message || 'خطأ غير متوقع' })
  })

  // Raw uploads (database restore).
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body))

  app.addHook('onRequest', async (req, reply) => {
    const path = req.routeOptions?.url || req.url.split('?')[0]
    if (PUBLIC_PATHS.has(path)) return
    const cfg = getRemoteConfig()
    const token = extractToken(req.headers.authorization, (req.query as any)?.token)
    const payload = verifyToken(token, cfg.secret)
    if (!payload) {
      return reply.code(401).send({ ok: false, error: 'الرجاء تسجيل الدخول' })
    }
    // Sliding session: hand an actively used phone a fresh token before the
    // old one gets close to expiring, so it never has to log in again.
    if (cfg.secret && Date.now() - payload.iat > TOKEN_REFRESH_AFTER_MS) {
      reply.header('x-refresh-token', signToken(cfg.secret))
    }
  })

  app.get('/health', async () => ({ ok: true, name: 'crunch-time-pos' }))

  app.post('/auth/login', async (req, reply) => {
    const ip = req.ip || 'unknown'
    const blocked = throttle(ip)
    if (blocked) {
      return reply.code(429).send({ ok: false, error: blocked, retryAfter: 60 })
    }
    const cfg = getRemoteConfig()
    if (!cfg.pinHash || !cfg.secret) {
      return reply.code(401).send({ ok: false, error: 'الخادم غير جاهز — لم يتم تحديد الرقم السري بعد' })
    }
    const pin = String((req.body as any)?.pin ?? '')
    const ok = await verifyRemotePin(pin)
    if (!ok) {
      recordAuthFailure(ip)
      return reply.code(401).send({ ok: false, error: 'الرقم السري غلط' })
    }
    loginLimiter.reset(ip)
    return { ok: true, token: signToken(cfg.secret), expiresIn: TOKEN_TTL_MS }
  })

  // Exchange a single-use pairing code (from the QR on the PC) for a session —
  // the owner never types the address or the PIN.
  app.post('/auth/pair', async (req, reply) => {
    const ip = req.ip || 'unknown'
    const blocked = throttle(ip)
    if (blocked) {
      return reply.code(429).send({ ok: false, error: blocked, retryAfter: 60 })
    }
    const cfg = getRemoteConfig()
    if (!cfg.secret) {
      return reply.code(401).send({ ok: false, error: 'الخادم غير جاهز — لم يتم تحديد الرقم السري بعد' })
    }
    const body = (req.body || {}) as any
    if (!consumeRemotePairCode(String(body.code ?? ''))) {
      recordAuthFailure(ip)
      return reply.code(401).send({ ok: false, error: 'كود الربط غلط أو انتهت صلاحيته — اعمل كود جديد من الكمبيوتر' })
    }
    loginLimiter.reset(ip)
    withDeviceLabel(deviceLabel(req.headers, body), () =>
      writeAudit({ action: 'remote.pair', entity: 'settings', entityId: 'settings', after: { paired: true } }))
    return { ok: true, token: signToken(cfg.secret), expiresIn: TOKEN_TTL_MS }
  })

  // ─── Read-only catalogue ────────────────────────────────────
  // Backend calls are awaited individually: drizzle's query builders are
  // thenable (the IPC layer awaits the whole return value), but nesting a
  // builder inside a response object skips that and breaks JSON serialization.
  app.get('/menu', async () => ({
    categories: await backend.catalog.listCategories(),
    products: await backend.catalog.listProducts(),
  }))

  // Options for one product: its addons and its modifier groups (with members).
  app.get('/menu/products/:id/options', async (req, reply) => {
    const id = String((req.params as any).id)
    const product = await backend.catalog.getProductById(id)
    if (!product) return reply.code(404).send({ ok: false, error: 'المنتج غير موجود' })
    return {
      product,
      addons: await backend.addons.listAddonsByProduct(id),
      modifierGroups: await backend.modifiers.listModifiersByProduct(id),
    }
  })

  app.get('/customers/search', async (req) => ({
    customers: await backend.customers.searchCustomers(String((req.query as any)?.q ?? '')),
  }))

  app.get('/delivery-zones', async () => ({ zones: await backend.delivery.listDeliveryZones() }))

  app.get('/stations', async () => ({ stations: await backend.stations.listStations() }))

  app.get('/printers', async () => ({ printers: await backend.stations.listPrinters() }))

  // ─── Orders ─────────────────────────────────────────────────
  registerOrderRoutes(app, backend)

  // ─── Money: payments, drawer, shifts, Z report ──────────────
  registerMoneyRoutes(app, backend)

  // ─── Admin parity: catalogue, inventory, users/settings, delivery, backup ──
  registerCatalogRoutes(app, backend)
  registerInventoryRoutes(app, backend)
  registerAdminRoutes(app, backend)
  registerDeliveryRoutes(app, backend)
  registerBackupRoutes(app, backend)

  // ─── Reports ────────────────────────────────────────────────
  registerReportRoutes(app, backend)
}
