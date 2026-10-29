// The per-day token budget.
//
// Every model call adds its usage to `ai_usage` before the next message is
// considered, so the owner's daily cap holds across restarts and across the
// phone and the desktop. A missing table reads as zero usage: the guard must
// keep answering even on a database where migration 011 never ran.
import { getSqlite } from '../../db/client'

export interface UsageToday {
  promptTokens: number
  completionTokens: number
  requests: number
  total: number
}

export interface UsageSnapshot extends UsageToday {
  limit: number
  /** `null` when the owner set no cap (limit <= 0). */
  remaining: number | null
}

const ZERO: UsageToday = { promptTokens: 0, completionTokens: 0, requests: 0, total: 0 }

/** A token count is a whole, non-negative number; anything else counts as 0. */
function count(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n)
}

const pad = (value: number) => String(value).padStart(2, '0')

/** `YYYY-MM-DD` in local time — the owner's day, not UTC's. */
export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Usage recorded for one day; zeros when nothing was recorded or read fails. */
export function getUsageToday(day = todayKey()): UsageToday {
  try {
    const row = getSqlite()
      .prepare('SELECT prompt_tokens, completion_tokens, requests FROM ai_usage WHERE day = ?')
      .get(day) as { prompt_tokens: number; completion_tokens: number; requests: number } | undefined
    if (!row) return { ...ZERO }
    const promptTokens = count(row.prompt_tokens)
    const completionTokens = count(row.completion_tokens)
    return {
      promptTokens,
      completionTokens,
      requests: count(row.requests),
      total: promptTokens + completionTokens,
    }
  } catch {
    return { ...ZERO }
  }
}

/** Add one call's usage to the day's totals. */
export function recordUsage(
  usage: { promptTokens?: number; completionTokens?: number },
  day = todayKey(),
): void {
  const promptTokens = count(usage?.promptTokens)
  const completionTokens = count(usage?.completionTokens)
  try {
    getSqlite().prepare(`
      INSERT INTO ai_usage (day, prompt_tokens, completion_tokens, requests)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(day) DO UPDATE SET
        prompt_tokens = prompt_tokens + excluded.prompt_tokens,
        completion_tokens = completion_tokens + excluded.completion_tokens,
        requests = requests + 1
    `).run(day, promptTokens, completionTokens)
  } catch {
    // Accounting is best effort: losing a counter must not lose the answer.
  }
}

/** `limit <= 0` means the owner set no cap. Both sides of a call count. */
export function withinBudget(limit: number, day = todayKey()): boolean {
  if (!(limit > 0)) return true
  return getUsageToday(day).total <= limit
}

/** What the settings screen and the phone's usage bar render. */
export function todaySnapshot(limit: number): UsageSnapshot {
  const usage = getUsageToday()
  return {
    ...usage,
    limit,
    // Unlimited: there is nothing to subtract from, so "remaining" has no meaning.
    remaining: limit > 0 ? Math.max(0, limit - usage.total) : null,
  }
}
