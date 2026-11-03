import Database from 'better-sqlite3'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { QueryWorker } from './query-worker'
import { runReadOnlyQuery, type QueryResult } from './runner'

export interface Snapshot {
  database: Database.Database
  path: string
  createdAt: number
  query(sql: string, maxRows: number, timeoutMs?: number): Promise<QueryResult>
  dispose(): Promise<void>
}

export async function createSnapshot(sourcePath: string, workDir = tmpdir()): Promise<Snapshot> {
  await mkdir(workDir, { recursive: true })
  const dir = await mkdtemp(path.join(workDir, 'snapshot-'))
  const destination = path.join(dir, 'snapshot.db')

  let source: Database.Database | null = null
  try {
    source = new Database(sourcePath, { readonly: true, fileMustExist: true })
    await source.backup(destination)
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  } finally {
    source?.close()
  }

  const database = new Database(destination, { readonly: true, fileMustExist: true })
  database.pragma('query_only = ON')

  const worker = new QueryWorker(destination)

  return {
    database,
    path: destination,
    createdAt: Date.now(),
    query(sql, maxRows, timeoutMs) {
      // No worker bundle (vitest): the database is already a readonly copy, so
      // running the query in-thread only costs the isolation the worker adds.
      if (!worker.available) return Promise.resolve(runReadOnlyQuery(database, sql, maxRows))
      return worker.query(sql, maxRows, timeoutMs)
    },
    async dispose() {
      await worker.dispose().catch(() => undefined)
      try {
        database.close()
      } catch {
        // already closed
      }
      try {
        await rm(dir, { recursive: true, force: true })
      } catch {
        // Best effort: on Windows a locked snapshot dir (AV scanner, a worker
        // killed mid-query) must not surface as an unhandled rejection from
        // the will-quit close chain. Stale dirs are swept on next boot.
      }
    },
  }
}

export class SnapshotManager {
  private current: Snapshot | null = null
  private pending: Promise<Snapshot> | null = null
  private readonly sourcePath: string
  private readonly ttlMs: number
  private readonly workDir: string | undefined

  constructor(sourcePath: string, ttlMs: number, workDir?: string) {
    this.sourcePath = sourcePath
    this.ttlMs = ttlMs
    this.workDir = workDir
  }

  async get(force = false): Promise<Snapshot> {
    if (!force && this.current && Date.now() - this.current.createdAt < this.ttlMs) {
      return this.current
    }
    if (!this.pending) this.pending = this.replace()
    return this.pending
  }

  private async replace(): Promise<Snapshot> {
    try {
      const next = await createSnapshot(this.sourcePath, this.workDir)
      const previous = this.current
      this.current = next
      await previous?.dispose()
      return next
    } finally {
      this.pending = null
    }
  }

  async close(): Promise<void> {
    // An in-flight replace() is awaited rather than abandoned: once it lands,
    // this.current is the new snapshot, so disposing "the current one" covers
    // both the fresh and the superseded copy.
    const pending = this.pending
    this.pending = null
    if (pending) {
      try {
        await pending
      } catch {
        // snapshot creation already failed; nothing to dispose
      }
    }
    const snapshot = this.current
    this.current = null
    await snapshot?.dispose()
  }
}
