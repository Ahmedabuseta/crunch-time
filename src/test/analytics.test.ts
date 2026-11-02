// The analytics layer the assistant answers owner questions from.
//
// Everything here runs against a real migrated database in a temp directory:
// seeded products, a handful of hand-written orders with known totals, and then
// the same questions the phone would ask — a headline number, a breakdown by
// product/category/day, a period comparison, and a hostile filter string that
// must stay a bound parameter.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'analytics-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { setUser } = await import('../backend/session')
const { queryMetrics } = await import('../backend/analytics')
const { ANALYTICS_TOOLS } = await import('../ai/tools/analytics')
const { ToolOutputSchema } = await import('../ai/schemas')

// ─── Fixtures ──────────────────────────────────────────────────
//
// Three seeded products with pinned cost prices, and six orders across three
// days. The numbers are small on purpose: every expectation below is summed by
// hand from the fixture, not from the implementation.
const DAY_1 = '2024-03-10'
const DAY_2 = '2024-03-11'
const DAY_BEFORE = '2024-03-09'

const KOFTA = 'm5'      // كفته — 95 · قسم كريب لحوم
const SAUSAGE = 'sy5'   // سوري بانيه — 70 · قسم السوري
const BURGER = 'm7'     // برجر — 170 · قسم كريب لحوم

const KOFTA_COST = 40
const SAUSAGE_COST = 20
const BURGER_COST = 90

interface OrderSeed {
  id: string
  day: string
  status?: string
  orderType?: string
  payment?: string
  cashier?: string
  total: number
  discount?: number
  deliveryFee?: number
  items: { productId: string; quantity: number; unitPrice: number; discount?: number }[]
}

function insertOrder(seed: OrderSeed) {
  const createdAt = `${seed.day}T12:00:00.000Z`
  getSqlite().prepare(`
    INSERT INTO orders (id, status, order_type, subtotal, tax, delivery_fee, discount_amount, total, payment_type, cashier_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    seed.id,
    seed.status ?? 'COMPLETED',
    seed.orderType ?? 'takeaway',
    seed.total,
    seed.deliveryFee ?? 0,
    seed.discount ?? 0,
    seed.total,
    seed.payment ?? 'cash',
    seed.cashier ?? 'أحمد',
    createdAt,
    createdAt,
  )
  seed.items.forEach((item, index) => {
    getSqlite().prepare(`
      INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, item_discount)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`${seed.id}-i${index}`, seed.id, item.productId, item.quantity, item.unitPrice, item.discount ?? 0)
  })
}

const toolContext = () => ({ turnId: 'test-turn', cards: [] as any[], now: new Date() })

const analyticsTool = () => {
  const tool = ANALYTICS_TOOLS.find((entry) => entry.name === 'query_metrics')
  if (!tool) throw new Error('missing query_metrics tool')
  return tool
}

beforeAll(async () => {
  runMigrations()
  await seedDatabase()

  // The seed leaves cost_price at 0 (the owner prices the menu in), so the
  // margin assertions pin the three products they use.
  const setCost = getSqlite().prepare('UPDATE products SET cost_price = ? WHERE id = ?')
  setCost.run(KOFTA_COST, KOFTA)
  setCost.run(SAUSAGE_COST, SAUSAGE)
  setCost.run(BURGER_COST, BURGER)

  // Day 1 — two completed orders (one delivery with a fee) plus a cancelled one.
  insertOrder({
    id: 'a1', day: DAY_1, total: 260,
    items: [{ productId: KOFTA, quantity: 2, unitPrice: 95 }, { productId: SAUSAGE, quantity: 1, unitPrice: 70 }],
  })
  insertOrder({
    id: 'a2', day: DAY_1, orderType: 'delivery', payment: 'visa', cashier: 'محمد', total: 115, deliveryFee: 25,
    items: [{ productId: KOFTA, quantity: 1, unitPrice: 95, discount: 5 }],
  })
  insertOrder({
    id: 'a3', day: DAY_1, status: 'CANCELLED', orderType: 'dine-in', total: 170,
    items: [{ productId: BURGER, quantity: 1, unitPrice: 170 }],
  })

  // Day 2 — a discounted order and a refunded one (refunds stay in revenue).
  insertOrder({
    id: 'b1', day: DAY_2, total: 190, discount: 20,
    items: [{ productId: SAUSAGE, quantity: 3, unitPrice: 70 }],
  })
  insertOrder({
    id: 'b2', day: DAY_2, status: 'REFUNDED', orderType: 'dine-in', cashier: 'محمد', total: 170,
    items: [{ productId: BURGER, quantity: 1, unitPrice: 170 }],
  })

  // The day before the window, for the previous-period comparison.
  insertOrder({
    id: 'p1', day: DAY_BEFORE, total: 95,
    items: [{ productId: KOFTA, quantity: 1, unitPrice: 95 }],
  })

  setUser({ id: 'test-admin', role: 'admin' })
})

afterAll(() => {
  setUser(null)
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

// ─── Headline numbers ──────────────────────────────────────────

describe('totals', () => {
  it('sums revenue for one day and leaves cancelled orders out', () => {
    const result = queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_1 })
    // 260 + 115; the 170 cancelled order is not revenue.
    expect(result.total).toBe(375)
    expect(result.metric).toBe('revenue')
    expect(result.dimension).toBeNull()
    expect(result.rows).toEqual([])
    expect(result.rowCount).toBe(0)
    expect(result.from).toBe(DAY_1)
    expect(result.to).toBe(DAY_1)
  })

  it('counts orders and averages the ticket', () => {
    expect(queryMetrics({ metric: 'orders', from: DAY_1, to: DAY_1 }).total).toBe(2)
    expect(queryMetrics({ metric: 'avg_ticket', from: DAY_1, to: DAY_1 }).total).toBe(187.5)
    expect(queryMetrics({ metric: 'orders', from: DAY_1, to: DAY_2 }).total).toBe(4)
  })

  it('adds up a known range', () => {
    // 375 (day 1) + 190 (b1) + 170 (refunded b2, still a completed sale).
    expect(queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2 }).total).toBe(735)
    expect(queryMetrics({ metric: 'discounts', from: DAY_1, to: DAY_2 }).total).toBe(20)
    expect(queryMetrics({ metric: 'delivery_fees', from: DAY_1, to: DAY_2 }).total).toBe(25)
    expect(queryMetrics({ metric: 'items_sold', from: DAY_1, to: DAY_2 }).total).toBe(8)
  })

  it('computes cost, gross profit and margin from product cost prices', () => {
    // Cost: 3 كفته × 40 + 4 سوري × 20 + 1 برجر × 90 = 120 + 80 + 90.
    expect(queryMetrics({ metric: 'cost', from: DAY_1, to: DAY_2 }).total).toBe(290)
    expect(queryMetrics({ metric: 'gross_profit', from: DAY_1, to: DAY_2 }).total).toBe(445)
    expect(queryMetrics({ metric: 'margin', from: DAY_1, to: DAY_2 }).total).toBe(60.5)
  })

  it('returns only when a status is asked for by name', () => {
    const cancelled = queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_1, filters: { status: 'CANCELLED' } })
    expect(cancelled.total).toBe(170)
    expect(queryMetrics({ metric: 'orders', from: DAY_1, to: DAY_1, filters: { status: 'COMPLETED' } }).total).toBe(2)
  })

  it('defaults the window to today', () => {
    const result = queryMetrics({ metric: 'revenue' })
    expect(result.from).toBe(result.to)
    expect(result.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ─── Item-level dimensions ─────────────────────────────────────

describe('product and category dimensions', () => {
  it('breaks revenue down by product with real names', () => {
    const result = queryMetrics({ metric: 'revenue', dimension: 'product', from: DAY_1, to: DAY_2 })
    expect(result.dimension).toBe('product')
    expect(result.rowCount).toBe(3)
    expect(result.rows).toHaveLength(3)

    const byLabel = new Map(result.rows.map((row) => [row.label, row]))
    expect(byLabel.get('كفته')?.value).toBe(280)
    expect(byLabel.get('سوري بانيه')?.value).toBe(280)
    expect(byLabel.get('برجر')?.value).toBe(170)
    expect(byLabel.get('كفته')?.orders).toBe(2)

    const sum = result.rows.reduce((total, row) => total + row.value, 0)
    expect(sum).toBeCloseTo(result.total, 2)
    expect(result.total).toBe(730)

    const values = result.rows.map((row) => row.value)
    expect([...values].sort((a, b) => b - a)).toEqual(values)

    // Everything is a number — formatting is the phone's job, not the layer's.
    for (const row of result.rows) {
      expect(typeof row.value).toBe('number')
      expect(typeof row.orders).toBe('number')
      expect(typeof row.key).toBe('string')
    }
  })

  it('measures items, cost and margin per product', () => {
    const units = queryMetrics({ metric: 'items_sold', dimension: 'product', from: DAY_1, to: DAY_2 })
    const unitsByLabel = new Map(units.rows.map((row) => [row.label, row.value]))
    expect(unitsByLabel.get('كفته')).toBe(3)
    expect(unitsByLabel.get('سوري بانيه')).toBe(4)
    expect(unitsByLabel.get('برجر')).toBe(1)

    const cost = queryMetrics({ metric: 'cost', dimension: 'product', from: DAY_1, to: DAY_2 })
    expect(cost.total).toBe(290)

    const profit = queryMetrics({ metric: 'gross_profit', dimension: 'product', from: DAY_1, to: DAY_2 })
    expect(profit.total).toBe(440) // 730 item revenue − 290 item cost
  })

  it('takes the item-level average ticket as line revenue over distinct orders', () => {
    const result = queryMetrics({ metric: 'avg_ticket', dimension: 'product', from: DAY_1, to: DAY_2 })
    const byLabel = new Map(result.rows.map((row) => [row.label, row]))
    expect(byLabel.get('كفته')?.value).toBe(140) // 280 over two orders
    expect(byLabel.get('برجر')?.value).toBe(170) // 170 over one order
    expect(result.total).toBe(182.5) // 730 over four orders
  })

  it('groups by category', () => {
    const result = queryMetrics({ metric: 'revenue', dimension: 'category', from: DAY_1, to: DAY_2 })
    const byLabel = new Map(result.rows.map((row) => [row.label, row.value]))
    expect(byLabel.get('كريب لحوم')).toBe(450) // كفته 280 + برجر 170
    expect(byLabel.get('السوري')).toBe(280)
    expect(result.total).toBe(730)
  })

  it('never invents a per-product allocation for order-level money', () => {
    const result = queryMetrics({ metric: 'discounts', dimension: 'product', from: DAY_1, to: DAY_2 })
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows.every((row) => row.value === 0)).toBe(true)
    expect(result.total).toBe(0)
  })

  it('filters by category name and by category id', () => {
    const byName = queryMetrics({
      metric: 'revenue', dimension: 'product', from: DAY_1, to: DAY_2, filters: { category: 'كريب لحوم' },
    })
    expect(byName.total).toBe(450)
    expect(byName.rows.map((row) => row.label).sort()).toEqual(['برجر', 'كفته'])

    const byId = queryMetrics({
      metric: 'revenue', dimension: 'category', from: DAY_1, to: DAY_2, filters: { category: 'syrian' },
    })
    expect(byId.total).toBe(280)
    expect(byId.rows).toHaveLength(1)
    expect(byId.rows[0].label).toBe('السوري')
  })

  it('filters by product name and by product id', () => {
    const byName = queryMetrics({
      metric: 'revenue', dimension: 'category', from: DAY_1, to: DAY_2, filters: { product: 'كفته' },
    })
    expect(byName.total).toBe(280)
    expect(byName.rows.map((row) => row.label)).toEqual(['كريب لحوم'])

    const byId = queryMetrics({
      metric: 'orders', dimension: 'product', from: DAY_1, to: DAY_2, filters: { product: 'm5' },
    })
    expect(byId.rows).toHaveLength(1)
    expect(byId.rows[0].label).toBe('كفته')
    expect(byId.rows[0].value).toBe(2)

    // Without a dimension the filter keeps whole orders that contain the
    // product, so the order total (delivery fee included) is what is summed.
    const wholeOrders = queryMetrics({
      metric: 'revenue', from: DAY_1, to: DAY_1, filters: { product: 'كفته' },
    })
    expect(wholeOrders.total).toBe(375)
  })
})

// ─── Order-level dimensions ────────────────────────────────────

describe('order-level dimensions', () => {
  it('orders days by value, newest data first', () => {
    const result = queryMetrics({ metric: 'revenue', dimension: 'day', from: DAY_1, to: DAY_2 })
    expect(result.rows.map((row) => row.key)).toEqual([DAY_1, DAY_2])
    expect(result.rows.map((row) => row.value)).toEqual([375, 360])
    expect(result.rowCount).toBe(2)
  })

  it('applies the limit after counting every group', () => {
    const result = queryMetrics({ metric: 'revenue', dimension: 'day', from: DAY_1, to: DAY_2, limit: 1 })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].key).toBe(DAY_1)
    expect(result.rowCount).toBe(2)
  })

  it('translates order types and payment methods to Arabic labels', () => {
    const types = queryMetrics({ metric: 'revenue', dimension: 'order_type', from: DAY_1, to: DAY_2 })
    const byType = new Map(types.rows.map((row) => [row.label, row.value]))
    expect(byType.get('سفري')).toBe(450)
    expect(byType.get('صالة')).toBe(170)
    expect(byType.get('توصيل')).toBe(115)

    const payments = queryMetrics({ metric: 'revenue', dimension: 'payment', from: DAY_1, to: DAY_2 })
    const byPayment = new Map(payments.rows.map((row) => [row.label, row.value]))
    expect(byPayment.get('كاش')).toBe(620)
    expect(byPayment.get('فيزا')).toBe(115)
  })

  it('groups by cashier and by month', () => {
    const cashiers = queryMetrics({ metric: 'revenue', dimension: 'cashier', from: DAY_1, to: DAY_2 })
    const byCashier = new Map(cashiers.rows.map((row) => [row.label, row.value]))
    expect(byCashier.get('أحمد')).toBe(450)
    expect(byCashier.get('محمد')).toBe(285)

    const months = queryMetrics({ metric: 'revenue', dimension: 'month', from: DAY_1, to: DAY_2 })
    expect(months.rows).toHaveLength(1)
    expect(months.rows[0].key).toBe('2024-03')
    expect(months.rows[0].value).toBe(735)
  })

  it('groups by ISO-style week', () => {
    const weeks = queryMetrics({ metric: 'revenue', dimension: 'week', from: DAY_1, to: DAY_2 })
    expect(weeks.rows.length).toBeGreaterThan(0)
    for (const row of weeks.rows) expect(row.key).toMatch(/^\d{4}-W\d{2}$/)
    expect(weeks.rows.reduce((sum, row) => sum + row.value, 0)).toBeCloseTo(735, 2)
  })

  it('maps order-type and payment filters from Arabic and English', () => {
    expect(queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2, filters: { orderType: 'توصيل' } }).total).toBe(115)
    expect(queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2, filters: { orderType: 'dine-in' } }).total).toBe(170)
    expect(queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2, filters: { payment: 'فيزا' } }).total).toBe(115)
    expect(queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2, filters: { payment: 'cash' } }).total).toBe(620)
    expect(queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2, filters: { cashier: 'محمد' } }).total).toBe(285)
  })
})

// ─── Previous period ───────────────────────────────────────────

describe('previous period comparison', () => {
  it('compares against the same number of days right before the window', () => {
    const result = queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2, compare: 'previous_period' })
    expect(result.total).toBe(735)
    // 2024-03-08 … 2024-03-09 → only the 95 order.
    expect(result.previousTotal).toBe(95)
    expect(result.changePct).toBe(673.7)
  })

  it('handles a one-day window', () => {
    const result = queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_1, compare: 'previous_period' })
    expect(result.previousTotal).toBe(95)
    expect(result.changePct).toBe(294.7)
  })

  it('reports zero change when the previous window is empty', () => {
    const result = queryMetrics({ metric: 'revenue', from: '2024-01-01', to: '2024-01-02', compare: 'previous_period' })
    expect(result.total).toBe(0)
    expect(result.previousTotal).toBe(0)
    expect(result.changePct).toBe(0)
  })

  it('leaves the comparison fields off when it was not asked for', () => {
    const result = queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2 })
    expect(result.previousTotal).toBeUndefined()
    expect(result.changePct).toBeUndefined()
  })
})

// ─── Validation and safety ─────────────────────────────────────

describe('validation', () => {
  it('rejects a malformed or impossible date', () => {
    expect(() => queryMetrics({ metric: 'revenue', from: '2024/03/10', to: DAY_1 })).toThrow(/YYYY-MM-DD/)
    expect(() => queryMetrics({ metric: 'revenue', from: '2024-02-30', to: DAY_2 })).toThrow(/التقويم/)
    expect(() => queryMetrics({ metric: 'revenue', from: DAY_1, to: 'yesterday' })).toThrow(/YYYY-MM-DD/)
  })

  it('rejects a window that runs backwards', () => {
    expect(() => queryMetrics({ metric: 'revenue', from: DAY_2, to: DAY_1 })).toThrow(/بعد/)
  })

  it('rejects an unknown metric, dimension or lookup value', () => {
    expect(() => queryMetrics({ metric: 'profit' as any, from: DAY_1, to: DAY_2 })).toThrow(/مقياس/)
    expect(() => queryMetrics({ metric: 'revenue', dimension: 'hour' as any, from: DAY_1, to: DAY_2 })).toThrow(/تجميع/)
    expect(() => queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2, filters: { orderType: 'drone' } })).toThrow(/نوع طلب/)
    expect(() => queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2, filters: { status: 'DRAFT' } })).toThrow(/حالة/)
  })

  it('requires an admin session', () => {
    setUser({ id: 'test-cashier', role: 'cashier' })
    try {
      expect(() => queryMetrics({ metric: 'revenue', from: DAY_1, to: DAY_2 })).toThrow(/admin/i)
    } finally {
      setUser({ id: 'test-admin', role: 'admin' })
    }
  })
})

describe('SQL injection', () => {
  it('keeps a quoted filter value a bound parameter', () => {
    const attack = "'; DROP TABLE orders; --"
    const result = queryMetrics({
      metric: 'revenue', dimension: 'product', from: DAY_1, to: DAY_2, filters: { product: attack },
    })
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)

    const orders = getSqlite().prepare('SELECT COUNT(*) AS c FROM orders').get() as { c: number }
    expect(orders.c).toBe(6)
    const items = getSqlite().prepare('SELECT COUNT(*) AS c FROM order_items').get() as { c: number }
    expect(items.c).toBe(7)
  })

  it('does not let a quote change a filter into a tautology', () => {
    const result = queryMetrics({
      metric: 'revenue', from: DAY_1, to: DAY_2, filters: { cashier: "أحمد' OR '1'='1" },
    })
    expect(result.total).toBe(0)
  })

  it('survives LIKE wildcards and backslashes in a name', () => {
    expect(() => queryMetrics({
      metric: 'revenue', dimension: 'category', from: DAY_1, to: DAY_2, filters: { product: '100%_\\' },
    })).not.toThrow()
    const result = queryMetrics({
      metric: 'revenue', dimension: 'category', from: DAY_1, to: DAY_2, filters: { category: '%' },
    })
    expect(result.total).toBe(0)
  })
})

// ─── The tool wrapper ──────────────────────────────────────────

describe('query_metrics tool', () => {
  it('is a read tool with an Arabic description', () => {
    const tool = analyticsTool()
    expect(tool.write).toBe(false)
    expect(tool.description.length).toBeGreaterThan(20)
    expect(tool.schema).toBeTruthy()
  })

  it('answers a headline question with a summary line', async () => {
    const out = await analyticsTool().run({ metric: 'revenue', from: DAY_1, to: DAY_2 }, toolContext())
    expect(ToolOutputSchema.safeParse(out).success).toBe(true)
    expect(out.summary).toContain('إجمالي المبيعات')
    expect(out.summary).toContain('735')
    expect(out.summary).toContain('4')
    // No dimension → no rows → no table, but the numbers still came back.
    expect(out.cards).toHaveLength(0)
    expect((out.data as any).total).toBe(735)
  })

  it('returns a table card when there are rows', async () => {
    const out = await analyticsTool().run(
      { metric: 'revenue', dimension: 'product', from: DAY_1, to: DAY_2 },
      toolContext(),
    )
    expect(ToolOutputSchema.safeParse(out).success).toBe(true)
    expect(out.cards).toHaveLength(1)
    const card = out.cards[0]
    expect(card.kind).toBe('table')
    if (card.kind === 'table') {
      expect(card.columns.length).toBeLessThanOrEqual(5)
      expect(card.rows.length).toBe(3)
      expect(JSON.stringify(card.rows)).toContain('كفته')
    }
    expect(out.summary.length).toBeLessThanOrEqual(300)
  })

  it('returns the error instead of throwing', async () => {
    const out = await analyticsTool().run({ metric: 'revenue', from: 'not-a-date' }, toolContext())
    expect(ToolOutputSchema.safeParse(out).success).toBe(true)
    expect((out.data as any).error).toBeTruthy()
    expect(out.cards).toHaveLength(0)
    expect(out.summary).toContain('مش قادر')
  })
})
