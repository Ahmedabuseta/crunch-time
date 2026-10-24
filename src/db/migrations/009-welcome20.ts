import type Database from 'better-sqlite3'
import type { Migration } from './types'

// WELCOME20 is the standard 20% welcome coupon. Fresh installs receive it from
// seedDatabase(); this backfills databases created before the code existed so
// the coupon validates on already-running shops too.
export const migration: Migration = {
  id: '009-welcome20',
  up(db: Database.Database) {
    const exists = db.prepare("SELECT 1 FROM discount_codes WHERE UPPER(code) = 'WELCOME20'").get()
    if (exists) return
    db.prepare(
      'INSERT INTO discount_codes (id, code, type, value, active, max_uses, used_count) VALUES (?, ?, ?, ?, 1, ?, 0)'
    ).run('disc-welcome-20', 'WELCOME20', 'percentage', 20, 100)
  },
}
