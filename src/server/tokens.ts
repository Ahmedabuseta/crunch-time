// Signed, expiring tokens for the remote POS server.
// HMAC-SHA256 over a base64url payload — no external JWT dependency. The key
// is the per-install `remote_secret`, which is rotated on every PIN change so
// a lost phone's token stops verifying the moment the owner changes the PIN.
import { createHmac, timingSafeEqual } from 'crypto'

export interface RemoteToken {
  sub: 'owner'
  iat: number
  exp: number
}

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
// Re-issue a token when the current one is older than this, so an actively
// used phone never has to log in again (sliding window).
export const TOKEN_REFRESH_AFTER_MS = 12 * 60 * 60 * 1000 // 12 hours

const b64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromB64url = (s: string) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

const mac = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest()

export function signToken(secret: string, ttlMs = TOKEN_TTL_MS, now = Date.now()): string {
  const payload: RemoteToken = { sub: 'owner', iat: now, exp: now + ttlMs }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${b64url(mac(body, secret))}`
}

export function verifyToken(
  token: string | null | undefined,
  secret: string | null | undefined,
  now = Date.now(),
): RemoteToken | null {
  if (!token || !secret) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = mac(body, secret)
  const actual = fromB64url(sig)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const payload = JSON.parse(fromB64url(body).toString('utf8')) as RemoteToken
    if (payload.sub !== 'owner') return null
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}

/** Extracts a bearer token from an Authorization header (or a `?token=`). */
export function extractToken(authorization?: string | null, queryToken?: string | null): string | null {
  if (authorization) {
    const m = /^Bearer\s+(.+)$/i.exec(authorization.trim())
    if (m) return m[1].trim()
  }
  return queryToken ? String(queryToken) : null
}
