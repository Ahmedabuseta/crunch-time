// Client side of the snapshot SQL worker: request/response with a hard
// deadline. A query that exceeds the deadline gets its worker terminated —
// the only reliable way to cancel a synchronous better-sqlite3 query — and
// the next query transparently spawns a fresh worker.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { QueryResult } from './runner'

export const DEFAULT_QUERY_TIMEOUT_MS = 10_000

/**
 * Resolved next to the compiled main process bundle in production, and from
 * the repository root in dev — same pattern as the Temporal workflow bundle.
 * Under vitest neither exists; the caller falls back to in-thread execution
 * (see Snapshot.query).
 */
export function sqlWorkerPath(): string {
  const candidates = [
    typeof __dirname === 'string' ? path.join(__dirname, 'sql-worker.cjs') : null,
    path.join(process.cwd(), 'dist-electron', 'sql-worker.cjs'),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return ''
}

interface PendingJob {
  resolve: (result: QueryResult) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export type WorkerFactory = () => Worker | null

export class QueryWorker {
  private worker: Worker | null = null
  private seq = 0
  private readonly jobs = new Map<number, PendingJob>()
  readonly available: boolean

  constructor(
    private readonly dbPath: string,
    private readonly spawn: WorkerFactory = () => {
      const file = sqlWorkerPath()
      return file ? new Worker(file, { workerData: { dbPath: this.dbPath } }) : null
    },
  ) {
    this.available = sqlWorkerPath() !== ''
  }

  query(sql: string, maxRows: number, timeoutMs = DEFAULT_QUERY_TIMEOUT_MS): Promise<QueryResult> {
    const worker = this.ensure()
    const id = ++this.seq
    return new Promise<QueryResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        // The worker is blocked inside the query's synchronous .all(), so it
        // can never answer this job again — kill it and fail just this one.
        this.jobs.delete(id)
        this.kill()
        reject(
          new Error(
            `الاستعلام أخذ أكتر من ${Math.round(timeoutMs / 1000)} ثانية وتلغى — بسّط الاستعلام أو أضف LIMIT`,
          ),
        )
      }, timeoutMs)
      this.jobs.set(id, { resolve, reject, timer })
      worker.postMessage({ id, sql, maxRows })
    })
  }

  async dispose(): Promise<void> {
    this.failAll(new Error('أُلغيت الاستعلامات'))
    await this.kill()
  }

  private ensure(): Worker {
    if (this.worker) return this.worker
    const worker = this.spawn()
    if (!worker) throw new Error('عامل SQL غير موجود — أعد بناء التطبيق')
    this.worker = worker
    worker.on('message', (message: { id: number; result?: QueryResult; error?: string }) => {
      const job = this.jobs.get(message.id)
      if (!job) return
      this.jobs.delete(message.id)
      clearTimeout(job.timer)
      if (message.error) job.reject(new Error(message.error))
      else job.resolve(message.result as QueryResult)
    })
    worker.on('error', (error: Error) => {
      this.failAll(error)
      // A real worker emits 'exit' right after 'error', but failing to set
      // this.worker = null here would strand a dead handle.
      this.worker = null
    })
    worker.on('exit', () => {
      this.failAll(new Error('توقّف عامل SQL'))
    })
    return worker
  }

  private failAll(error: Error): void {
    for (const job of this.jobs.values()) {
      clearTimeout(job.timer)
      job.reject(error)
    }
    this.jobs.clear()
  }

  private async kill(): Promise<void> {
    const worker = this.worker
    this.worker = null
    if (!worker) return
    try {
      await worker.terminate()
    } catch {
      // already dead
    }
  }
}
