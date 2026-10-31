// A broken legacy backfill used to abort runMigrations() before the IPC
// handlers were registered, which the owner saw as a login screen with no
// users. Migrations must survive that and leave the users list readable.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'migrate-resilience-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { listUsers } = await import('../backend/users')

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('runMigrations resilience', () => {
  it('keeps going when a legacy backfill fails, so users stay readable', () => {
    // The follow-up column backfill PRAGMA/ALTERs ai_messages. Dropping the
    // table makes that statement throw, exactly like a half-restored database.
    getSqlite().exec('DROP TABLE IF EXISTS ai_messages')

    expect(() => runMigrations()).not.toThrow()
    expect((listUsers().all() as unknown[]).length).toBeGreaterThan(0)
  })

  it('still seeds a usable staff list after the failed backfill', async () => {
    await seedDatabase()
    const users = listUsers().all() as { active: boolean }[]
    expect(users.length).toBeGreaterThan(0)
    expect(users.every((u) => u.active)).toBe(true)
  })
})
