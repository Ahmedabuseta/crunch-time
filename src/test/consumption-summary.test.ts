// Consumption tracking aggregates the inventory ledger per ingredient: what
// was actually consumed, what was wasted, its cost, the daily rate and how
// many days the current stock covers.
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'consumption-summary-test-'))
const handlers = new Map<string, (e: any, ...args: any[]) => any>()

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) },
  BrowserWindow: class MockWindow {},
}))

const { registerIpcHandlers } = await import('../ipc/main')
const { runMigrations } = await import('../db/migrate')
const { getSqlite, closeSqlite } = await import('../db/client')

const call = async (channel: string, ...args: any[]) => {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler: ${channel}`)
  return fn({}, ...args)
}

beforeAll(async () => {
  runMigrations()
  registerIpcHandlers()
  await call('session:setUser', { id: 'u-admin', role: 'admin' })
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('ingredient consumption summary', () => {
  it('aggregates consumption, waste, cost and coverage for the period', async () => {
    const sqlite = getSqlite()
    sqlite.prepare(
      `INSERT INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, purchase_qty, active)
       VALUES ('ing-consume', 'مادة استهلاك', 'g', 100, 0, 2, 1, 1)`,
    ).run()
    sqlite.prepare(
      `INSERT INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, purchase_qty, active)
       VALUES ('ing-buyonly', 'مادة توريد فقط', 'g', 50, 0, 3, 1, 1)`,
    ).run()

    const order = sqlite.prepare(
      `INSERT INTO orders (id, status, order_type, subtotal, tax, total, created_at, updated_at)
       VALUES (?, 'COMPLETED', 'dine_in', 0, 0, 0, ?, ?)`,
    )
    for (const id of ['o1', 'o2', 'o3']) order.run(id, '2026-01-05T10:00:00.000Z', '2026-01-05T10:00:00.000Z')

    const ins = sqlite.prepare(
      `INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    )
    ins.run('t1', 'ing-consume', 'CONSUMPTION', -10, 'o1', '2026-01-05T10:00:00.000Z')
    ins.run('t2', 'ing-consume', 'CONSUMPTION', -5, 'o1', '2026-01-06T10:00:00.000Z')
    ins.run('t3', 'ing-consume', 'CONSUMPTION', -5, 'o2', '2026-01-07T10:00:00.000Z')
    ins.run('t4', 'ing-consume', 'WASTE', -3, null, '2026-01-08T10:00:00.000Z')
    ins.run('t5', 'ing-consume', 'PURCHASE', 50, null, '2026-01-09T10:00:00.000Z')
    ins.run('t6', 'ing-consume', 'ADJUSTMENT', 2, null, '2026-01-10T10:00:00.000Z')
    // Outside the requested window — must not leak into the numbers.
    ins.run('t7', 'ing-consume', 'CONSUMPTION', -99, 'o3', '2025-12-31T10:00:00.000Z')
    ins.run('t8', 'ing-buyonly', 'PURCHASE', 50, null, '2026-01-09T10:00:00.000Z')

    const res = await call('inventory:consumptionSummary', { from: '2026-01-01', to: '2026-01-10' })
    expect(res.days).toBe(10)
    expect(res.totals).toEqual({ cost: 40, wasteCost: 6, ingredients: 1 })

    const row = res.rows[0]
    expect(row).toMatchObject({
      ingredientId: 'ing-consume',
      consumed: 20,
      waste: 3,
      adjustment: 2,
      orderCount: 2,
      cost: 40,
      wasteCost: 6,
      avgDaily: 2,
      daysCover: 50,
    })
    // Purchase-only ingredients are not part of a consumption report.
    expect(res.rows.some((r: any) => r.ingredientId === 'ing-buyonly')).toBe(false)
  })

  it('can derive the day window from the recorded transactions', async () => {
    const res = await call('inventory:consumptionSummary', {})
    // First consumption 2025-12-31 → last 2026-01-07 = 8 days.
    expect(res.days).toBe(8)
    expect(res.rows[0].consumed).toBe(119)
    expect(res.rows[0].avgDaily).toBeCloseTo(14.88, 1)
  })
})
