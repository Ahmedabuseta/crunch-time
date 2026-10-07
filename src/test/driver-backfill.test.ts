// Upgrade path test: a database created *before* the delivery workflow has an
// orders table with no driver_status column. Every app start runs the legacy
// block in migrate.ts, so that is what must add the column AND bucket the
// historical delivery orders exactly once.
import { describe, it, expect, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'driver-backfill-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { getSqlite, closeSqlite } = await import('../db/client')

afterAll(() => {
  // Windows locks open files — close the connection before
  // the recursive delete or rmSync throws EPERM.
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('driver_status upgrade on an existing database', () => {
  it('adds the column and backfills historical orders exactly once', () => {
    runMigrations()
    const sqlite = getSqlite()

    // Stand in for a pre-feature production database: same table, no column.
    sqlite.exec('ALTER TABLE orders DROP COLUMN driver_status')
    sqlite.exec(`
      INSERT INTO users (id, name, pin_hash, role, active, created_at, hourly_rate, commission_rate)
      VALUES ('u-upgrade', 'مدير', 'hash', 'admin', 1, '2026-01-01', 0, 0);
      INSERT INTO delivery_profiles (id, name, phone, active) VALUES ('drv-x', 'سامي', '010', 1);
      INSERT INTO orders (id, status, order_type, subtotal, tax, total, payment_type,
        delivery_profile_id, delivery_profile_name, created_at, updated_at) VALUES
        ('o-assigned', 'COMPLETED', 'delivery', 100, 0, 100, 'cash', 'drv-x', 'سامي',
         '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z'),
        ('o-free', 'COMPLETED', 'delivery', 100, 0, 100, 'cash', NULL, NULL,
         '2026-01-01T11:00:00.000Z', '2026-01-01T11:00:00.000Z'),
        ('o-dine', 'COMPLETED', 'dine-in', 100, 0, 100, 'cash', NULL, NULL,
         '2026-01-01T12:00:00.000Z', '2026-01-01T12:00:00.000Z');
    `)

    // The start-up path: ensureColumn + backfill.
    runMigrations()
    expect(
      sqlite.prepare('SELECT id, driver_status AS ds FROM orders ORDER BY id').all(),
    ).toEqual([
      { id: 'o-assigned', ds: 'assigned' },
      { id: 'o-dine', ds: null },
      { id: 'o-free', ds: 'unassigned' },
    ])

    // Second start must not re-bucket rows the workflow already resolved.
    sqlite.exec(`UPDATE orders SET driver_status = 'assigned' WHERE id = 'o-free'`)
    runMigrations()
    expect(
      sqlite.prepare(`SELECT driver_status AS ds FROM orders WHERE id = 'o-free'`).get(),
    ).toEqual({ ds: 'assigned' })
  })
})
