import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'path'
import { app } from 'electron'
import * as schema from './schema'

function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'fastfood.db')
}

let sqlite: Database.Database | null = null
let db: ReturnType<typeof drizzle<typeof schema>> | null = null

// Single shared connection for the whole main-process lifetime.
// Migrations, seeding and IPC handlers all operate on the same database handle.
export function getSqlite(): Database.Database {
  if (!sqlite) {
    sqlite = new Database(getDbPath())
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
  }
  return sqlite
}

export function getDb() {
  if (!db) {
    db = drizzle(getSqlite(), { schema })
  }
  return db
}