import type Database from 'better-sqlite3'
import type { Migration } from './types'

export const migration: Migration = {
  id: '002-catalog',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL, color TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id), emoji TEXT NOT NULL,
        description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS addons (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, emoji TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS modifier_groups (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS modifiers (
        id TEXT PRIMARY KEY, modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id),
        name TEXT NOT NULL, price_adjustment REAL NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS product_addons (
        product_id TEXT NOT NULL REFERENCES products(id), addon_id TEXT NOT NULL REFERENCES addons(id),
        PRIMARY KEY (product_id, addon_id)
      );
      CREATE TABLE IF NOT EXISTS product_modifier_groups (
        product_id TEXT NOT NULL REFERENCES products(id),
        modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id),
        PRIMARY KEY (product_id, modifier_group_id)
      );
    `)
  },
}
