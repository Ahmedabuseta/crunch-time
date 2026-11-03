// Dedicated worker thread for read-only snapshot SQL.
//
//better-sqlite3 `all()` is synchronous: run on the Electron main thread it
//blocks UI, IPC and the HTTP server for as long as a heavy query computes.
//This worker owns its own readonly connection to the snapshot file, so a
//runaway query can simply be terminated (see query-worker.ts) without taking
//the app down with it. Built by scripts/build-electron.mjs to
//dist-electron/sql-worker.cjs, next to main.cjs.
import { parentPort, workerData } from 'node:worker_threads'
import Database from 'better-sqlite3'
import { runReadOnlyQuery } from './runner'

const database = new Database((workerData as { dbPath: string }).dbPath, {
  readonly: true,
  fileMustExist: true,
})
database.pragma('query_only = ON')

parentPort?.on('message', (message: { id: number; sql: string; maxRows: number }) => {
  try {
    const result = runReadOnlyQuery(database, message.sql, message.maxRows)
    parentPort?.postMessage({ id: message.id, result })
  } catch (error) {
    parentPort?.postMessage({
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
