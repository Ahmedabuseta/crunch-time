// Calendar days for every report.
//
// Orders are stored as UTC ISO timestamps (`shared.now()`), but the shop's day
// is the machine's local day: an order placed at 00:30 in Cairo is stored as
// 22:30Z on the *previous* date, and it still belongs to today's report. Every
// filter therefore compares against local-midnight bounds instead of slicing
// strings, which also keeps hour buckets, weekday averages and the inventory
// ledger on the same day boundaries.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/

function parts(date: string): { y: number; m: number; d: number } | null {
  const match = DATE_RE.exec(String(date || ''))
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

/** UTC instant of local midnight for a `YYYY-MM-DD` date. */
export function localDayStart(date: string): string {
  const p = parts(date)
  if (!p) return date
  return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0).toISOString()
}

/** UTC instant of the next local midnight — the exclusive end of `date`. */
export function localDayEnd(date: string): string {
  const p = parts(date)
  if (!p) return date
  return new Date(p.y, p.m - 1, p.d + 1, 0, 0, 0, 0).toISOString()
}

/** Half-open `[start, end)` UTC bounds for a local date range. */
export function localRangeBounds(from?: string, to?: string): { start: string | null; end: string | null } {
  return {
    start: from ? localDayStart(from) : null,
    end: to ? localDayEnd(to) : null,
  }
}

/** True when a stored UTC timestamp falls inside the local `[from, to]` days. */
export function inLocalDayRange(iso: string | null | undefined, from?: string, to?: string): boolean {
  if (!iso) return false
  if (from && iso < localDayStart(from)) return false
  if (to && iso >= localDayEnd(to)) return false
  return true
}

/** The local `YYYY-MM-DD` an instant belongs to. */
export function localDateOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Today's local date. */
export function localToday(): string {
  return localDateOf(new Date().toISOString())
}

/** The local date `days` days before `from` (default: today). */
export function localDaysBefore(days: number, from: string = localToday()): string {
  const p = parts(from)
  if (!p) return from
  return localDateOf(new Date(p.y, p.m - 1, p.d - days, 12, 0, 0, 0).toISOString())
}

/** Every local date from `from` to `to`, inclusive — oldest first. */
export function localDatesBetween(from: string, to: string): string[] {
  const start = parts(from)
  const end = parts(to)
  if (!start || !end) return []
  const dates: string[] = []
  // Noon avoids a DST jump turning midnight into the previous day.
  for (let d = new Date(start.y, start.m - 1, start.d, 12); ; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    dates.push(value)
    if (value >= to || dates.length > 4000) break
  }
  return dates
}
