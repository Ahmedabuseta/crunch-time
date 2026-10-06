import type Database from 'better-sqlite3'
import type { Migration } from './types'

export const migration: Migration = {
  id: '004-inventory',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ingredients (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL,
        stock_quantity REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0,
        cost_per_unit REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS sub_recipes (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'وحدة',
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
        ingredient_id TEXT NOT NULL REFERENCES ingredients(id), quantity_per_unit REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sub_recipe_ingredients (
        id TEXT PRIMARY KEY, sub_recipe_id TEXT NOT NULL REFERENCES sub_recipes(id),
        ingredient_id TEXT NOT NULL REFERENCES ingredients(id), quantity_per_unit REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL REFERENCES ingredients(id), type TEXT NOT NULL,
        quantity REAL NOT NULL, reference_order_id TEXT REFERENCES orders(id), note TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS purchase_price_history (
        id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL REFERENCES ingredients(id), supplier TEXT,
        unit_cost REAL NOT NULL, quantity REAL NOT NULL, purchased_at TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS addon_recipes (
        id TEXT PRIMARY KEY, addon_id TEXT NOT NULL REFERENCES addons(id),
        ingredient_id TEXT NOT NULL REFERENCES ingredients(id), quantity_per_unit REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS modifier_recipes (
        id TEXT PRIMARY KEY, modifier_id TEXT NOT NULL REFERENCES modifiers(id),
        ingredient_id TEXT NOT NULL REFERENCES ingredients(id), quantity_per_unit REAL NOT NULL
      );
    `)
  },
}
