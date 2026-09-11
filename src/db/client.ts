import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'path'
import { app } from 'electron'
import * as schema from './schema'

function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'fastfood.db')
}

let db: ReturnType<typeof drizzle<typeof schema>>

export function getDb() {
  if (!db) {
    const sqlite = new Database(getDbPath())
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    db = drizzle(sqlite, { schema })
  }
  return db
}

export function getSqlite(): Database.Database {
  const sqlite = new Database(getDbPath())
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return sqlite
}
