import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'analysis-sql-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { runTool } = await import('../ai/activities')
const analysis = await import('../backend/analysis')
const { setUser } = await import('../backend/session')

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  setUser({ id: 'test-admin', role: 'admin' })
})

afterAll(async () => {
  await analysis.close()
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('query_database tool', () => {
  it('runs read-only SQL against the snapshot and returns a table card', async () => {
    const result = await runTool({
      turnId: 'analysis-test',
      name: 'query_database',
      args: { sql: 'SELECT COUNT(*) AS n FROM products' },
    })

    const data = result.data as { columns: string[]; rows: unknown[][]; rowCount: number }
    expect(data.columns).toEqual(['n'])
    expect(Number(data.rows[0][0])).toBeGreaterThan(0)
    expect(data.rowCount).toBe(1)
    expect(result.cards[0]?.kind).toBe('table')
  })

  it('refuses a write and leaves the live table untouched', async () => {
    const before = (getSqlite().prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n

    const result = await runTool({
      turnId: 'analysis-test',
      name: 'query_database',
      args: { sql: 'DELETE FROM products' },
    })

    expect(result.summary).toMatch(/ممنوع|مسموح/)
    const after = (getSqlite().prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n
    expect(after).toBe(before)
  })

  it('describes the schema from the snapshot', async () => {
    const tables = await analysis.schema()
    expect(tables.map((table) => table.name)).toContain('orders')
    expect(tables.flatMap((table) => table.columns).length).toBeGreaterThan(0)
  })

  it('refreshes the snapshot', async () => {
    await expect(analysis.refresh()).resolves.toBeGreaterThan(0)
  })
})
