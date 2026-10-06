import type Database from 'better-sqlite3'
import type { Migration } from './types'

export const migration: Migration = {
  id: '005-supporting',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY, delivery_fee REAL NOT NULL DEFAULT 25, tax_rate REAL NOT NULL DEFAULT 0.14,
        restaurant_name TEXT NOT NULL DEFAULT 'Crunch Time', currency TEXT NOT NULL DEFAULT 'EGP'
      );
      CREATE TABLE IF NOT EXISTS kitchen_stations (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, printer_name TEXT, paper_width TEXT NOT NULL DEFAULT '80mm',
        sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS station_categories (
        station_id TEXT NOT NULL REFERENCES kitchen_stations(id),
        category_id TEXT NOT NULL REFERENCES categories(id), PRIMARY KEY (station_id, category_id)
      );
      CREATE TABLE IF NOT EXISTS discount_codes (
        id TEXT PRIMARY KEY, code TEXT NOT NULL, type TEXT NOT NULL, value REAL NOT NULL,
        active INTEGER NOT NULL DEFAULT 1, max_uses INTEGER NOT NULL DEFAULT 0, used_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS delivery_zones (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, fee REAL NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS delivery_profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL,
        type TEXT NOT NULL DEFAULT 'monthly', active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT, address TEXT,
        order_count INTEGER NOT NULL DEFAULT 0, last_order_at TEXT, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS delivery_zones_sort_idx ON delivery_zones(sort_order);
      CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);
      CREATE INDEX IF NOT EXISTS inventory_transactions_ingredient_idx ON inventory_transactions(ingredient_id, created_at);
      CREATE INDEX IF NOT EXISTS inventory_transactions_created_idx ON inventory_transactions(created_at);
    `)
  },
}
