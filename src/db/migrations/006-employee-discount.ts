import type Database from 'better-sqlite3'
import type { Migration } from './types'

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

// Employee daily-product discount: a 'daily' code discounts only the
// product-of-the-day picked in discount_day_products, up to daily_uses
// orders per day. Existing rows keep mode 'order' (whole-order coupon).
export const migration: Migration = {
  id: '006-employee-discount',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS discount_day_products (
        id TEXT PRIMARY KEY,
        discount_code_id TEXT NOT NULL REFERENCES discount_codes(id),
        day_of_week INTEGER NOT NULL,
        product_id TEXT NOT NULL REFERENCES products(id),
        UNIQUE (discount_code_id, day_of_week)
      );
      CREATE INDEX IF NOT EXISTS discount_day_products_code_idx ON discount_day_products(discount_code_id);
    `)
    ensureColumn(db, 'discount_codes', 'mode', "TEXT NOT NULL DEFAULT 'order'")
    ensureColumn(db, 'discount_codes', 'daily_uses', 'INTEGER NOT NULL DEFAULT 0')
  },
}
