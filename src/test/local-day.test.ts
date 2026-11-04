// Day boundaries are the shop's local days, but orders are stored as UTC
// timestamps. These tests pin that down: an order at 00:30 in Cairo is stored
// on the previous UTC date and must still belong to the local day it was sold.
process.env.TZ = 'Africa/Cairo'

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'local-day-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { setUser } = await import('../backend/session')
const { dailySummary, revenueTrend, hourlyReport } = await import('../backend/reports')
const {
  inLocalDayRange,
  localDatesBetween,
  localDateOf,
  localDayEnd,
  localDayStart,
} = await import('../backend/day-range')

const db = () => getSqlite()

function insertOrder(id: string, createdAt: string, total: number) {
  db().prepare(`
    INSERT INTO orders (id, status, order_type, subtotal, tax, delivery_fee, total, payment_type, created_at, updated_at)
    VALUES (?, 'COMPLETED', 'takeaway', ?, 0, 0, ?, 'cash', ?, ?)
  `).run(id, total, total, createdAt, createdAt)
}

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  setUser({ id: 'test-admin', role: 'admin' })
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('local day bounds', () => {
  it('starts at local midnight, which is not UTC midnight', () => {
    const start = new Date(localDayStart('2026-11-02'))
    expect(start.getHours()).toBe(0)
    expect(start.getDate()).toBe(2)
    // Cairo is UTC+2 in November, so local midnight is 22:00Z the day before.
    expect(start.toISOString()).toBe('2026-11-01T22:00:00.000Z')
  })

  it('counts an order sold just after midnight as that local day', () => {
    const iso = new Date(2026, 10, 2, 0, 30).toISOString()
    expect(iso.startsWith('2026-11-01')).toBe(true) // stored on the previous UTC date
    expect(localDateOf(iso)).toBe('2026-11-02')
    expect(inLocalDayRange(iso, '2026-11-02', '2026-11-02')).toBe(true)
    expect(inLocalDayRange(iso, '2026-11-01', '2026-11-01')).toBe(false)
  })

  it('excludes the next local midnight from the previous day', () => {
    const nextMidnight = new Date(2026, 10, 3, 0, 0).toISOString()
    expect(inLocalDayRange(nextMidnight, '2026-11-02', '2026-11-02')).toBe(false)
    expect(inLocalDayRange(nextMidnight, '2026-11-03', '2026-11-03')).toBe(true)
    expect(localDayEnd('2026-11-02')).toBe(nextMidnight)
  })

  it('lists one date per local day across a DST change', () => {
    const dates = localDatesBetween('2026-04-23', '2026-04-27')
    expect(dates).toEqual(['2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26', '2026-04-27'])
  })
})

describe('reports use the local day', () => {
  it('puts a post-midnight order in the day the owner sold it', () => {
    const iso = new Date(2026, 8, 15, 0, 30).toISOString() // 15 Sep 2026, 00:30 local
    insertOrder('local-day-1', iso, 120)

    expect(dailySummary('2026-09-15').totalRevenue).toBe(120)
    expect(dailySummary('2026-09-14').totalRevenue).toBe(0)
    expect(dailySummary('2026-09-15').totalOrders).toBe(1)
  })

  it('buckets the revenue trend by local date', () => {
    const today = localDateOf(new Date().toISOString())
    const [y, m, d] = today.split('-').map(Number)
    const iso = new Date(y, m - 1, d, 0, 30).toISOString()
    insertOrder('local-day-2', iso, 75)

    const rows = revenueTrend(2)
    const todayRow = rows[rows.length - 1]
    expect(todayRow.date).toBe(today)
    expect(todayRow.revenue).toBeGreaterThanOrEqual(75)
  })

  it('accepts an explicit from/to window for the trend', () => {
    insertOrder('local-day-window', new Date(2026, 8, 16, 13, 0).toISOString(), 60)

    const rows = revenueTrend(7, '2026-09-14', '2026-09-17')
    expect(rows.map(row => row.date)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'])
    const day = rows.find(row => row.date === '2026-09-16')
    expect(day?.revenue).toBeGreaterThanOrEqual(60)
  })

  it('falls back to the trailing window when from/to are invalid or future', () => {
    const today = localDateOf(new Date().toISOString())
    const rows = revenueTrend(3, 'garbage', '2099-01-01')
    expect(rows).toHaveLength(3)
    expect(rows[rows.length - 1].date).toBe(today)
  })
})

describe('hourly blocks', () => {
  it('folds 24 hours into contiguous blocks with exclusive ends', () => {
    for (const [hour, total] of [[2, 100], [5, 50], [23, 25]] as const) {
      insertOrder(`hourly-block-${hour}`, new Date(2026, 8, 16, hour, 0).toISOString(), total)
    }

    const { hourly, blocks } = hourlyReport('2026-09-16', '2026-09-16', 4)
    expect(hourly).toHaveLength(24)
    expect(blocks).toHaveLength(6)
    expect(blocks[0]).toMatchObject({ startHour: 0, endHour: 4, orderCount: 1, revenue: 100 })
    expect(blocks[1]).toMatchObject({ startHour: 4, endHour: 8, orderCount: 1, revenue: 50 })
    expect(blocks[5]).toMatchObject({ startHour: 20, endHour: 24, orderCount: 1, revenue: 25 })
    expect(blocks.reduce((sum, b) => sum + b.revenue, 0)).toBe(
      hourly.reduce((sum, row) => sum + row.revenue, 0)
    )
  })

  it('counts a post-midnight order in its local block, not the UTC day', () => {
    const iso = new Date(2026, 8, 20, 0, 30).toISOString() // stored 22:30Z on 09-19
    expect(iso.startsWith('2026-09-19')).toBe(true)
    insertOrder('hourly-block-postmidnight', iso, 80)

    const { blocks } = hourlyReport('2026-09-20', '2026-09-20', 4)
    expect(blocks[0]).toMatchObject({ startHour: 0, endHour: 4, orderCount: 1, revenue: 80 })
  })

  it('falls back to one-hour blocks for unknown sizes', () => {
    const { blocks } = hourlyReport('2026-09-16', '2026-09-16', 7)
    expect(blocks).toHaveLength(24)
    expect(blocks[0]).toMatchObject({ startHour: 0, endHour: 1 })
  })
})
