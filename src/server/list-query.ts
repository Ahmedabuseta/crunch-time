// One query contract for every list route: search, filters, an allow-listed
// sort, and paging. Kept in one place so the lists cannot drift apart in what
// `page` or an unknown `sort` key means.
import type { FastifyRequest } from 'fastify'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 200

export interface ListQuery {
  page: number
  pageSize: number
  offset: number
  search: string
  sort: string
  dir: 'asc' | 'desc'
  /** Every raw query string, for the resource-specific filters. */
  raw: Record<string, unknown>
}

export interface ListQuerySpec {
  /** The sort keys this resource accepts. A client sends one of these names and
   * the route maps it to a column, so a client-supplied string never reaches
   * SQL — that is the whole point of the allow-list. */
  sortable: readonly string[]
  defaultSort: string
  /** Dates and money read best newest/biggest first; names read best A→Z. */
  defaultDir?: 'asc' | 'desc'
  defaultPageSize?: number
}

const text = (value: unknown): string =>
  value === undefined || value === null ? '' : String(value)

const whole = (value: unknown): number | null => {
  const parsed = Number(text(value))
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

export function readListQuery(req: FastifyRequest, spec: ListQuerySpec): ListQuery {
  const raw = ((req.query || {}) as Record<string, unknown>)

  // An unrecognised key falls back to the default rather than failing, so an
  // older app version asking for a sort we removed keeps working.
  const requested = text(raw.sort)
  const sort = spec.sortable.includes(requested) ? requested : spec.defaultSort

  const requestedDir = text(raw.dir).toLowerCase()
  const dir: 'asc' | 'desc' =
    requestedDir === 'asc' || requestedDir === 'desc' ? requestedDir : (spec.defaultDir ?? 'desc')

  const page = Math.max(1, whole(raw.page) ?? 1)
  const asked = whole(raw.pageSize) ?? spec.defaultPageSize ?? DEFAULT_PAGE_SIZE
  const pageSize = Math.min(Math.max(asked, 1), MAX_PAGE_SIZE)

  return { page, pageSize, offset: (page - 1) * pageSize, search: text(raw.search), sort, dir, raw }
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/** What a route spreads next to its own key, so `{ orders: [...] }` becomes
 * `{ orders: [...], total, page, pageSize, hasMore }` and every existing caller
 * that ignores the extras keeps working. */
export function pageMeta(query: ListQuery, total: number): Omit<Paged<never>, 'items'> {
  return {
    total,
    page: query.page,
    pageSize: query.pageSize,
    // There is more only if the window we just took does not reach the end.
    hasMore: query.offset + query.pageSize < total,
  }
}

/** A resource-specific filter, or undefined when it was not asked for. */
export const filter = (query: ListQuery, key: string): string | undefined => {
  const value = text(query.raw[key]).trim()
  return value === '' ? undefined : value
}

/** A boolean filter (`?low=1`). */
export const flag = (query: ListQuery, key: string): boolean => {
  const value = text(query.raw[key]).toLowerCase()
  return value === '1' || value === 'true'
}
