import { getSqlite } from './client'

function ensureColumn(db: import('better-sqlite3').Database, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function runMigrations() {
  const db = getSqlite()

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      emoji TEXT NOT NULL,
      description TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS addons (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      emoji TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS product_addons (
      product_id TEXT NOT NULL REFERENCES products(id),
      addon_id TEXT NOT NULL REFERENCES addons(id),
      PRIMARY KEY (product_id, addon_id)
    );

    CREATE TABLE IF NOT EXISTS modifier_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS modifiers (
      id TEXT PRIMARY KEY,
      modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id),
      name TEXT NOT NULL,
      price_adjustment REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS product_modifier_groups (
      product_id TEXT NOT NULL REFERENCES products(id),
      modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id),
      PRIMARY KEY (product_id, modifier_group_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL DEFAULT 0,
      user_id TEXT NOT NULL REFERENCES users(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      opening_cash REAL NOT NULL,
      closing_cash REAL,
      status TEXT NOT NULL DEFAULT 'open'
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      order_type TEXT NOT NULL,
      table_number TEXT,
      delivery_address TEXT,
      delivery_phone TEXT,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL,
      delivery_fee REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      user_id TEXT REFERENCES users(id),
      shift_id TEXT REFERENCES shifts(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      selected_modifiers_json TEXT,
      selected_addons_json TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      reference TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      stock_quantity REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      cost_per_unit REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      quantity_per_unit REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sub_recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'وحدة',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sub_recipe_ingredients (
      id TEXT PRIMARY KEY,
      sub_recipe_id TEXT NOT NULL REFERENCES sub_recipes(id),
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      quantity_per_unit REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY,
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      reference_order_id TEXT REFERENCES orders(id),
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_price_history (
      id TEXT PRIMARY KEY,
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      supplier TEXT,
      unit_cost REAL NOT NULL,
      quantity REAL NOT NULL,
      purchased_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cash_movements (
      id TEXT PRIMARY KEY,
      shift_id TEXT NOT NULL REFERENCES shifts(id),
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      delivery_fee REAL NOT NULL DEFAULT 25,
      tax_rate REAL NOT NULL DEFAULT 0.14,
      restaurant_name TEXT NOT NULL DEFAULT 'فاست فود',
      currency TEXT NOT NULL DEFAULT 'EGP'
    );

    CREATE TABLE IF NOT EXISTS kitchen_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      printer_name TEXT,
      paper_width TEXT NOT NULL DEFAULT '80mm',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS station_categories (
      station_id TEXT NOT NULL REFERENCES kitchen_stations(id),
      category_id TEXT NOT NULL REFERENCES categories(id),
      PRIMARY KEY (station_id, category_id)
    );

    CREATE TABLE IF NOT EXISTS discount_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      max_uses INTEGER NOT NULL DEFAULT 0,
      used_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS delivery_zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS delivery_zones_sort_idx ON delivery_zones(sort_order);

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'monthly',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS addon_recipes (
      id TEXT PRIMARY KEY,
      addon_id TEXT NOT NULL REFERENCES addons(id),
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      quantity_per_unit REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modifier_recipes (
      id TEXT PRIMARY KEY,
      modifier_id TEXT NOT NULL REFERENCES modifiers(id),
      ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
      quantity_per_unit REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT,
      address TEXT,
      order_count INTEGER NOT NULL DEFAULT 0,
      last_order_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers(phone);
    CREATE INDEX IF NOT EXISTS inventory_transactions_ingredient_idx ON inventory_transactions(ingredient_id, created_at);
    CREATE INDEX IF NOT EXISTS inventory_transactions_created_idx ON inventory_transactions(created_at);
  `)

  // ─── Backfill columns added after the initial schema ────────
  ensureColumn(db, 'products', 'cost_price', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'products', 'supports_rollback', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'addons', 'supports_rollback', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'orders', 'customer_name', 'TEXT')
  ensureColumn(db, 'orders', 'customer_phone', 'TEXT')
  ensureColumn(db, 'orders', 'customer_address', 'TEXT')
  ensureColumn(db, 'orders', 'discount_code', 'TEXT')
  ensureColumn(db, 'orders', 'discount_amount', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'orders', 'payment_type', "TEXT NOT NULL DEFAULT 'cash'")
  ensureColumn(db, 'orders', 'cashier_name', 'TEXT')
  ensureColumn(db, 'orders', 'note', 'TEXT')
  ensureColumn(db, 'orders', 'delivery_zone_id', 'TEXT')
  ensureColumn(db, 'orders', 'delivery_zone_name', 'TEXT')
  ensureColumn(db, 'orders', 'delivery_note', 'TEXT')
  ensureColumn(db, 'settings', 'receipt_printer', 'TEXT')
  ensureColumn(db, 'settings', 'receipt_width', "TEXT NOT NULL DEFAULT '80mm'")
  ensureColumn(db, 'settings', 'auto_print_receipt', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'settings', 'auto_print_kitchen', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'settings', 'kitchen_copies', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'orders', 'status_reason', 'TEXT')
  ensureColumn(db, 'orders', 'refunded_amount', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'order_items', 'item_discount', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'order_items', 'note', 'TEXT')
  ensureColumn(db, 'users', 'hourly_rate', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'users', 'commission_rate', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'ingredients', 'supplier', 'TEXT')
  ensureColumn(db, 'ingredients', 'secondary_supplier', 'TEXT')
  ensureColumn(db, 'ingredients', 'supplier_ratio', 'REAL NOT NULL DEFAULT 0.7')
  ensureColumn(db, 'ingredients', 'planned_cost', 'REAL NOT NULL DEFAULT 0')
  ensureColumn(db, 'recipes', 'sub_recipe_id', 'TEXT')
  ensureColumn(db, 'addon_recipes', 'sub_recipe_id', 'TEXT')
  ensureColumn(db, 'modifier_recipes', 'sub_recipe_id', 'TEXT')

  // ─── Rebuild recipe tables so ingredient_id is nullable ──────────
  // Sub-recipe rows reference a sub_recipe instead of a raw ingredient,
  // so ingredient_id must accept NULL. SQLite cannot ALTER a NOT NULL
  // constraint off, so rebuild each table once (no-op afterwards).
  const rebuildNullableIngredient = (table: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[]
    const ing = cols.find((c) => c.name === 'ingredient_id')
    if (!ing || ing.notnull !== 1) return
    const entityCol = table === 'recipes' ? 'product_id' : table === 'addon_recipes' ? 'addon_id' : 'modifier_id'
    const entityRef = table === 'recipes' ? 'products' : table === 'addon_recipes' ? 'addons' : 'modifiers'
    const tmp = `${table}__tmp`
    db.exec(`
      CREATE TABLE ${tmp} (
        id TEXT PRIMARY KEY,
        ${entityCol} TEXT NOT NULL REFERENCES ${entityRef}(id),
        ingredient_id TEXT REFERENCES ingredients(id),
        quantity_per_unit REAL NOT NULL,
        sub_recipe_id TEXT REFERENCES sub_recipes(id)
      );
      INSERT INTO ${tmp} (id, ${entityCol}, ingredient_id, quantity_per_unit, sub_recipe_id)
        SELECT id, ${entityCol}, ingredient_id, quantity_per_unit, sub_recipe_id FROM ${table};
      DROP TABLE ${table};
      ALTER TABLE ${tmp} RENAME TO ${table};
    `)
  }
  rebuildNullableIngredient('recipes')
  rebuildNullableIngredient('addon_recipes')
  rebuildNullableIngredient('modifier_recipes')
  ensureColumn(db, 'inventory_transactions', 'unit_cost', 'REAL')
  ensureColumn(db, 'inventory_transactions', 'supplier', 'TEXT')
  ensureColumn(db, 'shifts', 'number', 'INTEGER NOT NULL DEFAULT 0')
  db.exec(`
    UPDATE shifts
    SET number = (
      SELECT rn FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY started_at, id) AS rn
        FROM shifts
      ) ranked
      WHERE ranked.id = shifts.id
    )
    WHERE number IS NULL OR number = 0
  `)

  // ─── Backfill purchase price history from past restocks ─────
  // Populates the PPV report for purchases recorded before the
  // purchase_price_history table existed (or before unit cost was captured).
  db.exec(`
    INSERT OR IGNORE INTO purchase_price_history
      (id, ingredient_id, supplier, unit_cost, quantity, purchased_at, created_at)
    SELECT
      'pph-' || t.id,
      t.ingredient_id,
      COALESCE(t.supplier, i.supplier),
      COALESCE(t.unit_cost, i.cost_per_unit),
      t.quantity,
      substr(t.created_at, 1, 10),
      t.created_at
    FROM inventory_transactions t
    JOIN ingredients i ON i.id = t.ingredient_id
    WHERE t.type = 'PURCHASE'
      AND t.quantity != 0
      AND COALESCE(t.unit_cost, i.cost_per_unit) > 0
  `)

  // ─── Seed default delivery zones (from legacy fixed fee) ──
  const zoneCount = (db.prepare('SELECT COUNT(*) AS c FROM delivery_zones').get() as { c: number }).c
  if (zoneCount === 0) {
    const legacyFee = (db.prepare('SELECT delivery_fee AS fee FROM settings WHERE id = ?').get('settings') as { fee?: number } | undefined)?.fee ?? 25
    const seedZones: [string, string, number, number][] = [
      ['dz-near', 'قريب', Number(legacyFee) || 25, 0],
      ['dz-mid', 'متوسط', (Number(legacyFee) || 25) + 10, 1],
      ['dz-far', 'بعيد', (Number(legacyFee) || 25) + 20, 2],
    ]
    const insZone = db.prepare('INSERT INTO delivery_zones (id, name, fee, sort_order, active) VALUES (?, ?, ?, ?, 1)')
    for (const [id, name, fee, sort] of seedZones) insZone.run(id, name, fee, sort)
  }

  // ─── Seed default kitchen stations (ready before printers exist) ──
  const stationCount = (db.prepare('SELECT COUNT(*) AS c FROM kitchen_stations').get() as { c: number }).c
  if (stationCount === 0) {
    const insStation = db.prepare('INSERT INTO kitchen_stations (id, name, printer_name, paper_width, sort_order, active) VALUES (?, ?, NULL, ?, ?, 1)')
    insStation.run('st-receipt', 'الكاشير (إيصال)', '80mm', 0)
    insStation.run('st-kitchen-1', 'مطبخ 1', '80mm', 1)
    insStation.run('st-kitchen-2', 'مطبخ 2', '80mm', 2)
  }

  // ─── Backfill customers from existing delivery orders ──────
  db.exec(`
    INSERT OR IGNORE INTO customers (id, phone, name, address, order_count, last_order_at, created_at)
    SELECT
      lower(hex(randomblob(16))),
      customer_phone,
      MAX(customer_name),
      MAX(customer_address),
      COUNT(*),
      MAX(created_at),
      MAX(created_at)
    FROM orders
    WHERE order_type = 'delivery' AND customer_phone IS NOT NULL AND customer_phone != ''
    GROUP BY customer_phone
  `)

  // ─── Backfill sauce/bacon/onion/pickle ingredients ──────
  db.exec(`
    INSERT OR IGNORE INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, active) VALUES
      ('ing-sauce-bbq', 'صوص باربكيو', 'ml', 5000, 500, 0.05, 1),
      ('ing-sauce-garlic', 'صوص ثوم', 'ml', 5000, 500, 0.05, 1),
      ('ing-sauce-spicy', 'صوص حار', 'ml', 5000, 500, 0.06, 1),
      ('ing-bacon', 'بيكون', 'g', 3000, 300, 0.25, 1),
      ('ing-onion', 'بصل', 'g', 4000, 400, 0.02, 1),
      ('ing-pickle', 'مخلل', 'g', 3000, 300, 0.03, 1)
  `)

  // ─── Backfill addon + modifier recipes ──────
  db.exec(`
    INSERT OR IGNORE INTO addon_recipes (id, addon_id, ingredient_id, quantity_per_unit) VALUES
      ('ar1', 'addon-cheese', 'ing-cheese', 20),
      ('ar2', 'addon-mozz', 'ing-mozz', 25),
      ('ar3', 'addon-sauce', 'ing-sauce-bbq', 15),
      ('ar4', 'addon-garlic', 'ing-sauce-garlic', 15),
      ('ar5', 'addon-ketchup', 'ing-sauce-ketchup', 15),
      ('ar6', 'addon-fries', 'ing-potato', 100),
      ('ar7', 'addon-drink', 'ing-cola', 200),
      ('ar8', 'addon-coleslaw', 'ing-lettuce', 50),
      ('ar9', 'addon-pickle', 'ing-pickle', 20);
    INSERT OR IGNORE INTO modifier_recipes (id, modifier_id, ingredient_id, quantity_per_unit) VALUES
      ('mr1', 'mod-size-large', 'ing-flour', 40),
      ('mr2', 'mod-size-large', 'ing-milk', 40),
      ('mr3', 'mod-size-large', 'ing-eggs', 0.5),
      ('mr4', 'mod-size-xl', 'ing-flour', 80),
      ('mr5', 'mod-size-xl', 'ing-milk', 80),
      ('mr6', 'mod-size-xl', 'ing-eggs', 1),
      ('mr7', 'mod-size-xl', 'ing-mozz', 20),
      ('mr8', 'mod-sauce-ketchup', 'ing-sauce-ketchup', 15),
      ('mr9', 'mod-sauce-mayo', 'ing-sauce-mayo', 15),
      ('mr10', 'mod-sauce-garlic', 'ing-sauce-garlic', 15),
      ('mr11', 'mod-sauce-ranch', 'ing-sauce-ranch', 15),
      ('mr12', 'mod-sauce-bbq', 'ing-sauce-bbq', 15),
      ('mr13', 'mod-sauce-spicy', 'ing-sauce-spicy', 15)
  `)

  // ─── Backfill product recipes for products missing them ─────
  const CREPE_BASE: [string, number][] = [['ing-flour', 80], ['ing-milk', 80], ['ing-eggs', 1]]
  const PRODUCT_RECIPES: Record<string, [string, number][]> = {
    cr1: [['ing-chicken-breast', 120], ['ing-mozz', 20], ['ing-lettuce', 20], ['ing-tomato', 30]],
    cr2: [['ing-chicken-breast', 120], ['ing-mozz', 20], ['ing-lettuce', 20]],
    cr3: [['ing-chicken-breast', 130], ['ing-lettuce', 20], ['ing-sauce-ranch', 15]],
    cr4: [['ing-cheese', 60], ['ing-mozz', 30]],
    cr5: [['ing-potato', 150], ['ing-mozz', 15], ['ing-sauce-ketchup', 15]],
    cr6: [['ing-sausage', 80], ['ing-mozz', 15]],
    cr7: [['ing-kofta', 120], ['ing-mozz', 15]],
    cr8: [['ing-chicken-breast', 120], ['ing-mozz', 20], ['ing-sauce-bbq', 15]],
    cr9: [['ing-chicken-breast', 150], ['ing-potato', 100], ['ing-mozz', 30]],
    cr10: [['ing-chicken-breast', 150], ['ing-kofta', 60], ['ing-potato', 80], ['ing-mozz', 30]],
    sw1: [['ing-nutella', 40]],
    sw2: [['ing-nutella', 40], ['ing-banana', 60]],
    sw3: [['ing-nutella', 50], ['ing-banana', 60], ['ing-nuts', 20]],
    p1: [['ing-dough', 1], ['ing-mozz', 80], ['ing-tomato', 60]],
    p2: [['ing-dough', 1], ['ing-mozz', 80], ['ing-tomato', 60], ['ing-pepperoni', 50]],
    p3: [['ing-dough', 1], ['ing-mozz', 80], ['ing-chicken-breast', 100], ['ing-sauce-bbq', 20]],
    p4: [['ing-dough', 1], ['ing-mozz', 60], ['ing-tomato', 40], ['ing-lettuce', 30], ['ing-onion', 30]],
    m1: [['ing-chicken-breast', 150], ['ing-mozz', 30], ['ing-potato', 150], ['ing-bread', 1]],
    m2: [['ing-chicken-breast', 150], ['ing-potato', 150], ['ing-lettuce', 30], ['ing-bread', 1]],
    m3: [['ing-chicken-breast', 150], ['ing-potato', 150], ['ing-bread', 1], ['ing-sauce-garlic', 15]],
    m4: [['ing-chicken-breast', 120], ['ing-potato', 150], ['ing-lettuce', 20]],
    d1: [['ing-cola', 330]], d2: [['ing-lemon', 80]], d3: [['ing-milk', 250]],
    d4: [['ing-tea', 5]], d5: [['ing-mango', 150]], d6: [['ing-strawberry', 150]],
  }
  const crepeIds = ['cr1', 'cr2', 'cr3', 'cr4', 'cr5', 'cr6', 'cr7', 'cr8', 'cr9', 'cr10', 'sw1', 'sw2', 'sw3']
  const insertProdRecipe = db.prepare('INSERT OR IGNORE INTO recipes (id, product_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)')
  const recipeCount = db.prepare('SELECT COUNT(*) AS c FROM recipes WHERE product_id = ?')
  for (const pid of [...crepeIds, 'p1', 'p2', 'p3', 'p4', 'm1', 'm2', 'm3', 'm4', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6']) {
    const filled = crepeIds.includes(pid) ? [...CREPE_BASE, ...(PRODUCT_RECIPES[pid] ?? [])] : [...(PRODUCT_RECIPES[pid] ?? [])]
    if ((recipeCount.get(pid) as { c: number }).c > 0) continue
    filled.forEach(([iid, qty], idx) => insertProdRecipe.run(`mig-rec-${pid}-${idx}`, pid, iid, qty))
  }

  // ─── Backfill seed sub-recipe (عجينة الكريب) ──────
  db.exec(`
    INSERT OR IGNORE INTO sub_recipes (id, name, unit, active, created_at) VALUES
      ('sub-rec-crepe', 'عجينة الكريب', 'وحدة', 1, datetime('now'));
    INSERT OR IGNORE INTO sub_recipe_ingredients (id, sub_recipe_id, ingredient_id, quantity_per_unit) VALUES
      ('sri-crepe-flour', 'sub-rec-crepe', 'ing-flour', 80),
      ('sri-crepe-milk', 'sub-rec-crepe', 'ing-milk', 80),
      ('sri-crepe-eggs', 'sub-rec-crepe', 'ing-eggs', 1)
  `)

  // ─── Convert crepe-base rows + size modifiers to use the sub-recipe ──
  // Only rewrites the flour/milk/eggs trio while it is still in its original
  // seeded quantities, so recipes the user already edited are never touched.
  // The trio becomes a "عجينة الكريب" sub-recipe row; extra topping rows are
  // left untouched and still count towards the product's cost.
  const baseRowsOf = (table: string, entityCol: string, entityId: string) =>
    db.prepare(
      `SELECT id, ingredient_id AS ingredientId, quantity_per_unit AS qty
       FROM ${table} WHERE ${entityCol} = ? AND sub_recipe_id IS NULL`,
    ).all(entityId) as { id: string; ingredientId: string; qty: number }[]

  const attachSubRecipe = (table: string, entityCol: string, entityId: string, subQty: number, expected: Record<string, number>) => {
    const rows = baseRowsOf(table, entityCol, entityId)
    const byKey = new Map(rows.map((r) => [r.ingredientId, r]))
    for (const [iid, qty] of Object.entries(expected)) {
      const r = byKey.get(iid)
      if (!r || r.qty !== qty) return
    }
    const existing = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${entityCol} = ? AND sub_recipe_id = 'sub-rec-crepe'`).get(entityId) as { c: number }
    if (existing.c > 0) return
    db.prepare(`INSERT INTO ${table} (id, ${entityCol}, sub_recipe_id, quantity_per_unit) VALUES (?, ?, 'sub-rec-crepe', ?)`).run(`mig-sr-${table}-${entityId}`, entityId, subQty)
    for (const iid of Object.keys(expected)) db.prepare(`DELETE FROM ${table} WHERE id = ?`).run((byKey.get(iid) as { id: string }).id)
  }

  const CREPE_BASE_EXPECTED: Record<string, number> = { 'ing-flour': 80, 'ing-milk': 80, 'ing-eggs': 1 }
  for (const pid of crepeIds) {
    attachSubRecipe('recipes', 'product_id', pid, 1, CREPE_BASE_EXPECTED)
  }
  attachSubRecipe('modifier_recipes', 'modifier_id', 'mod-size-large', 0.5, { 'ing-flour': 40, 'ing-milk': 40, 'ing-eggs': 0.5 })
  attachSubRecipe('modifier_recipes', 'modifier_id', 'mod-size-xl', 1, CREPE_BASE_EXPECTED)

  // ─── Recompute product costs after sub-recipe conversion ──
  const recomputeCost = db.prepare(`
    SELECT COALESCE(SUM(c), 0) AS c FROM (
      SELECT r.quantity_per_unit * i.cost_per_unit AS c
      FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.product_id = ? AND r.ingredient_id IS NOT NULL
      UNION ALL
      SELECT r.quantity_per_unit * sri.quantity_per_unit * i.cost_per_unit AS c
      FROM recipes r
      JOIN sub_recipe_ingredients sri ON sri.sub_recipe_id = r.sub_recipe_id
      JOIN ingredients i ON i.id = sri.ingredient_id
      WHERE r.product_id = ?
    )
  `)
  const updateCost = db.prepare('UPDATE products SET cost_price = ? WHERE id = ?')
  for (const pid of crepeIds) {
    updateCost.run((recomputeCost.get(pid, pid) as { c: number }).c, pid)
  }

  // ─── Backfill product-addon links ──────
  db.exec(`
    INSERT OR IGNORE INTO product_addons (product_id, addon_id)
    SELECT p.id, a.id FROM products p, addons a
    WHERE p.id IN ('b1','b2','b3','b4')
      AND a.id IN ('addon-cheese','addon-bacon','addon-sauce','addon-fries','addon-drink','addon-onion','addon-coleslaw','addon-pickle');
    INSERT OR IGNORE INTO product_addons (product_id, addon_id)
    SELECT p.id, a.id FROM products p, addons a
    WHERE p.id IN ('p1','p2','p3','p4')
      AND a.id IN ('addon-cheese','addon-sauce','addon-drink','addon-coleslaw');
    INSERT OR IGNORE INTO product_addons (product_id, addon_id)
    SELECT p.id, a.id FROM products p, addons a
    WHERE p.id IN ('c1','c2','c3')
      AND a.id IN ('addon-sauce','addon-fries','addon-drink','addon-coleslaw','addon-pickle');
    INSERT OR IGNORE INTO product_addons (product_id, addon_id)
    SELECT p.id, a.id FROM products p, addons a
    WHERE p.id IN ('s1','s2','s3','s4')
      AND a.id IN ('addon-cheese','addon-sauce','addon-coleslaw')
  `)
}