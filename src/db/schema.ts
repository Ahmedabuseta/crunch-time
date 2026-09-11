import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// ─── Categories ────────────────────────────────────────────────
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji').notNull(),
  color: text('color').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

// ─── Products ──────────────────────────────────────────────────
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price: real('price').notNull(),
  categoryId: text('category_id').notNull().references(() => categories.id),
  emoji: text('emoji').notNull(),
  description: text('description').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

// ─── Addons ────────────────────────────────────────────────────
export const addons = sqliteTable('addons', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price: real('price').notNull(),
  emoji: text('emoji').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const productAddons = sqliteTable('product_addons', {
  productId: text('product_id').notNull().references(() => products.id),
  addonId: text('addon_id').notNull().references(() => addons.id),
})

// ─── Modifiers (relational) ────────────────────────────────────
export const modifierGroups = sqliteTable('modifier_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'single-select' | 'multi-select'
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const modifiers = sqliteTable('modifiers', {
  id: text('id').primaryKey(),
  modifierGroupId: text('modifier_group_id').notNull().references(() => modifierGroups.id),
  name: text('name').notNull(),
  priceAdjustment: real('price_adjustment').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const productModifierGroups = sqliteTable('product_modifier_groups', {
  productId: text('product_id').notNull().references(() => products.id),
  modifierGroupId: text('modifier_group_id').notNull().references(() => modifierGroups.id),
})

// ─── Users (local PIN auth) ────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  pinHash: text('pin_hash').notNull(),
  role: text('role').notNull().default('cashier'), // 'admin' | 'cashier'
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
})

// ─── Shifts ────────────────────────────────────────────────────
export const shifts = sqliteTable('shifts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  openingCash: real('opening_cash').notNull(),
  closingCash: real('closing_cash'),
  status: text('status').notNull().default('open'), // 'open' | 'closed'
})

// ─── Orders ────────────────────────────────────────────────────
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('DRAFT'),
  // DRAFT | PENDING_PAYMENT | PAID | PREPARING | READY | COMPLETED | CANCELLED | REFUNDED
  orderType: text('order_type').notNull(), // 'delivery' | 'dine-in'
  tableNumber: text('table_number'),
  deliveryAddress: text('delivery_address'),
  deliveryPhone: text('delivery_phone'),
  subtotal: real('subtotal').notNull(),
  tax: real('tax').notNull(),
  deliveryFee: real('delivery_fee').notNull().default(0),
  total: real('total').notNull(),
  userId: text('user_id').references(() => users.id),
  shiftId: text('shift_id').references(() => shifts.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// ─── Order Items ───────────────────────────────────────────────
export const orderItems = sqliteTable('order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id),
  productId: text('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  selectedModifiersJson: text('selected_modifiers_json'), // JSON: { modifierId: value }
  selectedAddonsJson: text('selected_addons_json'),       // JSON: addonId[]
})

// ─── Payments ──────────────────────────────────────────────────
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id),
  method: text('method').notNull(), // 'cash' | 'card' | 'wallet'
  amount: real('amount').notNull(),
  reference: text('reference'),
  createdAt: text('created_at').notNull(),
})

// ─── Ingredients ───────────────────────────────────────────────
export const ingredients = sqliteTable('ingredients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull(), // 'g' | 'ml' | 'pcs' | 'kg' | 'l'
  stockQuantity: real('stock_quantity').notNull().default(0),
  minStock: real('min_stock').notNull().default(0),
  costPerUnit: real('cost_per_unit').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

// ─── Recipes (product → ingredient mappings) ──────────────────
export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id),
  quantityPerUnit: real('quantity_per_unit').notNull(),
})

// ─── Inventory Transactions ────────────────────────────────────
export const inventoryTransactions = sqliteTable('inventory_transactions', {
  id: text('id').primaryKey(),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id),
  type: text('type').notNull(), // 'PURCHASE' | 'CONSUMPTION' | 'ADJUSTMENT' | 'WASTE'
  quantity: real('quantity').notNull(),
  referenceOrderId: text('reference_order_id').references(() => orders.id),
  note: text('note'),
  createdAt: text('created_at').notNull(),
})

// ─── Cash Movements ────────────────────────────────────────────
export const cashMovements = sqliteTable('cash_movements', {
  id: text('id').primaryKey(),
  shiftId: text('shift_id').notNull().references(() => shifts.id),
  type: text('type').notNull(), // 'OPENING' | 'SALE' | 'REFUND' | 'CASH_IN' | 'CASH_OUT' | 'CLOSING'
  amount: real('amount').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull(),
})

// ─── Relations ─────────────────────────────────────────────────
export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  addons: many(productAddons),
  modifierGroups: many(productModifierGroups),
  orderItems: many(orderItems),
  recipes: many(recipes),
}))

export const addonsRelations = relations(addons, ({ many }) => ({
  products: many(productAddons),
}))

export const productAddonsRelations = relations(productAddons, ({ one }) => ({
  product: one(products, { fields: [productAddons.productId], references: [products.id] }),
  addon: one(addons, { fields: [productAddons.addonId], references: [addons.id] }),
}))

export const modifierGroupsRelations = relations(modifierGroups, ({ many }) => ({
  modifiers: many(modifiers),
  products: many(productModifierGroups),
}))

export const modifiersRelations = relations(modifiers, ({ one }) => ({
  group: one(modifierGroups, { fields: [modifiers.modifierGroupId], references: [modifierGroups.id] }),
}))

export const productModifierGroupsRelations = relations(productModifierGroups, ({ one }) => ({
  product: one(products, { fields: [productModifierGroups.productId], references: [products.id] }),
  modifierGroup: one(modifierGroups, { fields: [productModifierGroups.modifierGroupId], references: [modifierGroups.id] }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  shifts: many(shifts),
  orders: many(orders),
}))

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  user: one(users, { fields: [shifts.userId], references: [users.id] }),
  orders: many(orders),
  cashMovements: many(cashMovements),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  shift: one(shifts, { fields: [orders.shiftId], references: [shifts.id] }),
  items: many(orderItems),
  payments: many(payments),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}))

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  recipes: many(recipes),
  transactions: many(inventoryTransactions),
}))

export const recipesRelations = relations(recipes, ({ one }) => ({
  product: one(products, { fields: [recipes.productId], references: [products.id] }),
  ingredient: one(ingredients, { fields: [recipes.ingredientId], references: [ingredients.id] }),
}))

export const inventoryTransactionsRelations = relations(inventoryTransactions, ({ one }) => ({
  ingredient: one(ingredients, { fields: [inventoryTransactions.ingredientId], references: [ingredients.id] }),
  order: one(orders, { fields: [inventoryTransactions.referenceOrderId], references: [orders.id] }),
}))

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  shift: one(shifts, { fields: [cashMovements.shiftId], references: [shifts.id] }),
}))
