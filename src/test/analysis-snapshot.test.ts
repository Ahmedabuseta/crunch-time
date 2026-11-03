import Database from 'better-sqlite3'
import { access, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSnapshot } from '../analysis/snapshot'
import { seedOrders, tempDir } from './helpers/temp-db'

const dirs: string[] = []
const sources: Database.Database[] = []

async function setup() {
  const dir = await tempDir()
  dirs.push(dir)
  const sourcePath = path.join(dir, 'source.db')
  const source = new Database(sourcePath)
  sources.push(source)
  source.pragma('journal_mode = WAL')
  seedOrders(source)
  return { sourcePath, source }
}

afterEach(async () => {
  for (const source of sources.splice(0)) {
    try {
      source.close()
    } catch {
      // already closed
    }
  }
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('analysis snapshot', () => {
  it('copies a live WAL database', async () => {
    const { sourcePath } = await setup()
    const snapshot = await createSnapshot(sourcePath)

    const row = snapshot.database.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }
    expect(row.n).toBe(3)
    await snapshot.dispose()
  })

  it('is isolated from later writes to the source', async () => {
    const { sourcePath, source } = await setup()
    const snapshot = await createSnapshot(sourcePath)

    source.prepare("INSERT INTO orders (status, total, created_at) VALUES ('COMPLETED', 99, '2026-11-04T10:00:00Z')").run()

    const live = source.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }
    const copy = snapshot.database.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }
    expect(live.n).toBe(4)
    expect(copy.n).toBe(3)

    await snapshot.dispose()
  })

  it('refuses writes even if the guard were bypassed', async () => {
    const { sourcePath } = await setup()
    const snapshot = await createSnapshot(sourcePath)

    expect(() => snapshot.database.prepare('DELETE FROM orders').run()).toThrow(/readonly/i)
    await snapshot.dispose()
  })

  it('removes the temporary copy on dispose', async () => {
    const { sourcePath } = await setup()
    const snapshot = await createSnapshot(sourcePath)
    const snapshotPath = snapshot.path

    await snapshot.dispose()

    await expect(access(snapshotPath)).rejects.toThrow()
  })
})
