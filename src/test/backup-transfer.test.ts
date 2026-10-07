// Export → restore round trip: the "same data on another PC" flow.
// Drives the REAL backup:export / backup:restore IPC handlers through a
// mocked ipcMain + dialog against a throwaway database.
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

const tempDir = mkdtempSync(path.join(tmpdir(), 'backup-transfer-test-'))
const handlers = new Map<string, (e: any, ...args: any[]) => any>()

// The dialog stubs read their answers off globalThis so the test can point
// them at specific files without importing the mock itself.
vi.mock('electron', () => ({
  app: {
    getPath: () => tempDir,
    getName: () => 'fastfood-cashier',
    relaunch: () => {},
    exit: () => {},
  },
  ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) },
  BrowserWindow: class MockWindow {},
  dialog: {
    showSaveDialog: async () => ({
      canceled: false,
      filePath: (globalThis as any).__savePath as string,
    }),
    showOpenDialog: async () => ({
      canceled: false,
      filePaths: [(globalThis as any).__pickPath as string],
    }),
  },
}))

const { registerIpcHandlers } = await import('../ipc/main')
const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')

const call = async (channel: string, ...args: any[]) => {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler: ${channel}`)
  return fn({}, ...args)
}

const countUsers = () =>
  (getSqlite().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  registerIpcHandlers()
})

afterAll(() => {
  // Windows locks open files — close the connection before
  // the recursive delete or rmSync throws EPERM.
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('backup:export / backup:restore', () => {
  it('round-trips the database through an exported file', async () => {
    const exportPath = path.join(tempDir, 'snapshot.db')
    ;(globalThis as any).__savePath = exportPath

    const usersAtExport = countUsers()
    expect(usersAtExport).toBeGreaterThan(0)

    const exported = await call('backup:export')
    expect(exported.ok).toBe(true)
    expect(exported.path).toBe(exportPath)
    expect(existsSync(exportPath)).toBe(true)

    // Lose the data on "this machine"…
    getSqlite().prepare('DELETE FROM users').run()
    expect(countUsers()).toBe(0)

    // …and restore the exported snapshot.
    ;(globalThis as any).__pickPath = exportPath
    const restored = await call('backup:restore')
    expect(restored.ok).toBe(true)
    expect(restored.restarting).toBe(true)

    // WAL side files from the old database must not survive the swap —
    // checked BEFORE reopening, since a fresh connection creates its own.
    expect(existsSync(path.join(tempDir, 'fastfood.db-wal'))).toBe(false)
    expect(existsSync(path.join(tempDir, 'fastfood.db-shm'))).toBe(false)

    // The swap closed the old connection; the next call reopens the new file.
    expect(countUsers()).toBe(usersAtExport)

    // And a pre-restore safety snapshot of the damaged state was taken.
    const backups = await call('backup:getStatus')
    expect(backups.backupCount).toBeGreaterThan(0)
  })

  it('rejects a file that is not a database', async () => {
    const bogus = path.join(tempDir, 'bogus.db')
    writeFileSync(bogus, 'definitely not sqlite bytes.....')
    ;(globalThis as any).__pickPath = bogus

    const usersBefore = countUsers()
    const res = await call('backup:restore')
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    expect(countUsers()).toBe(usersBefore)
  })

  it('rejects a valid database that is not from this app', async () => {
    const foreign = path.join(tempDir, 'foreign.db')
    const db = new Database(foreign)
    db.exec('CREATE TABLE unrelated (x TEXT)')
    db.close()
    ;(globalThis as any).__pickPath = foreign

    const usersBefore = countUsers()
    const res = await call('backup:restore')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('التطبيق')
    expect(countUsers()).toBe(usersBefore)
  })
})
