// The break-even target must not move with every sale. It is built from the
// menu's prices/costs (and, after a full month of sales, that month's mix), so
// a new order changes the progress, never the target.
process.env.TZ = 'Africa/Cairo'

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'break-even-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { setUser } = await import('../backend/session')
const { profitSummary } = await import('../backend/reports')
const { localDateOf } = await import('../backend/day-range')

const db = () => getSqlite()
const today = () => localDateOf(new Date().toISOString())

function insertOrder(id: string, total: number) {
  const iso = new Date().toISOString()
  db().prepare(`
    INSERT INTO orders (id, status, order_type, subtotal, tax, delivery_fee, total, payment_type, created_at, updated_at)
    VALUES (?, 'COMPLETED', 'takeaway', ?, 0, 0, ?, 'cash', ?, ?)
  `).run(id, total, total, iso, iso)
}

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  setUser({ id: 'test-admin', role: 'admin' })
  // A 40% food cost across the menu → a 60% contribution ratio.
  db().prepare('UPDATE products SET cost_price = ROUND(price * 0.4, 2) WHERE active = 1 AND price > 0').run()
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('break-even target', () => {
  it('derives the ratio from the menu when there is no previous month of sales', () => {
    const report = profitSummary(undefined, today())
    expect(report.breakEvenBasis).toBe('menu')
    expect(report.contributionRatio).toBeCloseTo(0.6, 2)
    expect(report.fixedMonthlyExpenses).toBeGreaterThan(0)
    expect(report.breakEvenRevenue).toBeCloseTo(report.fixedMonthlyExpenses / 0.6, 1)
  })

  it('does not move when a sale is added — only progress moves', () => {
    const before = profitSummary(undefined, today())
    insertOrder('be-sale-1', 500)
    const after = profitSummary(undefined, today())

    expect(after.breakEvenRevenue).toBe(before.breakEvenRevenue)
    expect(after.contributionRatio).toBe(before.contributionRatio)
    expect(after.netSales).toBeGreaterThan(before.netSales)
    expect(after.breakEvenProgress).toBeGreaterThan(before.breakEvenProgress)
    expect(after.breakEvenRemaining).toBeLessThan(before.breakEvenRemaining)
  })

  it('counts only recurring expenses in the target', () => {
    const before = profitSummary(undefined, today())
    db().prepare(`
      INSERT INTO expenses (id, name, category, amount, type, active)
      VALUES ('be-one-time', 'صيانة مرة واحدة', 'صيانة', 5000, 'one-time', 1)
    `).run()
    const after = profitSummary(undefined, today())

    expect(after.oneTimeExpenses).toBe(5000)
    expect(after.totalExpenses).toBe(before.totalExpenses + 5000)
    expect(after.fixedMonthlyExpenses).toBe(before.fixedMonthlyExpenses)
    expect(after.breakEvenRevenue).toBe(before.breakEvenRevenue)
  })

  it('excludes tax and delivery fees from the progress sales', () => {
    const before = profitSummary(undefined, today())
    const iso = new Date().toISOString()
    db().prepare(`
      INSERT INTO orders (id, status, order_type, subtotal, tax, delivery_fee, total, payment_type, created_at, updated_at)
      VALUES ('be-taxed', 'COMPLETED', 'delivery', 100, 14, 25, 139, 'cash', ?, ?)
    `).run(iso, iso)

    const after = profitSummary(undefined, today())
    expect(after.netSales - before.netSales).toBeCloseTo(100, 2)
  })
})
