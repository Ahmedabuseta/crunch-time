import type Database from 'better-sqlite3'
import type { Migration } from './types'

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

// Date-scoped promos, buy-X-get-Y rules, product/category targeting and
// auto-applied offers. Existing rows keep scope 'order', no schedule, and
// auto_apply 0, so their behaviour is unchanged.
export const migration: Migration = {
  id: '013-discount-schedule',
  up(db: Database.Database) {
    ensureColumn(db, 'discount_codes', 'scope', "TEXT NOT NULL DEFAULT 'order'")
    ensureColumn(db, 'discount_codes', 'starts_at', 'TEXT')
    ensureColumn(db, 'discount_codes', 'ends_at', 'TEXT')
    ensureColumn(db, 'discount_codes', 'days_of_week', 'TEXT')
    ensureColumn(db, 'discount_codes', 'start_time', 'TEXT')
    ensureColumn(db, 'discount_codes', 'end_time', 'TEXT')
    ensureColumn(db, 'discount_codes', 'min_subtotal', 'REAL NOT NULL DEFAULT 0')
    ensureColumn(db, 'discount_codes', 'buy_qty', 'INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'discount_codes', 'get_qty', 'INTEGER NOT NULL DEFAULT 0')
    ensureColumn(db, 'discount_codes', 'get_percent', 'REAL NOT NULL DEFAULT 100')
    ensureColumn(db, 'discount_codes', 'auto_apply', 'INTEGER NOT NULL DEFAULT 0')

    db.exec(`
      CREATE TABLE IF NOT EXISTS discount_code_products (
        discount_code_id TEXT NOT NULL REFERENCES discount_codes(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        PRIMARY KEY (discount_code_id, product_id)
      );
      CREATE TABLE IF NOT EXISTS discount_code_categories (
        discount_code_id TEXT NOT NULL REFERENCES discount_codes(id),
        category_id TEXT NOT NULL REFERENCES categories(id),
        PRIMARY KEY (discount_code_id, category_id)
      );
      CREATE INDEX IF NOT EXISTS discount_code_products_code_idx ON discount_code_products(discount_code_id);
      CREATE INDEX IF NOT EXISTS discount_code_categories_code_idx ON discount_code_categories(discount_code_id);
    `)
  },
}
