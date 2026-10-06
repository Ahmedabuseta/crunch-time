import type Database from 'better-sqlite3'
import type { Migration } from './types'

export const migration: Migration = {
  id: '003-operations',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY, number INTEGER NOT NULL DEFAULT 0,
        user_id TEXT NOT NULL REFERENCES users(id), started_at TEXT NOT NULL, ended_at TEXT,
        opening_cash REAL NOT NULL, closing_cash REAL, status TEXT NOT NULL DEFAULT 'open'
      );
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'COMPLETED',
        order_type TEXT NOT NULL, table_number TEXT, delivery_address TEXT, delivery_phone TEXT,
        subtotal REAL NOT NULL, tax REAL NOT NULL, delivery_fee REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL, user_id TEXT REFERENCES users(id), shift_id TEXT REFERENCES shifts(id),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
        product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL, selected_modifiers_json TEXT, selected_addons_json TEXT
      );
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), method TEXT NOT NULL,
        amount REAL NOT NULL, reference TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cash_movements (
        id TEXT PRIMARY KEY, shift_id TEXT NOT NULL REFERENCES shifts(id), type TEXT NOT NULL,
        amount REAL NOT NULL, note TEXT, created_at TEXT NOT NULL
      );
    `)
  },
}
