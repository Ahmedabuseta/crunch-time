// Analytics — the semantic layer under «اسألني أي حاجة».
//
// The assistant never writes SQL. A question is reduced to a closed vocabulary
// here — one metric, one dimension, a date window and a handful of filters —
// and every member of that vocabulary maps to a fixed SQL fragment in this
// file. Values (names, ids, dates, statuses) are always bound parameters and
// identifiers only ever come from the whitelists below, so neither a model nor
// a customer name with a quote in it can change the shape of a query.
//
// Money is rounded to two decimals and percentages to one; the result carries
// numbers only, never pre-formatted strings.
import { getSqlite } from '../db/client'
import { requireAdmin } from './session'
import { r2 } from './shared'

export type Metric =
  | 'revenue'
  | 'orders'
  | 'avg_ticket'
  | 'discounts'
  | 'delivery_fees'
  | 'items_sold'
  | 'cost'
  | 'gross_profit'
  | 'margin'

export type Dimension =
  | 'day'
  | 'week'
  | 'month'
  | 'category'
  | 'product'
  | 'cashier'
  | 'order_type'
  | 'payment'

export interface QueryMetricsInput {
  metric: Metric
  dimension?: Dimension
  from?: string
  to?: string
  filters?: {
    category?: string
    product?: string
    cashier?: string
    orderType?: string
    payment?: string
    status?: string
  }
  compare?: 'previous_period'
  limit?: number
}

export interface QueryMetricsResult {
  metric: Metric
  dimension: Dimension | null
  from: string
  to: string
  total: number
  previousTotal?: number
  changePct?: number
  rows: { key: string; label: string; value: number; orders?: number }[]
  rowCount: number
}

// ─── Whitelists ────────────────────────────────────────────────
//
// Everything that reaches the SQL text comes from these constants. A caller
// that sends something else gets a clear error, never a query.

const METRICS: readonly Metric[] = [
  'revenue', 'orders', 'avg_ticket', 'discounts', 'delivery_fees',
  'items_sold', 'cost', 'gross_profit', 'margin',
]

const DIMENSIONS: readonly Dimension[] = [
  'day', 'week', 'month', 'category', 'product', 'cashier', 'order_type', 'payment',
]

/** The two dimensions that have to be aggregated from order items. */
const ITEM_DIMENSIONS: readonly Dimension[] = ['category', 'product']

/** `orders.status` values a caller is allowed to ask for explicitly. */
const STATUSES = ['COMPLETED', 'REFUNDED', 'CANCELLED'] as const

/** Arabic / English spellings a question may use for an order type. */
const ORDER_TYPE_ALIASES: Record<string, string> = {
  delivery: 'delivery',
  'دليفري': 'delivery',
  'ديلفري': 'delivery',
  'توصيل': 'delivery',
  'توصيل خارجي': 'delivery',
  'dine-in': 'dine-in',
  dinein: 'dine-in',
  'dine in': 'dine-in',
  'صالة': 'dine-in',
  'الصالة': 'dine-in',
  'محلي': 'dine-in',
  'في المكان': 'dine-in',
  'تناول في المكان': 'dine-in',
  takeaway: 'takeaway',
  'take-away': 'takeaway',
  takeout: 'takeaway',
  'take out': 'takeaway',
  'سفري': 'takeaway',
  'تيك أواي': 'takeaway',
  'خارجي': 'takeaway',
}

/** `orders.payment_type` values each payment word may mean. */
const PAYMENT_ALIASES: Record<string, string[]> = {
  cash: ['cash'],
  'كاش': ['cash'],
  'نقدي': ['cash'],
  'نقداً': ['cash'],
  'نقدا': ['cash'],
  visa: ['visa', 'card'],
  'فيزا': ['visa', 'card'],
  card: ['visa', 'card'],
  'كارت': ['visa', 'card'],
  'بطاقة': ['visa', 'card'],
  'فيزا/كارت': ['visa', 'card'],
  wallet: ['wallet'],
  'محفظة': ['wallet'],
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: 'توصيل',
  'dine-in': 'صالة',
  takeaway: 'سفري',
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'كاش',
  visa: 'فيزا',
  card: 'كارت',
  wallet: 'محفظة',
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/** Upper bound for an inclusive day: any timestamp inside `to` sorts below it. */
const DAY_END = '\uffff'

// ─── Dates ─────────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

const pad2 = (value: number) => (value < 10 ? `0${value}` : String(value))

/** Today as a local calendar date — the day the owner means by «النهاردة». */
function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** Validates `YYYY-MM-DD` and that the day actually exists (2024-02-30 does not). */
function parseDay(value: unknown, field: string): string {
  const text = String(value ?? '').trim()
  if (!DAY_RE.test(text)) {
    throw new Error(`${field} لازم يكون تاريخ بصيغة YYYY-MM-DD (جالك «${text}»)`)
  }
  const [year, month, day] = text.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new Error(`${field} مش تاريخ حقيقي في التقويم (جالك «${text}»)`)
  }
  return text
}

function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, date + delta))
  return shifted.toISOString().slice(0, 10)
}

/** Inclusive number of calendar days between two validated days. */
function dayCount(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1)
}

// ─── Input normalization ───────────────────────────────────────

const text = (value: unknown) => String(value ?? '').trim()

function readMetric(value: unknown): Metric {
  const candidate = text(value) as Metric
  if (!METRICS.includes(candidate)) {
    throw new Error(`مقياس غير معروف «${text(value)}». المتاح: ${METRICS.join(', ')}`)
  }
  return candidate
}

function readDimension(value: unknown): Dimension | null {
  if (value === undefined || value === null || text(value) === '') return null
  const candidate = text(value) as Dimension
  if (!DIMENSIONS.includes(candidate)) {
    throw new Error(`تجميع غير معروف «${text(value)}». المتاح: ${DIMENSIONS.join(', ')}`)
  }
  return candidate
}

function readLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsed)))
}

/** LIKE pattern with the wildcards a name may contain escaped. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

function mapOrderType(value: string): string {
  const key = value.toLowerCase().replace(/\s+/g, ' ').trim()
  const mapped = ORDER_TYPE_ALIASES[key]
  if (!mapped) {
    throw new Error(`نوع طلب غير معروف «${value}». المتاح: delivery / dine-in / takeaway`)
  }
  return mapped
}

// ─── Filters → bound SQL fragments ─────────────────────────────

type Filters = NonNullable<QueryMetricsInput['filters']>

interface SqlFilter {
  sql: string
  params: any[]
}

/**
 * One fragment per requested filter. Each is a constant SQL string plus bound
 * parameters — no caller value is ever concatenated into the statement.
 *
 * Category and product are the one pair whose meaning depends on the level: an
 * item-level report narrows the *lines* it aggregates, while an order-level
 * report keeps the orders that contain such a line.
 */
function buildFilters(filters: Filters | undefined, level: Level): SqlFilter[] {
  const out: SqlFilter[] = []

  const status = text(filters?.status).toUpperCase()
  if (status) {
    if (!(STATUSES as readonly string[]).includes(status)) {
      throw new Error(`حالة غير معروفة «${filters?.status}». المتاح: ${STATUSES.join(' / ')}`)
    }
    out.push({ sql: 'o.status = ?', params: [status] })
  } else {
    // A cancelled sale is not a sale: excluded unless it was asked for by name.
    out.push({ sql: "o.status <> 'CANCELLED'", params: [] })
  }

  const cashier = text(filters?.cashier)
  if (cashier) {
    out.push({ sql: "o.cashier_name LIKE ? ESCAPE '\\'", params: [likePattern(cashier)] })
  }

  const orderType = text(filters?.orderType)
  if (orderType) {
    out.push({ sql: 'o.order_type = ?', params: [mapOrderType(orderType)] })
  }

  const payment = text(filters?.payment)
  if (payment) {
    const methods = PAYMENT_ALIASES[payment.toLowerCase()] ?? null
    if (!methods) {
      throw new Error(`طريقة دفع غير معروفة «${payment}». المتاح: cash / visa / card / wallet`)
    }
    out.push({
      sql: `o.payment_type IN (${methods.map(() => '?').join(', ')})`,
      params: [...methods],
    })
  }

  const category = text(filters?.category)
  if (category) {
    out.push(level === 'item'
      ? {
        sql: `(c.id = ? COLLATE NOCASE OR c.name = ? COLLATE NOCASE OR c.name LIKE ? ESCAPE '\\')`,
        params: [category, category, likePattern(category)],
      }
      : {
        sql: `EXISTS (
          SELECT 1 FROM order_items xoi
          JOIN products xp ON xp.id = xoi.product_id
          JOIN categories xc ON xc.id = xp.category_id
          WHERE xoi.order_id = o.id
            AND (xc.id = ? COLLATE NOCASE OR xc.name = ? COLLATE NOCASE OR xc.name LIKE ? ESCAPE '\\')
        )`,
        params: [category, category, likePattern(category)],
      })
  }

  const product = text(filters?.product)
  if (product) {
    out.push(level === 'item'
      ? {
        sql: `(p.id = ? COLLATE NOCASE OR p.name = ? COLLATE NOCASE OR p.name LIKE ? ESCAPE '\\')`,
        params: [product, product, likePattern(product)],
      }
      : {
        sql: `EXISTS (
          SELECT 1 FROM order_items xoi
          JOIN products xp ON xp.id = xoi.product_id
          WHERE xoi.order_id = o.id
            AND (xp.id = ? COLLATE NOCASE OR xp.name = ? COLLATE NOCASE OR xp.name LIKE ? ESCAPE '\\')
        )`,
        params: [product, product, likePattern(product)],
      })
  }

  return out
}

// ─── Aggregation ───────────────────────────────────────────────

type Level = 'order' | 'item'

interface GroupSql {
  key: string
  label: string
}

interface AggregateRow {
  grp_key?: unknown
  grp_label?: unknown
  revenue?: number
  order_count?: number
  discounts?: number
  delivery_fees?: number
  items_sold?: number
  cost_total?: number
}

function levelFor(dimension: Dimension | null): Level {
  return dimension && ITEM_DIMENSIONS.includes(dimension) ? 'item' : 'order'
}

function fromClause(level: Level): string {
  return level === 'item'
    ? `FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id`
    : 'FROM orders o'
}

/**
 * Every aggregate is aliased to the same name on both levels, so the metric
 * math below is a single switch rather than two parallel ones.
 *
 * At item level, revenue is the line's net (quantity × unit price − line
 * discount) and cost is quantity × the product's cost price. Order-level
 * discounts and delivery fees have no honest per-product allocation, so they
 * report 0 there instead of being invented.
 */
function aggregateColumns(level: Level, metric: Metric): string {
  if (level === 'item') {
    return `COALESCE(SUM(oi.quantity * oi.unit_price - COALESCE(oi.item_discount, 0)), 0) AS revenue,
      COUNT(DISTINCT o.id) AS order_count,
      0 AS discounts,
      0 AS delivery_fees,
      COALESCE(SUM(oi.quantity), 0) AS items_sold,
      COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) AS cost_total`
  }

  const needsUnits = metric === 'items_sold' || metric === 'cost' || metric === 'gross_profit' || metric === 'margin'
  const needsCost = metric === 'cost' || metric === 'gross_profit' || metric === 'margin'
  const units = needsUnits
    ? 'COALESCE(SUM((SELECT SUM(x.quantity) FROM order_items x WHERE x.order_id = o.id)), 0)'
    : '0'
  const cost = needsCost
    ? `COALESCE(SUM((
        SELECT SUM(x.quantity * COALESCE(xp.cost_price, 0))
        FROM order_items x
        LEFT JOIN products xp ON xp.id = x.product_id
        WHERE x.order_id = o.id
      )), 0)`
    : '0'

  return `COALESCE(SUM(o.total), 0) AS revenue,
    COUNT(DISTINCT o.id) AS order_count,
    COALESCE(SUM(o.discount_amount), 0) AS discounts,
    COALESCE(SUM(o.delivery_fee), 0) AS delivery_fees,
    ${units} AS items_sold,
    ${cost} AS cost_total`
}

/** The GROUP BY expression for a dimension. All identifier text is constant. */
function groupSql(dimension: Dimension): GroupSql {
  switch (dimension) {
    case 'day':
      return { key: 'substr(o.created_at, 1, 10)', label: 'substr(o.created_at, 1, 10)' }
    case 'week':
      return {
        key: "strftime('%Y-W%W', substr(o.created_at, 1, 10))",
        label: "strftime('%Y-W%W', substr(o.created_at, 1, 10))",
      }
    case 'month':
      return { key: 'substr(o.created_at, 1, 7)', label: 'substr(o.created_at, 1, 7)' }
    case 'cashier': {
      const expr = "COALESCE(NULLIF(TRIM(o.cashier_name), ''), 'غير محدد')"
      return { key: expr, label: expr }
    }
    case 'order_type':
      return { key: 'o.order_type', label: 'o.order_type' }
    case 'payment':
      return { key: 'o.payment_type', label: 'o.payment_type' }
    case 'category':
      return { key: 'c.id', label: 'COALESCE(c.name, c.id)' }
    case 'product':
      return { key: 'p.id', label: 'p.name' }
  }
}

function labelFor(dimension: Dimension, key: string, sqlLabel: unknown): string {
  const label = text(sqlLabel) || key
  if (dimension === 'order_type') return ORDER_TYPE_LABELS[key] ?? label
  if (dimension === 'payment') return PAYMENT_LABELS[key] ?? label
  return label
}

function metricValue(metric: Metric, row: AggregateRow): number {
  const revenue = Number(row.revenue) || 0
  const cost = Number(row.cost_total) || 0
  const orders = Number(row.order_count) || 0
  switch (metric) {
    case 'revenue':
      return revenue
    case 'orders':
      return orders
    // Item-level average ticket = line revenue ÷ the orders those lines came
    // from. Documented on purpose: it is a product's share of the ticket, not
    // an independently computed basket size.
    case 'avg_ticket':
      return orders > 0 ? revenue / orders : 0
    case 'discounts':
      return Number(row.discounts) || 0
    case 'delivery_fees':
      return Number(row.delivery_fees) || 0
    case 'items_sold':
      return Number(row.items_sold) || 0
    case 'cost':
      return cost
    case 'gross_profit':
      return revenue - cost
    case 'margin':
      return revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0
  }
}

const round1 = (value: number) => Math.round(value * 10) / 10

function roundMetric(metric: Metric, value: number): number {
  if (!Number.isFinite(value)) return 0
  return metric === 'margin' ? round1(value) : r2(value)
}

// ─── Public entry point ────────────────────────────────────────

/**
 * Answers one analytics question. Read-only, admin-only, and safe to hand a
 * model: the input names a metric and a dimension, it never carries SQL.
 */
export function queryMetrics(input: QueryMetricsInput): QueryMetricsResult {
  requireAdmin()

  const raw = (input ?? {}) as QueryMetricsInput
  const metric = readMetric(raw.metric)
  const dimension = readDimension(raw.dimension)

  if (raw.compare !== undefined && raw.compare !== 'previous_period') {
    throw new Error(`مقارنة غير معروفة «${text(raw.compare)}». المتاح: previous_period`)
  }

  const today = localToday()
  const from = raw.from === undefined || raw.from === null || text(raw.from) === ''
    ? today
    : parseDay(raw.from, 'from')
  const to = raw.to === undefined || raw.to === null || text(raw.to) === ''
    ? today
    : parseDay(raw.to, 'to')
  if (from > to) {
    throw new Error(`بداية المدة (${from}) بعد نهايتها (${to})`)
  }

  const limit = readLimit(raw.limit)
  const level = levelFor(dimension)
  const filters = buildFilters(raw.filters, level)
  const between: SqlFilter = { sql: 'o.created_at >= ? AND o.created_at <= ?', params: [from, `${to}${DAY_END}`] }
  const where = [between, ...filters]

  const sqlite = getSqlite()

  const group = dimension ? groupSql(dimension) : null
  const rowsSql = group
    ? `SELECT ${group.key} AS grp_key, ${group.label} AS grp_label, ${aggregateColumns(level, metric)}
       ${fromClause(level)}
       WHERE ${where.map((part) => part.sql).join(' AND ')}
       GROUP BY 1, 2`
    : null
  const totalSql = `SELECT ${aggregateColumns(level, metric)}
    ${fromClause(level)}
    WHERE ${where.map((part) => part.sql).join(' AND ')}`

  const totalParams = where.flatMap((part) => part.params)
  const totalRow = (sqlite.prepare(totalSql).get(...totalParams) ?? {}) as AggregateRow
  const total = roundMetric(metric, metricValue(metric, totalRow))

  const groups = rowsSql
    ? (sqlite.prepare(rowsSql).all(...totalParams) as AggregateRow[])
    : []

  // Sorted in JS so `avg_ticket` and `margin` order by the number the caller
  // sees, not by the underlying sum, and so a tie falls back to the label.
  const ordered = groups
    .map((row) => {
      const key = text(row.grp_key)
      return {
        key,
        label: dimension ? labelFor(dimension, key, row.grp_label) : key,
        value: roundMetric(metric, metricValue(metric, row)),
        orders: Math.round(Number(row.order_count) || 0),
      }
    })
    .sort((a, b) => b.value - a.value || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))

  const result: QueryMetricsResult = {
    metric,
    dimension,
    from,
    to,
    total,
    rows: ordered.slice(0, limit),
    rowCount: ordered.length,
  }

  if (raw.compare === 'previous_period') {
    // The window immediately before this one, same number of calendar days.
    const span = dayCount(from, to)
    const previousWhere: SqlFilter[] = [
      { sql: 'o.created_at >= ? AND o.created_at <= ?', params: [addDays(from, -span), `${addDays(from, -1)}${DAY_END}`] },
      ...filters,
    ]
    // No dimension: one scalar, aggregated at the same level as the rows above
    // so the two numbers are comparable.
    const previousSql = `SELECT ${aggregateColumns(level, metric)}
      ${fromClause(level)}
      WHERE ${previousWhere.map((part) => part.sql).join(' AND ')}`
    const previousRow = (sqlite.prepare(previousSql).get(...previousWhere.flatMap((part) => part.params)) ?? {}) as AggregateRow
    const previousTotal = roundMetric(metric, metricValue(metric, previousRow))
    result.previousTotal = previousTotal
    result.changePct = previousTotal === 0
      ? 0
      : round1(((total - previousTotal) / Math.abs(previousTotal)) * 100)
  }

  return result
}
