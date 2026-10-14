import { getSqlite } from './client'
import { migration as usersMigration } from './migrations/001-users'
import { migration as catalogMigration } from './migrations/002-catalog'
import { migration as operationsMigration } from './migrations/003-operations'
import { migration as inventoryMigration } from './migrations/004-inventory'
import { migration as supportingMigration } from './migrations/005-supporting'
import { migration as employeeDiscountMigration } from './migrations/006-employee-discount'
import { migration as idempotencyKeysMigration } from './migrations/007-idempotency-keys'
import type { Migration } from './migrations/types'

function ensureColumn(db: import('better-sqlite3').Database, table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

// Backfills that link child rows to parent rows (addons, modifiers, products)
// must not run before those parents exist. The parents are created by
// seedDatabase(), which runs *after* migrations, so on a fresh install they are
// still missing — and `INSERT OR IGNORE` does not suppress FOREIGN KEY
// violations, only UNIQUE/NOT NULL/CHECK ones. The statement therefore aborted
// runMigrations(), initBackend() never reached its ipcMain.handle registrations,
// and the app started up showing the login screen with no user cards.
//
// Skipping is safe: seedDatabase() inserts these same rows itself on a new
// database, while existing databases retain their already-linked rows.
function backfillForExistingParents(
  db: import('better-sqlite3').Database,
  parentTable: string,
  parentIds: string[],
  sql: string,
) {
  const marks = parentIds.map(() => '?').join(', ')
  const found = db.prepare(`SELECT COUNT(*) AS c FROM ${parentTable} WHERE id IN (${marks})`).get(...parentIds) as { c: number }
  if (found.c === 0) return
  try {
    db.exec(sql)
  } catch (error) {
    // A previous startup may have stopped after creating the parent rows but
    // before the seed created their ingredients. Leave the backfill pending;
    // the next startup will retry it after seedDatabase() has completed.
    if (error instanceof Error && error.message.includes('FOREIGN KEY constraint failed')) return
    throw error
  }
}

export function runMigrations() {
  const db = getSqlite()

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const migrations: Migration[] = [
    usersMigration,
    catalogMigration,
    operationsMigration,
    inventoryMigration,
    supportingMigration,
    employeeDiscountMigration,
    idempotencyKeysMigration,
  ]
  const applied = db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]
  const appliedIds = new Set(applied.map(({ id }) => id))
  const recordMigration = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue
    const apply = db.transaction(() => {
      migration.up(db)
      recordMigration.run(migration.id, new Date().toISOString())
    })
    apply()
  }

  // Keep this legacy block for one release so databases created by older
  // versions receive the same IF NOT EXISTS protections before backfills run.
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
  ensureColumn(db, 'orders', 'delivery_profile_id', 'TEXT')
  ensureColumn(db, 'orders', 'delivery_profile_name', 'TEXT')
  ensureColumn(db, 'orders', 'driver_status', 'TEXT')
  // Place historical delivery orders into the right bucket: a driver already
  // on the order means it was assigned, otherwise it still needs one.
  db.prepare(`UPDATE orders SET driver_status = CASE WHEN delivery_profile_id IS NULL THEN 'unassigned' ELSE 'assigned' END WHERE order_type = 'delivery' AND driver_status IS NULL`).run()
  ensureColumn(db, 'settings', 'receipt_printer', 'TEXT')
  ensureColumn(db, 'settings', 'receipt_width', "TEXT NOT NULL DEFAULT '80mm'")
  ensureColumn(db, 'settings', 'auto_print_receipt', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'settings', 'auto_print_kitchen', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'settings', 'kitchen_copies', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'settings', 'receipt_copies', 'INTEGER NOT NULL DEFAULT 1')
  // Receipt branding — professional letterhead/footer, filled by the admin
  ensureColumn(db, 'settings', 'store_tagline', 'TEXT')
  ensureColumn(db, 'settings', 'store_logo', 'TEXT')
  ensureColumn(db, 'settings', 'store_phone', 'TEXT')
  ensureColumn(db, 'settings', 'store_phone2', 'TEXT')
  ensureColumn(db, 'settings', 'store_address', 'TEXT')
  ensureColumn(db, 'settings', 'tax_number', 'TEXT')
  ensureColumn(db, 'settings', 'vat_number', 'TEXT')
  ensureColumn(db, 'settings', 'receipt_footer', "TEXT NOT NULL DEFAULT 'شكراً لزيارتكم'")
  ensureColumn(db, 'settings', 'receipt_terms', 'TEXT')
  ensureColumn(db, 'settings', 'receipt_social', 'TEXT')
  ensureColumn(db, 'settings', 'currency_label', "TEXT NOT NULL DEFAULT 'ج.م'")
  ensureColumn(db, 'settings', 'show_logo', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'settings', 'show_cashier', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'settings', 'show_order_id', 'INTEGER NOT NULL DEFAULT 1')
  ensureColumn(db, 'settings', 'show_tax', 'INTEGER NOT NULL DEFAULT 1')
  // Remote POS server settings (owner's phone app)
  ensureColumn(db, 'settings', 'remote_enabled', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn(db, 'settings', 'remote_port', 'INTEGER NOT NULL DEFAULT 4317')
  ensureColumn(db, 'settings', 'remote_pin_hash', 'TEXT')
  ensureColumn(db, 'settings', 'remote_secret', 'TEXT')
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
  ensureColumn(db, 'ingredients', 'purchase_qty', 'REAL NOT NULL DEFAULT 1')
  // Existing bulk items keep the migration default (1), which
  // would still show per-gram prices. Bulk is bought in 1kg
  // packages, so backfill gram items to 1000. Idempotent —
  // only touches items still at the default; a package size
  // the owner set explicitly is left alone. cost_per_unit is
  // never changed, only how the price is presented.
  db.prepare(`UPDATE ingredients SET purchase_qty = 1000 WHERE unit = 'g' AND purchase_qty = 1`).run()
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
    const insZone = db.prepare('INSERT OR IGNORE INTO delivery_zones (id, name, fee, sort_order, active) VALUES (?, ?, ?, ?, 1)')
    for (const [id, name, fee, sort] of seedZones) insZone.run(id, name, fee, sort)
  }

  // ─── Seed default kitchen stations (ready before printers exist) ──
  const stationCount = (db.prepare('SELECT COUNT(*) AS c FROM kitchen_stations').get() as { c: number }).c
  if (stationCount === 0) {
    const insStation = db.prepare('INSERT OR IGNORE INTO kitchen_stations (id, name, printer_name, paper_width, sort_order, active) VALUES (?, ?, NULL, ?, ?, 1)')
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

  // ─── Backfill legacy ingredients ───────────────────────────
  // (removed — the seed covers bbq / hot-sauce / ranch with
  // real data. This backfill ran *before* the seed on a fresh
  // install, so its stale rows won the INSERT OR IGNORE and
  // the seed's real stock/costs were skipped.)

  // ─── Backfill addon + modifier recipes ──────
  // Guarded separately: addon_recipes needs addons, modifier_recipes needs
  // modifiers, and on a fresh install neither table has rows yet. Ingredients
  // match the current stock list so no recipe can dangle.
  backfillForExistingParents(db, 'addons', [
    'addon-cheese', 'addon-mozz', 'addon-sauce', 'addon-garlic', 'addon-ketchup',
    'addon-fries', 'addon-drink', 'addon-coleslaw', 'addon-pickle',
  ], `
    INSERT OR IGNORE INTO addon_recipes (id, addon_id, ingredient_id, quantity_per_unit) VALUES
      ('ar1', 'addon-cheese', 'ing-cheddar', 20),
      ('ar2', 'addon-mozz', 'ing-mozzarella', 25),
      ('ar3', 'addon-sauce', 'ing-mayo', 15),
      ('ar4', 'addon-garlic', 'ing-hot-sauce', 15),
      ('ar5', 'addon-ketchup', 'ing-ketchup', 1),
      ('ar6', 'addon-fries', 'ing-crispy-potato', 100),
      ('ar7', 'addon-drink', 'ing-tatj', 1),
      ('ar8', 'addon-coleslaw', 'ing-mustard', 15),
      ('ar9', 'addon-pickle', 'ing-spices', 10)
  `)

  backfillForExistingParents(db, 'modifiers', [
    'mod-size-large', 'mod-size-xl', 'mod-sauce-ketchup', 'mod-sauce-mayo',
    'mod-sauce-garlic', 'mod-sauce-ranch', 'mod-sauce-bbq', 'mod-sauce-spicy',
  ], `
    INSERT OR IGNORE INTO modifier_recipes (id, modifier_id, ingredient_id, quantity_per_unit) VALUES
      ('mr1', 'mod-size-large', 'ing-crispy-potato', 40),
      ('mr2', 'mod-size-large', 'ing-mozzarella', 20),
      ('mr3', 'mod-size-xl', 'ing-crispy-potato', 80),
      ('mr4', 'mod-size-xl', 'ing-mozzarella', 35),
      ('mr5', 'mod-sauce-ketchup', 'ing-ketchup', 1),
      ('mr6', 'mod-sauce-mayo', 'ing-mayo', 15),
      ('mr7', 'mod-sauce-garlic', 'ing-hot-sauce', 15),
      ('mr8', 'mod-sauce-ranch', 'ing-ranch', 15),
      ('mr9', 'mod-sauce-bbq', 'ing-bbq', 15),
      ('mr10', 'mod-sauce-spicy', 'ing-hot-sauce', 15)
  `)

  // ─── Product recipes ────────────────────────────────────────
  // Not backfilled here on purpose. Recipe IDs are product IDs, and the retired
  // demo menu reused ids like 'm1' / 'd1' for products that now mean something
  // entirely different (برجر, ليمون نعناع). Backfilling old recipes would attach
  // them to the wrong dish. seedDatabase writes the current recipes instead.

  // ─── Retired demo-menu backfills ───────────────────────────
  // Everything below this point targeted earlier demo menus (a flour/milk/eggs
  // crepe base, products b1–b4 / p1–p4 / s1–s4, addons like 'addon-bacon').
  // Those ids either no longer exist or now name different products, so the
  // backfills can only attach the wrong data. seedDatabase owns recipes,
  // product↔addon links and product costs for the current menu.

  // ─── Recompute product costs for whatever recipes exist ────
  // Still valuable: runs after any seed so cost_price reflects current recipes.
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
  const allProductIds = db.prepare('SELECT id FROM products').all() as { id: string }[]
  for (const { id } of allProductIds) {
    updateCost.run((recomputeCost.get(id, id) as { c: number }).c, id)
  }
}