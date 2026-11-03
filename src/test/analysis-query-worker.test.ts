import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { QueryWorker, sqlWorkerPath } from '../analysis/query-worker'

class FakeWorker extends EventEmitter {
  postMessage = vi.fn()
  terminate = vi.fn(async () => undefined)
}

describe('QueryWorker', () => {
  it('resolves a query with the worker reply', async () => {
    const worker = new FakeWorker()
    const queryWorker = new QueryWorker('/tmp/db', () => worker as unknown as import('node:worker_threads').Worker)

    const pending = queryWorker.query('SELECT 1', 10)
    const message = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    worker.emit('message', { id: message.id, result: { columns: ['1'], rows: [[1]], rowCount: 1, truncated: false, elapsedMs: 1 } })

    await expect(pending).resolves.toMatchObject({ rowCount: 1 })
  })

  it('rejects and kills the worker when the deadline passes', async () => {
    const worker = new FakeWorker()
    const queryWorker = new QueryWorker('/tmp/db', () => worker as unknown as import('node:worker_threads').Worker)

    const pending = queryWorker.query('SELECT 1', 10, 20)
    await expect(pending).rejects.toThrow(/تلغى/)
    expect(worker.terminate).toHaveBeenCalled()
  })

  it('fails pending jobs when the worker errors, then respawns', async () => {
    let worker = new FakeWorker()
    let spawned = 0
    const queryWorker = new QueryWorker('/tmp/db', () => {
      spawned += 1
      return worker as unknown as import('node:worker_threads').Worker
    })

    const first = queryWorker.query('SELECT 1', 10)
    worker.emit('error', new Error('boom'))
    await expect(first).rejects.toThrow('boom')

    const second = queryWorker.query('SELECT 2', 10)
    expect(spawned).toBe(2)
    const calls = (worker.postMessage as ReturnType<typeof vi.fn>).mock.calls
    const message = calls[calls.length - 1][0]
    worker.emit('message', { id: message.id, result: { columns: [], rows: [], rowCount: 0, truncated: false, elapsedMs: 0 } })
    await expect(second).resolves.toMatchObject({ rowCount: 0 })
  })

  it('rejects pending jobs on dispose', async () => {
    const worker = new FakeWorker()
    const queryWorker = new QueryWorker('/tmp/db', () => worker as unknown as import('node:worker_threads').Worker)

    const pending = queryWorker.query('SELECT 1', 10)
    await queryWorker.dispose()
    await expect(pending).rejects.toThrow(/أُلغيت/)
  })

  it('reports availability from the bundle path', () => {
    const available = sqlWorkerPath() !== ''
    const queryWorker = new QueryWorker('/tmp/db')
    expect(queryWorker.available).toBe(available)
  })
})
