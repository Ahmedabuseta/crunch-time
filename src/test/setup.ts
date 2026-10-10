import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'

const {
  categories, products, addons,
  modifierGroups, modifiers, productModifierGroups,
  users, deliveryZones,
  ingredients, recipes,
} = schema

export function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })

  // Run migrations inline
  sqlite.exec(`
    CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id), emoji TEXT NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, cost_price REAL NOT NULL DEFAULT 0, supports_rollback INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE addons (id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, emoji TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, supports_rollback INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE product_addons (product_id TEXT NOT NULL REFERENCES products(id), addon_id TEXT NOT NULL REFERENCES addons(id), PRIMARY KEY (product_id, addon_id));
    CREATE TABLE modifier_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE modifiers (id TEXT PRIMARY KEY, modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id), name TEXT NOT NULL, price_adjustment REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE product_modifier_groups (product_id TEXT NOT NULL REFERENCES products(id), modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id), PRIMARY KEY (product_id, modifier_group_id));
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, pin_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'cashier', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, hourly_rate REAL NOT NULL DEFAULT 0, commission_rate REAL NOT NULL DEFAULT 0);
    CREATE TABLE shifts (id TEXT PRIMARY KEY, number INTEGER NOT NULL DEFAULT 0, user_id TEXT NOT NULL REFERENCES users(id), started_at TEXT NOT NULL, ended_at TEXT, opening_cash REAL NOT NULL, closing_cash REAL, status TEXT NOT NULL DEFAULT 'open');
    CREATE TABLE orders (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'DRAFT', order_type TEXT NOT NULL, table_number TEXT, customer_name TEXT, customer_phone TEXT, customer_address TEXT, delivery_address TEXT, delivery_phone TEXT, subtotal REAL NOT NULL, tax REAL NOT NULL, delivery_fee REAL NOT NULL DEFAULT 0, delivery_zone_id TEXT, delivery_zone_name TEXT, delivery_note TEXT, delivery_profile_id TEXT, delivery_profile_name TEXT, driver_status TEXT, discount_code TEXT, discount_amount REAL NOT NULL DEFAULT 0, total REAL NOT NULL, payment_type TEXT NOT NULL DEFAULT 'cash', cashier_name TEXT, note TEXT, status_reason TEXT, refunded_amount REAL NOT NULL DEFAULT 0, user_id TEXT REFERENCES users(id), shift_id TEXT REFERENCES shifts(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE delivery_zones (id TEXT PRIMARY KEY, name TEXT NOT NULL, fee REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE kitchen_stations (id TEXT PRIMARY KEY, name TEXT NOT NULL, printer_name TEXT, paper_width TEXT NOT NULL DEFAULT '80mm', sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE station_categories (station_id TEXT NOT NULL, category_id TEXT NOT NULL, PRIMARY KEY (station_id, category_id));
    CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, unit_price REAL NOT NULL, item_discount REAL NOT NULL DEFAULT 0, note TEXT, selected_modifiers_json TEXT, selected_addons_json TEXT);
    CREATE TABLE payments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), method TEXT NOT NULL, amount REAL NOT NULL, reference TEXT, created_at TEXT NOT NULL);
    CREATE TABLE ingredients (id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL, stock_quantity REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0, cost_per_unit REAL NOT NULL DEFAULT 0, purchase_qty REAL NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, supplier TEXT, secondary_supplier TEXT, supplier_ratio REAL NOT NULL DEFAULT 0.7, planned_cost REAL NOT NULL DEFAULT 0);
    CREATE TABLE recipes (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), ingredient_id TEXT REFERENCES ingredients(id), quantity_per_unit REAL NOT NULL, sub_recipe_id TEXT);
    CREATE TABLE addon_recipes (id TEXT PRIMARY KEY, addon_id TEXT NOT NULL, ingredient_id TEXT, quantity_per_unit REAL NOT NULL, sub_recipe_id TEXT);
    CREATE TABLE modifier_recipes (id TEXT PRIMARY KEY, modifier_id TEXT NOT NULL, ingredient_id TEXT, quantity_per_unit REAL NOT NULL, sub_recipe_id TEXT);
    CREATE TABLE sub_recipes (id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'وحدة', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE sub_recipe_ingredients (id TEXT PRIMARY KEY, sub_recipe_id TEXT NOT NULL, ingredient_id TEXT NOT NULL, quantity_per_unit REAL NOT NULL);
    CREATE TABLE inventory_transactions (id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL REFERENCES ingredients(id), type TEXT NOT NULL, quantity REAL NOT NULL, unit_cost REAL, supplier TEXT, reference_order_id TEXT REFERENCES orders(id), note TEXT, created_at TEXT NOT NULL);
    CREATE TABLE cash_movements (id TEXT PRIMARY KEY, shift_id TEXT NOT NULL REFERENCES shifts(id), type TEXT NOT NULL, amount REAL NOT NULL, note TEXT, created_at TEXT NOT NULL);
  `)

  return { sqlite, db }
}

export function seedTestData(db: ReturnType<typeof drizzle>) {
  const now = new Date().toISOString()

  // Categories
  const cats = [
    { id: 'cat-burgers', name: 'برجر', emoji: '🍔', color: '#ff6b35', sortOrder: 1 },
    { id: 'cat-pizza', name: 'بيتزا', emoji: '🍕', color: '#ffd166', sortOrder: 2 },
    { id: 'cat-drinks', name: 'مشروبات', emoji: '🥤', color: '#06d6a0', sortOrder: 3 },
  ]
  for (const c of cats) db.insert(categories).values(c).run()

  // Products
  const prods = [
    { id: 'prod-burger', name: 'برجر كلاسيك', price: 85, categoryId: 'cat-burgers', emoji: '🍔', description: 'لحم، خس، طماطم' },
    { id: 'prod-cheese', name: 'برجر جبنة', price: 95, categoryId: 'cat-burgers', emoji: '🧀', description: 'جبنة مزدوجة' },
    { id: 'prod-pizza', name: 'مارغريتا', price: 120, categoryId: 'cat-pizza', emoji: '🍕', description: 'طماطم، موزاريلا' },
    { id: 'prod-cola', name: 'كولا', price: 20, categoryId: 'cat-drinks', emoji: '🥤', description: 'كولا باردة' },
  ]
  for (const p of prods) db.insert(products).values(p).run()

  // Addons
  const addonData = [
    { id: 'addon-cheese', name: 'جبنة إضافية', price: 5, emoji: '🧀' },
    { id: 'addon-fries', name: 'بطاطس زيادة', price: 8, emoji: '🍟' },
  ]
  for (const a of addonData) db.insert(addons).values(a).run()

  // Modifier groups + modifiers
  db.insert(modifierGroups).values({ id: 'grp-size', name: 'الحجم', type: 'single-select', sortOrder: 1 }).run()
  db.insert(modifiers).values({ id: 'mod-regular', modifierGroupId: 'grp-size', name: 'عادي', priceAdjustment: 0, sortOrder: 1 }).run()
  db.insert(modifiers).values({ id: 'mod-large', modifierGroupId: 'grp-size', name: 'كبير', priceAdjustment: 30, sortOrder: 2 }).run()
  db.insert(productModifierGroups).values({ productId: 'prod-burger', modifierGroupId: 'grp-size' }).run()

  // Ingredients
  const ingData = [
    { id: 'ing-beef', name: 'لحم بقري', unit: 'g', stockQuantity: 5000, minStock: 500, costPerUnit: 0.2 },
    { id: 'ing-bread', name: 'خبز', unit: 'pcs', stockQuantity: 100, minStock: 10, costPerUnit: 3 },
    { id: 'ing-cheese', name: 'جبنة', unit: 'g', stockQuantity: 2000, minStock: 200, costPerUnit: 0.1 },
    { id: 'ing-cola', name: 'كولا', unit: 'ml', stockQuantity: 10000, minStock: 1000, costPerUnit: 0.01 },
  ]
  for (const i of ingData) db.insert(ingredients).values(i).run()

  // Recipes
  const recipeData = [
    { id: 'rec-1', productId: 'prod-burger', ingredientId: 'ing-beef', quantityPerUnit: 150 },
    { id: 'rec-2', productId: 'prod-burger', ingredientId: 'ing-bread', quantityPerUnit: 1 },
    { id: 'rec-3', productId: 'prod-cheese', ingredientId: 'ing-beef', quantityPerUnit: 150 },
    { id: 'rec-4', productId: 'prod-cheese', ingredientId: 'ing-bread', quantityPerUnit: 1 },
    { id: 'rec-5', productId: 'prod-cheese', ingredientId: 'ing-cheese', quantityPerUnit: 40 },
    { id: 'rec-6', productId: 'prod-cola', ingredientId: 'ing-cola', quantityPerUnit: 330 },
  ]
  for (const r of recipeData) db.insert(recipes).values(r).run()

  // Admin user (PIN: 1234 — pre-hashed for test speed)
  // argon2id hash of "1234"
  db.insert(users).values({
    id: 'user-admin',
    name: 'مدير',
    pinHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder', // will be replaced in actual tests
    role: 'admin',
    active: true,
    createdAt: now,
  }).run()

  // Delivery zones
  db.insert(deliveryZones).values({ id: 'dz-near', name: 'قريب', fee: 25, sortOrder: 0 }).run()
  db.insert(deliveryZones).values({ id: 'dz-mid', name: 'متوسط', fee: 35, sortOrder: 1 }).run()
  db.insert(deliveryZones).values({ id: 'dz-far', name: 'بعيد', fee: 45, sortOrder: 2 }).run()

  return { cats, prods, addonData }
}

// Helper: create a real argon2 hash for tests
import argon2 from 'argon2'

export async function createUserWithPin(db: ReturnType<typeof drizzle>, id: string, name: string, pin: string, role: 'admin' | 'cashier' = 'cashier') {
  const hash = await argon2.hash(pin)
  db.insert(users).values({ id, name, pinHash: hash, role, active: true, createdAt: new Date().toISOString() }).run()
}
