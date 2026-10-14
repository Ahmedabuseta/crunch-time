import type Database from 'better-sqlite3'
import type { Migration } from './types'

// Audit log for sensitive operations: refunds/voids, drawer corrections,
// shift close and settings changes. user_id is nullable (a phone action has no
// desktop user — the device_label identifies the phone instead), and ref_id
// columns are free text so no FK can block an audit write.
export const migration: Migration = {
  id: '008-audit-log',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        device_label TEXT,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        before TEXT,
        after TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at);
      CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log(entity, entity_id);
    `)
  },
}
