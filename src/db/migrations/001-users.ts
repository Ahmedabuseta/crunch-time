import type Database from 'better-sqlite3'
import type { Migration } from './types'

export const migration: Migration = {
  id: '001-users',
  up(db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`)
  },
}
