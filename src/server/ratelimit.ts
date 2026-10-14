// In-memory, per-key (per-IP) rate limiting for the login route.
// A wrong PIN costs the caller a slot; too many mistakes inside the window
// lock that IP out for a while. State is deliberately in memory — a restart
// clears it, which is fine for a single-shop LAN server.
export interface RateLimiter {
  /** Seconds to wait before the next attempt, or null when allowed. */
  retryAfter(key: string): number | null
  recordFailure(key: string): void
  reset(key: string): void
}

export function createRateLimiter(opts: { max: number; windowMs: number; lockMs: number }): RateLimiter {
  const entries = new Map<string, { fails: number; windowStart: number; lockedUntil: number }>()

  const nowMs = () => Date.now()

  return {
    retryAfter(key) {
      const e = entries.get(key)
      if (!e) return null
      const now = nowMs()
      if (e.lockedUntil > now) return Math.ceil((e.lockedUntil - now) / 1000)
      if (now - e.windowStart > opts.windowMs) {
        entries.delete(key)
        return null
      }
      return null
    },
    recordFailure(key) {
      const now = nowMs()
      const e = entries.get(key)
      if (!e || now - e.windowStart > opts.windowMs) {
        entries.set(key, { fails: 1, windowStart: now, lockedUntil: 0 })
        return
      }
      e.fails += 1
      if (e.fails >= opts.max) {
        e.lockedUntil = now + opts.lockMs
        e.fails = 0
        e.windowStart = now
      }
    },
    reset(key) {
      entries.delete(key)
    },
  }
}
