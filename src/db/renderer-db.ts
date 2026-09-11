import initSqlJs, { type Database } from 'sql.js'

// sql.js database (pure JS, works in browser)
let sqlite: Database

// Helper: convert sql.js results to array of objects
function queryAll(sql: string, params: any[] = []): any[] {
  const stmt = sqlite.prepare(sql)
  stmt.bind(params)
  const results: any[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

function queryOne(sql: string, params: any[] = []): any | null {
  const results = queryAll(sql, params)
  return results.length > 0 ? results[0] : null
}

function run(sql: string, params: any[] = []) {
  sqlite.run(sql, params)
}

function uuid() { return crypto.randomUUID() }
function now() { return new Date().toISOString() }

// ═══════════════════════════════════════════════════════════════
// MIGRATE + SEED
// ═══════════════════════════════════════════════════════════════

function migrate() {
  sqlite.run(`CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, category_id TEXT NOT NULL, emoji TEXT NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS addons (id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, emoji TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS product_addons (product_id TEXT NOT NULL, addon_id TEXT NOT NULL, PRIMARY KEY (product_id, addon_id))`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS modifier_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS modifiers (id TEXT PRIMARY KEY, modifier_group_id TEXT NOT NULL, name TEXT NOT NULL, price_adjustment REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS product_modifier_groups (product_id TEXT NOT NULL, modifier_group_id TEXT NOT NULL, PRIMARY KEY (product_id, modifier_group_id))`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, pin_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'cashier', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, opening_cash REAL NOT NULL, closing_cash REAL, status TEXT NOT NULL DEFAULT 'open')`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'DRAFT', order_type TEXT NOT NULL, table_number TEXT, delivery_address TEXT, delivery_phone TEXT, subtotal REAL NOT NULL, tax REAL NOT NULL, delivery_fee REAL NOT NULL DEFAULT 0, total REAL NOT NULL, user_id TEXT, shift_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, selected_modifiers_json TEXT, selected_addons_json TEXT)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, method TEXT NOT NULL, amount REAL NOT NULL, reference TEXT, created_at TEXT NOT NULL)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS ingredients (id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL, stock_quantity REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0, cost_per_unit REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, ingredient_id TEXT NOT NULL, quantity_per_unit REAL NOT NULL)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS inventory_transactions (id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL, type TEXT NOT NULL, quantity REAL NOT NULL, reference_order_id TEXT, note TEXT, created_at TEXT NOT NULL)`)
  sqlite.run(`CREATE TABLE IF NOT EXISTS cash_movements (id TEXT PRIMARY KEY, shift_id TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, note TEXT, created_at TEXT NOT NULL)`)
}

function seed() {
  const existing = queryOne('SELECT COUNT(*) as count FROM categories')
  if (existing && existing.count > 0) return

  const ts = now()

  // Categories
  for (const c of [
    ['cat-burgers', 'برجر', '🍔', 'var(--cat-burgers)', 1],
    ['cat-pizza', 'بيتزا', '🍕', 'var(--cat-pizza)', 2],
    ['cat-chicken', 'دجاج', '🍗', 'var(--cat-chicken)', 3],
    ['cat-sides', 'أطباق جانبية', '🍟', 'var(--cat-sides)', 4],
    ['cat-drinks', 'مشروبات', '🥤', 'var(--cat-drinks)', 5],
    ['cat-desserts', 'حلويات', '🍦', 'var(--cat-desserts)', 6],
  ]) {
    run('INSERT INTO categories (id, name, emoji, color, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)', c)
  }

  // Products
  for (const p of [
    ['b1', 'برجر كلاسيك', 85, 'cat-burgers', '🍔', 'لحم، خس، طماطم'],
    ['b2', 'برجر جبنة', 95, 'cat-burgers', '🧀', 'جبنة مزدوجة، مخلل، بصل'],
    ['b3', 'برجر بيكون', 110, 'cat-burgers', '🥓', 'بيكون مقرمش، صوص باربكيو'],
    ['b4', 'برجر فطر', 105, 'cat-burgers', '🍄', 'جبنة سويسري، فطر'],
    ['p1', 'مارغريتا', 120, 'cat-pizza', '🍕', 'طماطم، موزاريلا، ريحان'],
    ['p2', 'بيبروني', 145, 'cat-pizza', '🌶️', 'بيبروني مزدوج، موزاريلا'],
    ['p3', 'دجاج باربكيو', 155, 'cat-pizza', '🍗', 'صوص باربكيو، دجاج، بصل أحمر'],
    ['p4', 'خضار', 130, 'cat-pizza', '🥬', 'خضار مشكلة، زيتون، فيتا'],
    ['c1', 'ناجت دجاج (6)', 65, 'cat-chicken', '🍗', 'ناجت ذهبي مقرمش'],
    ['c2', 'أجنحة دجاج (8)', 105, 'cat-chicken', '🍗', 'صوص بوفالو أو باربكيو'],
    ['c3', 'ساندويتش دجاج', 90, 'cat-chicken', '🥪', 'دجاج مقرمش، كول سلو، مخلل'],
    ['s1', 'بطاطس مقلية', 35, 'cat-sides', '🍟', 'بطاطس ذهبية مقرمشة'],
    ['s2', 'حلقات بصل', 45, 'cat-sides', '🧅', 'حلقات بصل مقرمشة'],
    ['s3', 'أصابع موزاريلا', 55, 'cat-sides', '🧀', 'مع صوص مارينارا'],
    ['s4', 'كول سلو', 25, 'cat-sides', '🥗', 'كول سلو كريمي'],
    ['d1', 'كولا', 20, 'cat-drinks', '🥤', 'كولا باردة'],
    ['d2', 'ليمونادة', 25, 'cat-drinks', '🍋', 'ليمون طازج'],
    ['d3', 'ميلك شيك', 50, 'cat-drinks', '🥛', 'فانيليا، شوكولاتة، أو فراولة'],
    ['d4', 'شاي مثلج', 20, 'cat-drinks', '🍵', 'محلى أو بدون سكر'],
    ['e1', 'آيس كريم صنداي', 45, 'cat-desserts', '🍦', '3 سكوب، صوص شوكولاتة، كرز'],
    ['e2', 'تفاح محشو', 35, 'cat-desserts', '🥧', 'دافئ بالقرفة'],
    ['e3', 'براوني', 30, 'cat-desserts', '🍫', 'براوني شوكولاتة'],
  ]) {
    run('INSERT INTO products (id, name, price, category_id, emoji, description, active) VALUES (?, ?, ?, ?, ?, ?, 1)', p)
  }

  // Addons
  for (const a of [
    ['addon-cheese', 'جبنة إضافية', 5, '🧀'],
    ['addon-bacon', 'بيكون', 10, '🥓'],
    ['addon-sauce', 'صلصة خاصة', 3, '🫙'],
    ['addon-fries', 'بطاطس زيادة', 8, '🍟'],
    ['addon-drink', 'مشروب كبير', 7, '🥤'],
    ['addon-onion', 'حلقات بصل', 8, '🧅'],
    ['addon-coleslaw', 'كول سلو', 5, '🥗'],
    ['addon-pickle', 'مخلل', 2, '🥒'],
  ]) {
    run('INSERT INTO addons (id, name, price, emoji, active) VALUES (?, ?, ?, ?, 1)', a)
  }

  // Modifier groups
  run('INSERT INTO modifier_groups (id, name, type, sort_order, active) VALUES (?, ?, ?, ?, 1)', ['grp-size', 'الحجم', 'single-select', 1])
  run('INSERT INTO modifier_groups (id, name, type, sort_order, active) VALUES (?, ?, ?, ?, 1)', ['grp-sauce', 'الصوص', 'multi-select', 2])

  // Modifiers
  for (const m of [
    ['mod-regular', 'grp-size', 'عادي', 0, 1],
    ['mod-large', 'grp-size', 'كبير', 30, 2],
    ['mod-xl', 'grp-size', 'XL', 50, 3],
    ['mod-bbq', 'grp-sauce', 'باربكيو', 0, 1],
    ['mod-garlic', 'grp-sauce', 'ثوم', 0, 2],
    ['mod-spicy', 'grp-sauce', 'حار', 10, 3],
  ]) {
    run('INSERT INTO modifiers (id, modifier_group_id, name, price_adjustment, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)', m)
  }

  // Link modifiers to products
  for (const pid of ['b1', 'b2', 'b3', 'b4', 'p1', 'p2', 'p3', 'p4']) {
    run('INSERT INTO product_modifier_groups (product_id, modifier_group_id) VALUES (?, ?)', [pid, 'grp-size'])
  }
  for (const pid of ['b1', 'b2', 'b3', 'b4']) {
    run('INSERT INTO product_modifier_groups (product_id, modifier_group_id) VALUES (?, ?)', [pid, 'grp-sauce'])
  }

  // Ingredients
  for (const i of [
    ['ing-bread', 'خبز', 'pcs', 200, 20, 3],
    ['ing-beef', 'لحم بقري', 'g', 10000, 1000, 0.2],
    ['ing-chicken', 'صدر دجاج', 'g', 8000, 1000, 0.15],
    ['ing-cheese', 'جبنة', 'g', 5000, 500, 0.1],
    ['ing-potato', 'بطاطس', 'g', 15000, 2000, 0.03],
    ['ing-cola', 'كولا', 'ml', 20000, 2000, 0.01],
  ]) {
    run('INSERT INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, active) VALUES (?, ?, ?, ?, ?, ?, 1)', i)
  }

  // Recipes
  for (const r of [
    ['r1', 'b1', 'ing-bread', 1],
    ['r2', 'b1', 'ing-beef', 150],
    ['r3', 'b2', 'ing-bread', 1],
    ['r4', 'b2', 'ing-beef', 150],
    ['r5', 'b2', 'ing-cheese', 40],
    ['r6', 's1', 'ing-potato', 200],
    ['r7', 'd1', 'ing-cola', 330],
  ]) {
    run('INSERT INTO recipes (id, product_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)', r)
  }

  // Users
  run('INSERT INTO users (id, name, pin_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['user-admin', 'مدير', '$argon2id$placeholder', 'admin', 1, ts])
  run('INSERT INTO users (id, name, pin_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['user-cashier', 'كاشير', '$argon2id$placeholder', 'cashier', 1, ts])
}

// ═══════════════════════════════════════════════════════════════
// INIT (async — must be called before using rendererApi)
// ═══════════════════════════════════════════════════════════════

export async function initRendererDb() {
  const SQL = await initSqlJs()
  sqlite = new SQL.Database()
  sqlite.run('PRAGMA foreign_keys = ON')
  migrate()
  seed()
}

// ═══════════════════════════════════════════════════════════════
// API (same shape as IPC handlers)
// ═══════════════════════════════════════════════════════════════

export const rendererApi = {
  category: {
    list: () => queryAll('SELECT * FROM categories WHERE active = 1 ORDER BY sort_order'),
    create: (data: any) => { const id = uuid(); run('INSERT INTO categories (id, name, emoji, color, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)', [id, data.name, data.emoji, data.color, data.sortOrder || 0]); return { id } },
    update: (id: string, data: any) => { if (data.name) run('UPDATE categories SET name = ? WHERE id = ?', [data.name, id]); if (data.emoji) run('UPDATE categories SET emoji = ? WHERE id = ?', [data.emoji, id]); return { ok: true } },
    delete: (id: string) => { run('UPDATE categories SET active = 0 WHERE id = ?', [id]); return { ok: true } },
    reorder: (ids: string[]) => { ids.forEach((id, i) => run('UPDATE categories SET sort_order = ? WHERE id = ?', [i, id])); return { ok: true } },
  },
  product: {
    list: (categoryId?: string) => {
      if (categoryId) return queryAll('SELECT * FROM products WHERE active = 1 AND category_id = ?', [categoryId])
      return queryAll('SELECT * FROM products WHERE active = 1')
    },
    getById: (id: string) => queryOne('SELECT * FROM products WHERE id = ?', [id]),
    create: (data: any) => { const id = uuid(); run('INSERT INTO products (id, name, price, category_id, emoji, description, active) VALUES (?, ?, ?, ?, ?, ?, 1)', [id, data.name, data.price, data.categoryId, data.emoji, data.description]); return { id } },
    update: (id: string, data: any) => { if (data.name) run('UPDATE products SET name = ? WHERE id = ?', [data.name, id]); return { ok: true } },
    delete: (id: string) => { run('UPDATE products SET active = 0 WHERE id = ?', [id]); return { ok: true } },
  },
  addon: {
    list: () => queryAll('SELECT * FROM addons WHERE active = 1'),
    create: (data: any) => { const id = uuid(); run('INSERT INTO addons (id, name, price, emoji, active) VALUES (?, ?, ?, ?, 1)', [id, data.name, data.price, data.emoji]); return { id } },
    update: (id: string, data: any) => { if (data.name) run('UPDATE addons SET name = ? WHERE id = ?', [data.name, id]); return { ok: true } },
    delete: (id: string) => { run('UPDATE addons SET active = 0 WHERE id = ?', [id]); return { ok: true } },
    listByProduct: (productId: string) => queryAll('SELECT a.* FROM addons a INNER JOIN product_addons pa ON a.id = pa.addon_id WHERE pa.product_id = ?', [productId]),
    linkToProduct: (productId: string, addonId: string) => { run('INSERT INTO product_addons (product_id, addon_id) VALUES (?, ?)', [productId, addonId]); return { ok: true } },
  },
  modifier: {
    listGroups: () => queryAll('SELECT * FROM modifier_groups WHERE active = 1 ORDER BY sort_order'),
    createGroup: (data: any) => { const id = uuid(); run('INSERT INTO modifier_groups (id, name, type, sort_order, active) VALUES (?, ?, ?, ?, 1)', [id, data.name, data.type, data.sortOrder || 0]); return { id } },
    updateGroup: (id: string, data: any) => { run('UPDATE modifier_groups SET name = ? WHERE id = ?', [data.name, id]); return { ok: true } },
    deleteGroup: (id: string) => { run('UPDATE modifier_groups SET active = 0 WHERE id = ?', [id]); return { ok: true } },
    listByGroup: (groupId: string) => queryAll('SELECT * FROM modifiers WHERE active = 1 AND modifier_group_id = ? ORDER BY sort_order', [groupId]),
    createModifier: (data: any) => { const id = uuid(); run('INSERT INTO modifiers (id, modifier_group_id, name, price_adjustment, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)', [id, data.modifierGroupId, data.name, data.priceAdjustment || 0, data.sortOrder || 0]); return { id } },
    updateModifier: (id: string, data: any) => { run('UPDATE modifiers SET name = ? WHERE id = ?', [data.name, id]); return { ok: true } },
    deleteModifier: (id: string) => { run('UPDATE modifiers SET active = 0 WHERE id = ?', [id]); return { ok: true } },
    listByProduct: (productId: string) => {
      const groups = queryAll('SELECT mg.* FROM modifier_groups mg INNER JOIN product_modifier_groups pmg ON mg.id = pmg.modifier_group_id WHERE pmg.product_id = ?', [productId])
      return groups.map(g => ({
        ...g,
        modifiers: queryAll('SELECT * FROM modifiers WHERE active = 1 AND modifier_group_id = ? ORDER BY sort_order', [g.id]),
      }))
    },
    linkToProduct: (productId: string, groupId: string) => { run('INSERT INTO product_modifier_groups (product_id, modifier_group_id) VALUES (?, ?)', [productId, groupId]); return { ok: true } },
  },
  order: {
    create: (data: any) => {
      const id = `#${Date.now().toString().slice(-6)}`
      const ts = now()
      run('INSERT INTO orders (id, status, order_type, table_number, delivery_address, delivery_phone, subtotal, tax, delivery_fee, total, user_id, shift_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, 'PAID', data.orderType, data.tableNumber || null, data.deliveryAddress || null, data.deliveryPhone || null, data.subtotal, data.tax, data.deliveryFee || 0, data.total, data.userId || null, data.shiftId || null, ts, ts])
      for (const item of data.items) {
        run('INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, selected_modifiers_json, selected_addons_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuid(), id, item.productId, item.quantity, item.unitPrice, item.modifiers ? JSON.stringify(item.modifiers) : null, item.addons ? JSON.stringify(item.addons) : null])
      }
      return { id }
    },
    list: (filters?: any) => {
      if (filters?.status) return queryAll('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC', [filters.status])
      return queryAll('SELECT * FROM orders ORDER BY created_at DESC')
    },
    getById: (id: string) => {
      const order = queryOne('SELECT * FROM orders WHERE id = ?', [id])
      if (!order) return null
      return { ...order, items: queryAll('SELECT * FROM order_items WHERE order_id = ?', [id]), payments: queryAll('SELECT * FROM payments WHERE order_id = ?', [id]) }
    },
    updateStatus: (id: string, status: string) => { run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]); return { ok: true } },
    delete: (id: string) => { run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', ['CANCELLED', now(), id]); return { ok: true } },
  },
  payment: {
    create: (data: any) => { const id = uuid(); run('INSERT INTO payments (id, order_id, method, amount, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, data.orderId, data.method, data.amount, data.reference || null, now()]); return { id } },
    listByOrder: (orderId: string) => queryAll('SELECT * FROM payments WHERE order_id = ?', [orderId]),
    getTotalPaid: (orderId: string) => { const r = queryOne('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE order_id = ?', [orderId]); return r?.total || 0 },
  },
  user: {
    list: () => queryAll('SELECT id, name, role, active, created_at FROM users WHERE active = 1'),
    create: (data: any) => { const id = uuid(); run('INSERT INTO users (id, name, pin_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, data.name, '$argon2id$placeholder', data.role || 'cashier', 1, now()]); return { id } },
    update: (id: string, data: any) => { run('UPDATE users SET name = ? WHERE id = ?', [data.name, id]); return { ok: true } },
    delete: (id: string) => { run('UPDATE users SET active = 0 WHERE id = ?', [id]); return { ok: true } },
    verifyPin: (id: string, _pin: string) => {
      const user = queryOne('SELECT * FROM users WHERE id = ?', [id])
      if (!user) return { ok: false, error: 'User not found' }
      return { ok: true, user: { id: user.id, name: user.name, role: user.role } }
    },
  },
  shift: {
    open: (data: any) => {
      const id = uuid(); const ts = now()
      run('INSERT INTO shifts (id, user_id, started_at, opening_cash, status) VALUES (?, ?, ?, ?, ?)', [id, data.userId, ts, data.openingCash, 'open'])
      run('INSERT INTO cash_movements (id, shift_id, type, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), id, 'OPENING', data.openingCash, 'فتح الوردية', ts])
      return { id }
    },
    close: (id: string, closingCash: number) => { run('UPDATE shifts SET ended_at = ?, closing_cash = ?, status = ? WHERE id = ?', [now(), closingCash, 'closed', id]); return { ok: true } },
    getCurrent: () => queryOne('SELECT * FROM shifts WHERE status = ?', ['open']),
    list: (filters?: any) => {
      if (filters?.userId) return queryAll('SELECT * FROM shifts WHERE user_id = ? ORDER BY started_at DESC', [filters.userId])
      return queryAll('SELECT * FROM shifts ORDER BY started_at DESC')
    },
  },
  cashDrawer: {
    addMovement: (data: any) => { const id = uuid(); run('INSERT INTO cash_movements (id, shift_id, type, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, data.shiftId, data.type, data.amount, data.note || null, now()]); return { id } },
    listByShift: (shiftId: string) => queryAll('SELECT * FROM cash_movements WHERE shift_id = ?', [shiftId]),
    reconcile: (_shiftId: string) => null,
  },
  inventory: {
    listIngredients: () => queryAll('SELECT * FROM ingredients WHERE active = 1'),
    createIngredient: (data: any) => { const id = uuid(); run('INSERT INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, active) VALUES (?, ?, ?, ?, ?, ?, 1)', [id, data.name, data.unit, data.stockQuantity || 0, data.minStock || 0, data.costPerUnit || 0]); return { id } },
    updateIngredient: (id: string, data: any) => { if (data.name) run('UPDATE ingredients SET name = ? WHERE id = ?', [data.name, id]); return { ok: true } },
    deleteIngredient: (id: string) => { run('UPDATE ingredients SET active = 0 WHERE id = ?', [id]); return { ok: true } },
    listRecipes: (productId: string) => queryAll('SELECT * FROM recipes WHERE product_id = ?', [productId]),
    upsertRecipe: (data: any) => {
      if (data.id) { run('UPDATE recipes SET quantity_per_unit = ? WHERE id = ?', [data.quantityPerUnit, data.id]); return { id: data.id } }
      const id = uuid(); run('INSERT INTO recipes (id, product_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)', [id, data.productId, data.ingredientId, data.quantityPerUnit]); return { id }
    },
    deleteRecipe: (id: string) => { run('DELETE FROM recipes WHERE id = ?', [id]); return { ok: true } },
    getAlerts: () => queryAll('SELECT * FROM ingredients WHERE active = 1 AND stock_quantity <= min_stock'),
    restock: (ingredientId: string, qty: number, note?: string) => {
      run('UPDATE ingredients SET stock_quantity = stock_quantity + ? WHERE id = ?', [qty, ingredientId])
      run('INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, note, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uuid(), ingredientId, 'PURCHASE', qty, note || 'إعادة تعبئة', now()])
      return { ok: true }
    },
    deductForOrder: (orderId: string) => {
      const items = queryAll('SELECT * FROM order_items WHERE order_id = ?', [orderId])
      for (const item of items) {
        const recipeItems = queryAll('SELECT * FROM recipes WHERE product_id = ?', [item.product_id])
        for (const r of recipeItems) {
          const deduction = r.quantity_per_unit * item.quantity
          run('UPDATE ingredients SET stock_quantity = stock_quantity - ? WHERE id = ?', [deduction, r.ingredient_id])
          run('INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuid(), r.ingredient_id, 'CONSUMPTION', -deduction, orderId, `استهلاك طلب ${orderId}`, now()])
        }
      }
      return { ok: true }
    },
  },
  report: {
    dailySummary: (date?: string) => {
      const targetDate = date || new Date().toISOString().slice(0, 10)
      const all = queryAll('SELECT * FROM orders')
      const dayOrders = all.filter((o: any) => o.created_at?.startsWith(targetDate) && o.status !== 'CANCELLED')
      const cancelled = all.filter((o: any) => o.created_at?.startsWith(targetDate) && o.status === 'CANCELLED')
      const revenue = dayOrders.reduce((s: number, o: any) => s + o.total, 0)
      return { date: targetDate, totalOrders: dayOrders.length, totalRevenue: revenue, avgOrderValue: dayOrders.length > 0 ? revenue / dayOrders.length : 0, cancelledOrders: cancelled.length, cancellationRate: 0 }
    },
    hourlyBreakdown: () => [],
    topItems: (limit = 10) => {
      const allItems = queryAll('SELECT * FROM order_items')
      const allProducts = queryAll('SELECT * FROM products')
      const productMap = new Map(allProducts.map((p: any) => [p.id, p]))
      const counts: Record<string, any> = {}
      for (const item of allItems) {
        const p = productMap.get(item.product_id)
        if (!p) continue
        if (!counts[p.id]) counts[p.id] = { name: p.name, emoji: p.emoji, totalQuantity: 0, totalRevenue: 0 }
        counts[p.id].totalQuantity += item.quantity
        counts[p.id].totalRevenue += item.unit_price * item.quantity
      }
      return Object.values(counts).sort((a: any, b: any) => b.totalQuantity - a.totalQuantity).slice(0, limit)
    },
    categoryRevenue: () => {
      const allItems = queryAll('SELECT * FROM order_items')
      const allProducts = queryAll('SELECT * FROM products')
      const productMap = new Map(allProducts.map((p: any) => [p.id, p]))
      const allCats = queryAll('SELECT * FROM categories')
      const catMap = new Map(allCats.map((c: any) => [c.id, c]))
      const catRevenue: Record<string, any> = {}
      for (const item of allItems) {
        const p = productMap.get(item.product_id)
        if (!p) continue
        const c = catMap.get(p.category_id)
        if (!c) continue
        if (!catRevenue[c.id]) catRevenue[c.id] = { categoryId: c.id, name: c.name, totalRevenue: 0 }
        catRevenue[c.id].totalRevenue += item.unit_price * item.quantity
      }
      return Object.values(catRevenue).sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
    },
    addonStats: () => [],
    ticketDistribution: () => [],
    orderTypeSplit: () => {
      const all = queryAll('SELECT * FROM orders WHERE status != ?', ['CANCELLED'])
      const delivery = all.filter((o: any) => o.order_type === 'delivery')
      const dineIn = all.filter((o: any) => o.order_type === 'dine-in')
      const total = all.length || 1
      return {
        delivery: { count: delivery.length, revenue: delivery.reduce((s: number, o: any) => s + o.total, 0), percentage: delivery.length / total * 100 },
        dineIn: { count: dineIn.length, revenue: dineIn.reduce((s: number, o: any) => s + o.total, 0), percentage: dineIn.length / total * 100 },
      }
    },
    shiftReport: () => null,
    revenueTrend: (days = 7) => {
      const all = queryAll('SELECT * FROM orders WHERE status != ?', ['CANCELLED'])
      const result: any[] = []
      for (let d = days - 1; d >= 0; d--) {
        const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
        const dayOrders = all.filter((o: any) => o.created_at?.startsWith(date))
        result.push({ date, revenue: dayOrders.reduce((s: number, o: any) => s + o.total, 0), orderCount: dayOrders.length })
      }
      return result
    },
    inventoryAlerts: () => queryAll('SELECT * FROM ingredients WHERE active = 1 AND stock_quantity <= min_stock'),
    paymentMethodBreakdown: () => [],
  },
  backup: {
    trigger: () => ({ ok: true }),
    getStatus: () => ({ lastBackup: null, backupCount: 0 }),
  },
}
