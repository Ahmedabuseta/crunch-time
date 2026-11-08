// Best days and busiest hours — the ranked answer the reports screen shows.
//
// Everything here runs against a real migrated database in a temp directory.
// The orders are written at **local** times on purpose: that is the whole point
// of this fixture, because the bug this feature exposed was grouping by the UTC
// date. An order placed at 00:30 local is stored 22:30Z on the previous date,
// and a report that slices the stored string files it under the wrong day.
//
// The process timezone is pinned to Africa/Cairo (UTC+2, no DST since 2014) so
// those two dates are deterministic on any machine running the suite.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'peaks-test-'))
const previousTz = process.env.TZ
process.env.TZ = 'Africa/Cairo'

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { setUser } = await import('../backend/session')
const { peakAnalysis } = await import('../backend/reports')
const { queryMetrics } = await import('../backend/analytics')

const DAY = '2024-03-10'
const NEXT_DAY = '2024-03-11'

/** Insert an order at a local wall-clock time, stored the way the app stores it. */
function insertAtLocal(
  id: string,
  localDay: string,
  hour: number,
  minute: number,
  total: number,
  status = 'COMPLETED',
) {
  const [y, m, d] = localDay.split('-').map(Number)
  const createdAt = new Date(y, m - 1, d, hour, minute).toISOString()
  getSqlite().prepare(`
    INSERT INTO orders (id, status, order_type, subtotal, tax, delivery_fee, discount_amount, total, payment_type, cashier_name, created_at, updated_at)
    VALUES (?, ?, 'takeaway', ?, 0, 0, 0, ?, 'cash', 'أحمد', ?, ?)
  `).run(id, status, total, total, createdAt, createdAt)
}

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  setUser({ id: 'test-admin', role: 'admin' } as never)

  // Day 1: a lunch rush (13:00 ×3), an early-morning order at 00:30 — the one
  // that lands on the previous UTC date — and one late order at 22:00.
  insertAtLocal('p1', DAY, 13, 0, 100)
  insertAtLocal('p2', DAY, 13, 20, 300)
  insertAtLocal('p3', DAY, 13, 40, 200)
  insertAtLocal('p4', DAY, 0, 30, 500)
  insertAtLocal('p5', DAY, 22, 0, 50)

  // Day 2: one big evening delivery — highest single-hour revenue but not the
  // busiest hour by ticket count.
  insertAtLocal('p6', NEXT_DAY, 21, 0, 900)

  // Money that never counts: cancelled and refunded.
  insertAtLocal('p7', DAY, 13, 10, 999, 'CANCELLED')
  insertAtLocal('p8', DAY, 21, 0, 888, 'REFUNDED')
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
  if (previousTz === undefined) delete process.env.TZ
  else process.env.TZ = previousTz
})

describe('local day grouping (the bug this exposed)', () => {
  it('files an order placed at 00:30 local under that local day, not the UTC one', () => {
    // In Cairo, 00:30 on 2024-03-10 is 22:30Z on 2024-03-09. Slicing the stored
    // string used to put this order on the 9th, a day outside the window.
    const result = queryMetrics({ metric: 'orders', dimension: 'day', from: DAY, to: DAY })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].key).toBe(DAY)
    // p1..p5 plus the refunded p8 — queryMetrics keeps refunds in revenue, as
    // its own tests document. Only the cancelled one is dropped.
    expect(result.rows[0].value).toBe(6)
  })

  it('keeps a late local order on its own local day', () => {
    const result = queryMetrics({ metric: 'orders', dimension: 'day', from: DAY, to: DAY })
    expect(result.total).toBe(6)
  })

  it('groups the hour dimension by local hour', () => {
    const result = queryMetrics({ metric: 'orders', dimension: 'hour', from: DAY, to: NEXT_DAY })
    const byLabel = new Map(result.rows.map((r) => [r.label, r.value]))
    // 00:30 local is 22:30Z; a UTC hour would show 22 instead of 0.
    expect(byLabel.get('00:00')).toBe(1)
    expect(byLabel.get('13:00')).toBe(3)
    // The 21:00 delivery plus the refunded p8 that queryMetrics keeps.
    expect(byLabel.get('21:00')).toBe(2)
  })
})

describe('peakAnalysis', () => {
  it('ranks days by revenue and excludes cancelled/refunded money', () => {
    const peaks = peakAnalysis({ from: DAY, to: NEXT_DAY })
    expect(peaks.orderCount).toBe(6)
    // 100+300+200+500+50 = 1150 on day 1; 900 on day 2.
    expect(peaks.revenue).toBe(2050)
    expect(peaks.topDays[0].date).toBe(DAY)
    expect(peaks.topDays[0].revenue).toBe(1150)
    expect(peaks.topDays[1].date).toBe(NEXT_DAY)
    expect(peaks.topDays[1].revenue).toBe(900)
  })

  it('counts the 00:30 order on the day it was actually placed', () => {
    const peaks = peakAnalysis({ from: DAY, to: DAY })
    expect(peaks.orderCount).toBe(5)
    expect(peaks.revenue).toBe(1150)
  })

  it('ranks hours differently by revenue and by ticket count', () => {
    const peaks = peakAnalysis({ from: DAY, to: NEXT_DAY })
    // Busiest by count: 13:00 with three tickets.
    expect(peaks.topHoursByOrders[0].hour).toBe(13)
    expect(peaks.topHoursByOrders[0].orderCount).toBe(3)
    // Richest by money: 21:00 with one 900 order.
    expect(peaks.topHoursByRevenue[0].hour).toBe(21)
    expect(peaks.topHoursByRevenue[0].revenue).toBe(900)
  })

  it('staffs on orders per day, not on the single busiest ticket', () => {
    const peaks = peakAnalysis({ from: DAY, to: NEXT_DAY })
    // The window is 2 days: 13:00 runs 1.5 orders/day, 21:00 runs 0.5.
    expect(peaks.bestHour?.hour).toBe(13)
    expect(peaks.bestHour?.ordersPerDay).toBe(1.5)
  })

  it('reports each hour\'s share of the window', () => {
    const peaks = peakAnalysis({ from: DAY, to: NEXT_DAY })
    const lunch = peaks.topHoursByOrders.find((h) => h.hour === 13)
    // 3 of 6 orders.
    expect(lunch?.share).toBe(50)
  })

  it('averages a weekday over how often it occurred, not over the window', () => {
    // A 7-day window from DAY holds each weekday once, so the average equals
    // the total for that weekday.
    const peaks = peakAnalysis({ from: DAY, to: '2024-03-16' })
    const sunday = peaks.weekdayAverages.find((w) => w.weekday === 0)
    expect(sunday?.revenue).toBe(1150)
  })

  it('returns empty lists for a window with no orders', () => {
    const peaks = peakAnalysis({ from: '2020-01-01', to: '2020-01-07' })
    expect(peaks.orderCount).toBe(0)
    expect(peaks.topDays).toEqual([])
    expect(peaks.topHoursByOrders).toEqual([])
    expect(peaks.bestHour).toBeNull()
  })

  it('never lists an idle hour in the top hours', () => {
    const peaks = peakAnalysis({ from: DAY, to: NEXT_DAY })
    for (const hour of peaks.topHoursByOrders) expect(hour.orderCount).toBeGreaterThan(0)
  })

  it('clamps the limit and defaults to five', () => {
    expect(peakAnalysis({ from: DAY, to: NEXT_DAY }).topDays).toHaveLength(2)
    expect(peakAnalysis({ from: DAY, to: NEXT_DAY, limit: 1 }).topDays).toHaveLength(1)
    expect(peakAnalysis({ from: DAY, to: NEXT_DAY, limit: 999 }).topDays).toHaveLength(2)
  })

  it('counts the window in calendar days, inclusive', () => {
    expect(peakAnalysis({ from: DAY, to: NEXT_DAY }).days).toBe(2)
    expect(peakAnalysis({ from: DAY, to: DAY }).days).toBe(1)
  })
})
