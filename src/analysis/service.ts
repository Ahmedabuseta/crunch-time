import type { QueryResult } from './runner'
import { describeSchema, type TableInfo } from './schema'
import { SnapshotManager, type Snapshot } from './snapshot'

export const DEFAULT_SNAPSHOT_TTL_MS = 5 * 60_000
export const DEFAULT_MAX_ROWS = 200

export interface AnalysisOptions {
  ttlMs?: number
  maxRows?: number
  workDir?: string
}

export class AnalysisService {
  private readonly sourcePath: () => string
  private readonly ttlMs: number
  private readonly maxRows: number
  private readonly workDir: string | undefined
  private manager: SnapshotManager | null = null

  constructor(sourcePath: () => string, options: AnalysisOptions = {}) {
    this.sourcePath = sourcePath
    this.ttlMs = options.ttlMs ?? DEFAULT_SNAPSHOT_TTL_MS
    this.maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
    this.workDir = options.workDir
  }

  private snapshots(): SnapshotManager {
    if (!this.manager) this.manager = new SnapshotManager(this.sourcePath(), this.ttlMs, this.workDir)
    return this.manager
  }

  async query(sql: string, maxRows = this.maxRows): Promise<QueryResult> {
    const snapshot = await this.snapshots().get()
    return snapshot.query(sql, maxRows)
  }

  async schema(): Promise<TableInfo[]> {
    const snapshot = await this.snapshots().get()
    return describeSchema(snapshot.database)
  }

  async withSnapshot<T>(fn: (snapshot: Snapshot) => Promise<T> | T): Promise<T> {
    const snapshot = await this.snapshots().get()
    return fn(snapshot)
  }

  async refresh(): Promise<number> {
    const snapshot = await this.snapshots().get(true)
    return snapshot.createdAt
  }

  async close(): Promise<void> {
    const manager = this.manager
    this.manager = null
    await manager?.close()
  }
}
