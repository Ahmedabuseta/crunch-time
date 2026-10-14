import type Database from 'better-sqlite3'
import type { Migration } from './types'

// Idempotency keys for the remote POS server. A phone that retries a sale
// after a dropped connection sends the same key, and the server returns the
// original order instead of ringing up a second one.
export const migration: Migration = {
  id: '007-idempotency-keys',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT 'orders',
        order_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx ON idempotency_keys(created_at);
    `)
  },
}
