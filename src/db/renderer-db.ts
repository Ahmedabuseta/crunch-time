import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and, desc, sql } from 'drizzle-orm'
import * as schema from './schema'

const {
  categories, products, addons, productAddons,
  modifierGroups, modifiers, productModifierGroups,
  orders, orderItems, payments,
  users, shifts, cashMovements,
  ingredients, recipes, inventoryTransactions,
} = schema

function uuid() { return crypto.randomUUID() }
function now() { return new Date().toISOString() }

// In-memory SQLite for renderer (dev mode)
const sqlite = new Database(':memory:')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite, { schema })

// Run migrations
function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id), emoji TEXT NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS addons (id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, emoji TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS product_addons (product_id TEXT NOT NULL REFERENCES products(id), addon_id TEXT NOT NULL REFERENCES addons(id), PRIMARY KEY (product_id, addon_id));
    CREATE TABLE IF NOT EXISTS modifier_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS modifiers (id TEXT PRIMARY KEY, modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id), name TEXT NOT NULL, price_adjustment REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS product_modifier_groups (product_id TEXT NOT NULL REFERENCES products(id), modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id), PRIMARY KEY (product_id, modifier_group_id));
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, pin_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'cashier', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shifts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), started_at TEXT NOT NULL, ended_at TEXT, opening_cash REAL NOT NULL, closing_cash REAL, status TEXT NOT NULL DEFAULT 'open');
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'DRAFT', order_type TEXT NOT NULL, table_number TEXT, delivery_address TEXT, delivery_phone TEXT, subtotal REAL NOT NULL, tax REAL NOT NULL, delivery_fee REAL NOT NULL DEFAULT 0, total REAL NOT NULL, user_id TEXT REFERENCES users(id), shift_id TEXT REFERENCES shifts(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL, unit_price REAL NOT NULL, selected_modifiers_json TEXT, selected_addons_json TEXT);
    CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), method TEXT NOT NULL, amount REAL NOT NULL, reference TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ingredients (id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL, stock_quantity REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0, cost_per_unit REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS recipes (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), ingredient_id TEXT NOT NULL REFERENCES ingredients(id), quantity_per_unit REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS inventory_transactions (id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL REFERENCES ingredients(id), type TEXT NOT NULL, quantity REAL NOT NULL, reference_order_id TEXT REFERENCES orders(id), note TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cash_movements (id TEXT PRIMARY KEY, shift_id TEXT NOT NULL REFERENCES shifts(id), type TEXT NOT NULL, amount REAL NOT NULL, note TEXT, created_at TEXT NOT NULL);
  `)
}

// Seed data
function seed() {
  const existing = sqlite.prepare('SELECT COUNT(*) as count FROM categories').get() as any
  if (existing.count > 0) return

  const ts = now()

  // Categories
  const cats = [
    { id: 'cat-burgers', name: 'برجر', emoji: '🍔', color: 'var(--cat-burgers)', sortOrder: 1 },
    { id: 'cat-pizza', name: 'بيتزا', emoji: '🍕', color: 'var(--cat-pizza)', sortOrder: 2 },
    { id: 'cat-chicken', name: 'دجاج', emoji: '🍗', color: 'var(--cat-chicken)', sortOrder: 3 },
    { id: 'cat-sides', name: 'أطباق جانبية', emoji: '🍟', color: 'var(--cat-sides)', sortOrder: 4 },
    { id: 'cat-drinks', name: 'مشروبات', emoji: '🥤', color: 'var(--cat-drinks)', sortOrder: 5 },
    { id: 'cat-desserts', name: 'حلويات', emoji: '🍦', color: 'var(--cat-desserts)', sortOrder: 6 },
  ]
  for (const c of cats) db.insert(categories).values(c).run()

  // Products
  const prods = [
    { id: 'b1', name: 'برجر كلاسيك', price: 85, categoryId: 'cat-burgers', emoji: '🍔', description: 'لحم، خس، طماطم' },
    { id: 'b2', name: 'برجر جبنة', price: 95, categoryId: 'cat-burgers', emoji: '🧀', description: 'جبنة مزدوجة، مخلل، بصل' },
    { id: 'b3', name: 'برجر بيكون', price: 110, categoryId: 'cat-burgers', emoji: '🥓', description: 'بيكون مقرمش، صوص باربكيو' },
    { id: 'b4', name: 'برجر فطر', price: 105, categoryId: 'cat-burgers', emoji: '🍄', description: 'جبنة سويسري، فطر' },
    { id: 'p1', name: 'مارغريتا', price: 120, categoryId: 'cat-pizza', emoji: '🍕', description: 'طماطم، موزاريلا، ريحان' },
    { id: 'p2', name: 'بيبروني', price: 145, categoryId: 'cat-pizza', emoji: '🌶️', description: 'بيبروني مزدوج، موزاريلا' },
    { id: 'p3', name: 'دجاج باربكيو', price: 155, categoryId: 'cat-pizza', emoji: '🍗', description: 'صوص باربكيو، دجاج، بصل أحمر' },
    { id: 'p4', name: 'خضار', price: 130, categoryId: 'cat-pizza', emoji: '🥬', description: 'خضار مشكلة، زيتون، فيتا' },
    { id: 'c1', name: 'ناجت دجاج (6)', price: 65, categoryId: 'cat-chicken', emoji: '🍗', description: 'ناجت ذهبي مقرمش' },
    { id: 'c2', name: 'أجنحة دجاج (8)', price: 105, categoryId: 'cat-chicken', emoji: '🍗', description: 'صوص بوفالو أو باربكيو' },
    { id: 'c3', name: 'ساندويتش دجاج', price: 90, categoryId: 'cat-chicken', emoji: '🥪', description: 'دجاج مقرمش، كول سلو، مخلل' },
    { id: 's1', name: 'بطاطس مقلية', price: 35, categoryId: 'cat-sides', emoji: '🍟', description: 'بطاطس ذهبية مقرمشة' },
    { id: 's2', name: 'حلقات بصل', price: 45, categoryId: 'cat-sides', emoji: '🧅', description: 'حلقات بصل مقرمشة' },
    { id: 's3', name: 'أصابع موزاريلا', price: 55, categoryId: 'cat-sides', emoji: '🧀', description: 'مع صوص مارينارا' },
    { id: 's4', name: 'كول سلو', price: 25, categoryId: 'cat-sides', emoji: '🥗', description: 'كول سلو كريمي' },
    { id: 'd1', name: 'كولا', price: 20, categoryId: 'cat-drinks', emoji: '🥤', description: 'كولا باردة' },
    { id: 'd2', name: 'ليمونادة', price: 25, categoryId: 'cat-drinks', emoji: '🍋', description: 'ليمون طازج' },
    { id: 'd3', name: 'ميلك شيك', price: 50, categoryId: 'cat-drinks', emoji: '🥛', description: 'فانيليا، شوكولاتة، أو فراولة' },
    { id: 'd4', name: 'شاي مثلج', price: 20, categoryId: 'cat-drinks', emoji: '🍵', description: 'محلى أو بدون سكر' },
    { id: 'e1', name: 'آيس كريم صنداي', price: 45, categoryId: 'cat-desserts', emoji: '🍦', description: '3 سكوب، صوص شوكولاتة، كرز' },
    { id: 'e2', name: 'تفاح محشو', price: 35, categoryId: 'cat-desserts', emoji: '🥧', description: 'دافئ بالقرفة' },
    { id: 'e3', name: 'براوني', price: 30, categoryId: 'cat-desserts', emoji: '🍫', description: 'براوني شوكولاتة' },
  ]
  for (const p of prods) db.insert(products).values(p).run()

  // Addons
  const addonData = [
    { id: 'addon-cheese', name: 'جبنة إضافية', price: 5, emoji: '🧀' },
    { id: 'addon-bacon', name: 'بيكون', price: 10, emoji: '🥓' },
    { id: 'addon-sauce', name: 'صلصة خاصة', price: 3, emoji: '🫙' },
    { id: 'addon-fries', name: 'بطاطس زيادة', price: 8, emoji: '🍟' },
    { id: 'addon-drink', name: 'مشروب كبير', price: 7, emoji: '🥤' },
    { id: 'addon-onion', name: 'حلقات بصل', price: 8, emoji: '🧅' },
    { id: 'addon-coleslaw', name: 'كول سلو', price: 5, emoji: '🥗' },
    { id: 'addon-pickle', name: 'مخلل', price: 2, emoji: '🥒' },
  ]
  for (const a of addonData) db.insert(addons).values(a).run()

  // Modifiers
  db.insert(modifierGroups).values({ id: 'grp-size', name: 'الحجم', type: 'single-select', sortOrder: 1 }).run()
  db.insert(modifierGroups).values({ id: 'grp-sauce', name: 'الصوص', type: 'multi-select', sortOrder: 2 }).run()
  for (const m of [
    { id: 'mod-regular', modifierGroupId: 'grp-size', name: 'عادي', priceAdjustment: 0, sortOrder: 1 },
    { id: 'mod-large', modifierGroupId: 'grp-size', name: 'كبير', priceAdjustment: 30, sortOrder: 2 },
    { id: 'mod-xl', modifierGroupId: 'grp-size', name: 'XL', priceAdjustment: 50, sortOrder: 3 },
    { id: 'mod-bbq', modifierGroupId: 'grp-sauce', name: 'باربكيو', priceAdjustment: 0, sortOrder: 1 },
    { id: 'mod-garlic', modifierGroupId: 'grp-sauce', name: 'ثوم', priceAdjustment: 0, sortOrder: 2 },
    { id: 'mod-spicy', modifierGroupId: 'grp-sauce', name: 'حار', priceAdjustment: 10, sortOrder: 3 },
  ]) db.insert(modifiers).values(m).run()

  // Link modifiers to products
  for (const pid of ['b1', 'b2', 'b3', 'b4', 'p1', 'p2', 'p3', 'p4']) {
    db.insert(productModifierGroups).values({ productId: pid, modifierGroupId: 'grp-size' }).run()
  }
  for (const pid of ['b1', 'b2', 'b3', 'b4']) {
    db.insert(productModifierGroups).values({ productId: pid, modifierGroupId: 'grp-sauce' }).run()
  }

  // Ingredients
  for (const i of [
    { id: 'ing-bread', name: 'خبز', unit: 'pcs', stockQuantity: 200, minStock: 20, costPerUnit: 3 },
    { id: 'ing-beef', name: 'لحم بقري', unit: 'g', stockQuantity: 10000, minStock: 1000, costPerUnit: 0.2 },
    { id: 'ing-chicken', name: 'صدر دجاج', unit: 'g', stockQuantity: 8000, minStock: 1000, costPerUnit: 0.15 },
    { id: 'ing-cheese', name: 'جبنة', unit: 'g', stockQuantity: 5000, minStock: 500, costPerUnit: 0.1 },
    { id: 'ing-potato', name: 'بطاطس', unit: 'g', stockQuantity: 15000, minStock: 2000, costPerUnit: 0.03 },
    { id: 'ing-cola', name: 'كولا', unit: 'ml', stockQuantity: 20000, minStock: 2000, costPerUnit: 0.01 },
  ]) db.insert(ingredients).values(i).run()

  // Recipes
  for (const r of [
    { id: 'r1', productId: 'b1', ingredientId: 'ing-bread', quantityPerUnit: 1 },
    { id: 'r2', productId: 'b1', ingredientId: 'ing-beef', quantityPerUnit: 150 },
    { id: 'r3', productId: 'b2', ingredientId: 'ing-bread', quantityPerUnit: 1 },
    { id: 'r4', productId: 'b2', ingredientId: 'ing-beef', quantityPerUnit: 150 },
    { id: 'r5', productId: 'b2', ingredientId: 'ing-cheese', quantityPerUnit: 40 },
    { id: 'r6', productId: 's1', ingredientId: 'ing-potato', quantityPerUnit: 200 },
    { id: 'r7', productId: 'd1', ingredientId: 'ing-cola', quantityPerUnit: 330 },
  ]) db.insert(recipes).values(r).run()

  // Admin user
  db.insert(users).values({
    id: 'user-admin', name: 'مدير', pinHash: '$argon2id$placeholder',
    role: 'admin', active: true, createdAt: ts,
  }).run()
  db.insert(users).values({
    id: 'user-cashier', name: 'كاشير', pinHash: '$argon2id$placeholder',
    role: 'cashier', active: true, createdAt: ts,
  }).run()
}

migrate()
seed()

// ═══════════════════════════════════════════════════════════════
// Export API functions (same shape as IPC handlers)
// ═══════════════════════════════════════════════════════════════

export const rendererApi = {
  category: {
    list: () => db.select().from(categories).where(eq(categories.active, true)).orderBy(categories.sortOrder).all(),
    create: (data: any) => { const id = uuid(); db.insert(categories).values({ id, ...data, active: true }).run(); return { id } },
    update: (id: string, data: any) => { db.update(categories).set(data).where(eq(categories.id, id)).run(); return { ok: true } },
    delete: (id: string) => { db.update(categories).set({ active: false }).where(eq(categories.id, id)).run(); return { ok: true } },
    reorder: (ids: string[]) => { ids.forEach((id, i) => db.update(categories).set({ sortOrder: i }).where(eq(categories.id, id)).run()); return { ok: true } },
  },
  product: {
    list: (categoryId?: string) => {
      if (categoryId) return db.select().from(products).where(and(eq(products.active, true), eq(products.categoryId, categoryId))).all()
      return db.select().from(products).where(eq(products.active, true)).all()
    },
    getById: (id: string) => db.select().from(products).where(eq(products.id, id)).get(),
    create: (data: any) => { const id = uuid(); db.insert(products).values({ id, ...data, active: true }).run(); return { id } },
    update: (id: string, data: any) => { db.update(products).set(data).where(eq(products.id, id)).run(); return { ok: true } },
    delete: (id: string) => { db.update(products).set({ active: false }).where(eq(products.id, id)).run(); return { ok: true } },
  },
  addon: {
    list: () => db.select().from(addons).where(eq(addons.active, true)).all(),
    create: (data: any) => { const id = uuid(); db.insert(addons).values({ id, ...data, active: true }).run(); return { id } },
    update: (id: string, data: any) => { db.update(addons).set(data).where(eq(addons.id, id)).run(); return { ok: true } },
    delete: (id: string) => { db.update(addons).set({ active: false }).where(eq(addons.id, id)).run(); return { ok: true } },
    listByProduct: (productId: string) =>
      db.select().from(addons).innerJoin(productAddons, eq(addons.id, productAddons.addonId))
        .where(eq(productAddons.productId, productId)).all(),
    linkToProduct: (productId: string, addonId: string) => { db.insert(productAddons).values({ productId, addonId }).run(); return { ok: true } },
  },
  modifier: {
    listGroups: () => db.select().from(modifierGroups).where(eq(modifierGroups.active, true)).orderBy(modifierGroups.sortOrder).all(),
    createGroup: (data: any) => { const id = uuid(); db.insert(modifierGroups).values({ id, ...data, active: true }).run(); return { id } },
    updateGroup: (id: string, data: any) => { db.update(modifierGroups).set(data).where(eq(modifierGroups.id, id)).run(); return { ok: true } },
    deleteGroup: (id: string) => { db.update(modifierGroups).set({ active: false }).where(eq(modifierGroups.id, id)).run(); return { ok: true } },
    listByGroup: (groupId: string) => db.select().from(modifiers).where(and(eq(modifiers.active, true), eq(modifiers.modifierGroupId, groupId))).orderBy(modifiers.sortOrder).all(),
    createModifier: (data: any) => { const id = uuid(); db.insert(modifiers).values({ id, ...data, active: true }).run(); return { id } },
    updateModifier: (id: string, data: any) => { db.update(modifiers).set(data).where(eq(modifiers.id, id)).run(); return { ok: true } },
    deleteModifier: (id: string) => { db.update(modifiers).set({ active: false }).where(eq(modifiers.id, id)).run(); return { ok: true } },
    listByProduct: (productId: string) => {
      const groups = db.select().from(modifierGroups)
        .innerJoin(productModifierGroups, eq(modifierGroups.id, productModifierGroups.modifierGroupId))
        .where(eq(productModifierGroups.productId, productId)).all() as any[]
      return groups.map((g: any) => ({
        id: g.modifier_groups.id, name: g.modifier_groups.name, type: g.modifier_groups.type,
        modifiers: db.select().from(modifiers).where(and(eq(modifiers.active, true), eq(modifiers.modifierGroupId, g.modifier_groups.id))).all(),
      }))
    },
    linkToProduct: (productId: string, groupId: string) => { db.insert(productModifierGroups).values({ productId, modifierGroupId: groupId }).run(); return { ok: true } },
  },
  order: {
    create: (data: any) => {
      const id = `#${Date.now().toString().slice(-6)}`
      const ts = now()
      db.insert(orders).values({
        id, status: 'PAID', orderType: data.orderType, tableNumber: data.tableNumber || null,
        deliveryAddress: data.deliveryAddress || null, deliveryPhone: data.deliveryPhone || null,
        subtotal: data.subtotal, tax: data.tax, deliveryFee: data.deliveryFee || 0, total: data.total,
        userId: data.userId || null, shiftId: data.shiftId || null, createdAt: ts, updatedAt: ts,
      }).run()
      for (const item of data.items) {
        db.insert(orderItems).values({
          id: uuid(), orderId: id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice,
          selectedModifiersJson: item.modifiers ? JSON.stringify(item.modifiers) : null,
          selectedAddonsJson: item.addons ? JSON.stringify(item.addons) : null,
        }).run()
      }
      return { id }
    },
    list: (filters?: any) => {
      if (filters?.status) return db.select().from(orders).where(eq(orders.status, filters.status)).orderBy(desc(orders.createdAt)).all()
      return db.select().from(orders).orderBy(desc(orders.createdAt)).all()
    },
    getById: (id: string) => {
      const order = db.select().from(orders).where(eq(orders.id, id)).get()
      if (!order) return null
      return { ...order, items: db.select().from(orderItems).where(eq(orderItems.orderId, id)).all(), payments: db.select().from(payments).where(eq(payments.orderId, id)).all() }
    },
    updateStatus: (id: string, status: string) => { db.update(orders).set({ status, updatedAt: now() }).where(eq(orders.id, id)).run(); return { ok: true } },
    delete: (id: string) => { db.update(orders).set({ status: 'CANCELLED', updatedAt: now() }).where(eq(orders.id, id)).run(); return { ok: true } },
  },
  payment: {
    create: (data: any) => { const id = uuid(); db.insert(payments).values({ id, ...data, createdAt: now() }).run(); return { id } },
    listByOrder: (orderId: string) => db.select().from(payments).where(eq(payments.orderId, orderId)).all(),
    getTotalPaid: (orderId: string) => { const r = db.select({ total: sql`COALESCE(SUM(${payments.amount}), 0)` }).from(payments).where(eq(payments.orderId, orderId)).get() as any; return r?.total || 0 },
  },
  user: {
    list: () => db.select({ id: users.id, name: users.name, role: users.role, active: users.active, createdAt: users.createdAt }).from(users).where(eq(users.active, true)).all(),
    create: (data: any) => { const id = uuid(); db.insert(users).values({ id, name: data.name, pinHash: '$argon2id$placeholder', role: data.role || 'cashier', active: true, createdAt: now() }).run(); return { id } },
    update: (id: string, data: any) => { db.update(users).set(data).where(eq(users.id, id)).run(); return { ok: true } },
    delete: (id: string) => { db.update(users).set({ active: false }).where(eq(users.id, id)).run(); return { ok: true } },
    verifyPin: (_id: string, _pin: string) => {
      const user = db.select().from(users).where(eq(users.id, _id)).get() as any
      if (!user) return { ok: false, error: 'User not found' }
      return { ok: true, user: { id: user.id, name: user.name, role: user.role } }
    },
  },
  shift: {
    open: (data: any) => {
      const id = uuid()
      db.insert(shifts).values({ id, userId: data.userId, startedAt: now(), openingCash: data.openingCash, status: 'open' }).run()
      db.insert(cashMovements).values({ id: uuid(), shiftId: id, type: 'OPENING', amount: data.openingCash, note: 'فتح الوردية', createdAt: now() }).run()
      return { id }
    },
    close: (id: string, closingCash: number) => {
      db.update(shifts).set({ endedAt: now(), closingCash, status: 'closed' }).where(eq(shifts.id, id)).run()
      db.insert(cashMovements).values({ id: uuid(), shiftId: id, type: 'CLOSING', amount: closingCash, note: 'إغلاق الوردية', createdAt: now() }).run()
      return { ok: true }
    },
    getCurrent: () => db.select().from(shifts).where(eq(shifts.status, 'open')).get(),
    list: (filters?: any) => {
      if (filters?.userId) return db.select().from(shifts).where(eq(shifts.userId, filters.userId)).orderBy(desc(shifts.startedAt)).all()
      return db.select().from(shifts).orderBy(desc(shifts.startedAt)).all()
    },
  },
  cashDrawer: {
    addMovement: (data: any) => { const id = uuid(); db.insert(cashMovements).values({ id, ...data, createdAt: now() }).run(); return { id } },
    listByShift: (shiftId: string) => db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).all(),
    reconcile: (shiftId: string) => {
      const movs = db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).all()
      const shift = db.select().from(shifts).where(eq(shifts.id, shiftId)).get() as any
      if (!shift) return null
      let expected = shift.openingCash
      const breakdown: Record<string, number> = {}
      for (const m of movs) {
        if (m.type === 'OPENING' || m.type === 'CLOSING') continue
        const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
        expected += m.amount * sign
        breakdown[m.type] = (breakdown[m.type] || 0) + m.amount * sign
      }
      return { openingCash: shift.openingCash, breakdown, expected, actual: shift.closingCash ?? 0, difference: (shift.closingCash ?? 0) - expected }
    },
  },
  inventory: {
    listIngredients: () => db.select().from(ingredients).where(eq(ingredients.active, true)).all(),
    createIngredient: (data: any) => { const id = uuid(); db.insert(ingredients).values({ id, ...data, active: true }).run(); return { id } },
    updateIngredient: (id: string, data: any) => { db.update(ingredients).set(data).where(eq(ingredients.id, id)).run(); return { ok: true } },
    deleteIngredient: (id: string) => { db.update(ingredients).set({ active: false }).where(eq(ingredients.id, id)).run(); return { ok: true } },
    listRecipes: (productId: string) => db.select().from(recipes).where(eq(recipes.productId, productId)).all(),
    upsertRecipe: (data: any) => {
      if (data.id) { db.update(recipes).set({ quantityPerUnit: data.quantityPerUnit }).where(eq(recipes.id, data.id)).run(); return { id: data.id } }
      const id = uuid(); db.insert(recipes).values({ id, ...data }).run(); return { id }
    },
    deleteRecipe: (id: string) => { sqlite.prepare('DELETE FROM recipes WHERE id = ?').run(id); return { ok: true } },
    getAlerts: () => db.select().from(ingredients).where(and(eq(ingredients.active, true), sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`)).all(),
    restock: (ingredientId: string, qty: number, note?: string) => {
      sqlite.prepare('UPDATE ingredients SET stock_quantity = stock_quantity + ? WHERE id = ?').run(qty, ingredientId)
      db.insert(inventoryTransactions).values({ id: uuid(), ingredientId, type: 'PURCHASE', quantity: qty, note: note || 'إعادة تعبئة', createdAt: now() }).run()
      return { ok: true }
    },
    deductForOrder: (orderId: string) => {
      const items = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all()
      for (const item of items) {
        const recipeItems = db.select().from(recipes).where(eq(recipes.productId, item.productId)).all()
        for (const r of recipeItems) {
          const deduction = r.quantityPerUnit * item.quantity
          sqlite.prepare('UPDATE ingredients SET stock_quantity = stock_quantity - ? WHERE id = ?').run(deduction, r.ingredientId)
          db.insert(inventoryTransactions).values({ id: uuid(), ingredientId: r.ingredientId, type: 'CONSUMPTION', quantity: -deduction, referenceOrderId: orderId, note: `استهلاك طلب ${orderId}`, createdAt: now() }).run()
        }
      }
      return { ok: true }
    },
  },
  report: {
    dailySummary: (date?: string) => {
      const targetDate = date || new Date().toISOString().slice(0, 10)
      const all = db.select().from(orders).all()
      const dayOrders = all.filter((o: any) => o.createdAt.startsWith(targetDate) && o.status !== 'CANCELLED')
      const cancelled = all.filter((o: any) => o.createdAt.startsWith(targetDate) && o.status === 'CANCELLED')
      const revenue = dayOrders.reduce((s: number, o: any) => s + o.total, 0)
      return { date: targetDate, totalOrders: dayOrders.length, totalRevenue: revenue, avgOrderValue: dayOrders.length > 0 ? revenue / dayOrders.length : 0, cancelledOrders: cancelled.length, cancellationRate: 0 }
    },
    hourlyBreakdown: (_date?: string) => [],
    topItems: (limit = 10) => {
      const allItems = db.select().from(orderItems).all()
      const allProducts = db.select().from(products).all()
      const productMap = new Map(allProducts.map((p: any) => [p.id, p]))
      const counts: Record<string, any> = {}
      for (const item of allItems as any[]) {
        const p = productMap.get(item.productId) as any
        if (!p) continue
        if (!counts[p.id]) counts[p.id] = { name: p.name, emoji: p.emoji, totalQuantity: 0, totalRevenue: 0 }
        counts[p.id].totalQuantity += item.quantity
        counts[p.id].totalRevenue += item.unitPrice * item.quantity
      }
      return Object.values(counts).sort((a: any, b: any) => b.totalQuantity - a.totalQuantity).slice(0, limit)
    },
    categoryRevenue: () => {
      const allItems = db.select().from(orderItems).all()
      const allProducts = db.select().from(products).all()
      const productMap = new Map(allProducts.map((p: any) => [p.id, p]))
      const allCats = db.select().from(categories).all()
      const catMap = new Map(allCats.map((c: any) => [c.id, c]))
      const catRevenue: Record<string, any> = {}
      for (const item of allItems as any[]) {
        const p = productMap.get(item.productId) as any
        if (!p) continue
        const c = catMap.get(p.categoryId) as any
        if (!c) continue
        if (!catRevenue[c.id]) catRevenue[c.id] = { categoryId: c.id, name: c.name, totalRevenue: 0 }
        catRevenue[c.id].totalRevenue += item.unitPrice * item.quantity
      }
      return Object.values(catRevenue).sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
    },
    addonStats: () => [],
    ticketDistribution: () => [],
    orderTypeSplit: () => {
      const all = db.select().from(orders).all().filter((o: any) => o.status !== 'CANCELLED')
      const delivery = all.filter((o: any) => o.orderType === 'delivery')
      const dineIn = all.filter((o: any) => o.orderType === 'dine-in')
      const total = all.length || 1
      return {
        delivery: { count: delivery.length, revenue: delivery.reduce((s: number, o: any) => s + o.total, 0), percentage: delivery.length / total * 100 },
        dineIn: { count: dineIn.length, revenue: dineIn.reduce((s: number, o: any) => s + o.total, 0), percentage: dineIn.length / total * 100 },
      }
    },
    shiftReport: () => null,
    revenueTrend: (days = 7) => {
      const all = db.select().from(orders).all().filter((o: any) => o.status !== 'CANCELLED')
      const result: any[] = []
      for (let d = days - 1; d >= 0; d--) {
        const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
        const dayOrders = all.filter((o: any) => o.createdAt.startsWith(date))
        result.push({ date, revenue: dayOrders.reduce((s: number, o: any) => s + o.total, 0), orderCount: dayOrders.length })
      }
      return result
    },
    inventoryAlerts: () => db.select().from(ingredients).where(and(eq(ingredients.active, true), sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`)).all(),
    paymentMethodBreakdown: () => [],
  },
  backup: {
    trigger: () => ({ ok: true }),
    getStatus: () => ({ lastBackup: null, backupCount: 0 }),
  },
}
