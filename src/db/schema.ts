import { sqliteTable, text, integer, real, index, unique } from 'drizzle-orm/sqlite-core'
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
  costPrice: real('cost_price').notNull().default(0),
  categoryId: text('category_id').notNull().references(() => categories.id),
  emoji: text('emoji').notNull(),
  description: text('description').notNull(),
  supportsRollback: integer('supports_rollback', { mode: 'boolean' }).notNull().default(true),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

// ─── Addons ────────────────────────────────────────────────────
export const addons = sqliteTable('addons', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price: real('price').notNull(),
  emoji: text('emoji').notNull(),
  supportsRollback: integer('supports_rollback', { mode: 'boolean' }).notNull().default(true),
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
  hourlyRate: real('hourly_rate').notNull().default(0),
  commissionRate: real('commission_rate').notNull().default(0),
})

// ─── Shifts ────────────────────────────────────────────────────
export const shifts = sqliteTable('shifts', {
  id: text('id').primaryKey(),
  number: integer('number').notNull().default(0),
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
  status: text('status').notNull().default('COMPLETED'),
  // COMPLETED | CANCELLED | REFUNDED
  orderType: text('order_type').notNull(), // 'delivery' | 'dine-in' | 'takeaway'
  tableNumber: text('table_number'), // kept for legacy data
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  customerAddress: text('customer_address'),
  deliveryAddress: text('delivery_address'),
  deliveryPhone: text('delivery_phone'),
  subtotal: real('subtotal').notNull(),
  tax: real('tax').notNull(),
  deliveryFee: real('delivery_fee').notNull().default(0),
  deliveryZoneId: text('delivery_zone_id').references(() => deliveryZones.id),
  deliveryZoneName: text('delivery_zone_name'),
  deliveryNote: text('delivery_note'),
  deliveryProfileId: text('delivery_profile_id').references(() => deliveryProfiles.id),
  deliveryProfileName: text('delivery_profile_name'),
  // Delivery workflow only — separate from `status` so cancel/refund/revenue
  // logic (which filters on `status`) never sees these values.
  // 'unassigned' = no driver yet (kitchen starts, customer receipt withheld)
  // 'assigned'   = driver set → customer receipt may be printed
  // null         = not a delivery order
  driverStatus: text('driver_status'),
  discountCode: text('discount_code'),
  discountAmount: real('discount_amount').notNull().default(0),
  total: real('total').notNull(),
  paymentType: text('payment_type').notNull().default('cash'), // 'cash' | 'visa'
  cashierName: text('cashier_name'),
  note: text('note'),
  statusReason: text('status_reason'),
  refundedAmount: real('refunded_amount').notNull().default(0),
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
  itemDiscount: real('item_discount').notNull().default(0),
  note: text('note'),
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
  // Size of one purchase package in stock units (a 1kg bag of a
  // gram-stored item is 1000; packaged items are 1). The owner
  // enters the package price; cost_per_unit is derived from it.
  purchaseQty: real('purchase_qty').notNull().default(1),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  supplier: text('supplier'),
  secondarySupplier: text('secondary_supplier'),
  supplierRatio: real('supplier_ratio').notNull().default(0.7),
  plannedCost: real('planned_cost').notNull().default(0),
})

// ─── Sub-recipes (reusable prepared components, e.g. صوص/عجينة) ──
export const subRecipes = sqliteTable('sub_recipes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unit: text('unit').notNull().default('وحدة'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
})

export const subRecipeIngredients = sqliteTable('sub_recipe_ingredients', {
  id: text('id').primaryKey(),
  subRecipeId: text('sub_recipe_id').notNull().references(() => subRecipes.id),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id),
  quantityPerUnit: real('quantity_per_unit').notNull(),
})

// ─── Recipes (product → ingredient mappings) ──────────────────
export const recipes = sqliteTable('recipes', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id),
  ingredientId: text('ingredient_id').references(() => ingredients.id),
  quantityPerUnit: real('quantity_per_unit').notNull(),
  subRecipeId: text('sub_recipe_id').references(() => subRecipes.id),
})

// ─── Inventory Transactions ────────────────────────────────────
export const inventoryTransactions = sqliteTable('inventory_transactions', {
  id: text('id').primaryKey(),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id),
  type: text('type').notNull(), // 'PURCHASE' | 'CONSUMPTION' | 'ADJUSTMENT' | 'WASTE'
  quantity: real('quantity').notNull(),
  unitCost: real('unit_cost'),
  supplier: text('supplier'),
  referenceOrderId: text('reference_order_id').references(() => orders.id),
  note: text('note'),
  createdAt: text('created_at').notNull(),
})

// ─── Purchase Price History (PPV + supplier analytics) ────────
export const purchasePriceHistory = sqliteTable('purchase_price_history', {
  id: text('id').primaryKey(),
  ingredientId: text('ingredient_id').notNull().references(() => ingredients.id),
  supplier: text('supplier'),
  unitCost: real('unit_cost').notNull(),
  quantity: real('quantity').notNull(),
  purchasedAt: text('purchased_at').notNull(),
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

// ─── Settings (single row, id = 'settings') ───────────────────
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  deliveryFee: real('delivery_fee').notNull().default(25),
  taxRate: real('tax_rate').notNull().default(0.14),
  restaurantName: text('restaurant_name').notNull().default('Crunch Time'),
  currency: text('currency').notNull().default('EGP'),
  receiptPrinter: text('receipt_printer'),
  receiptWidth: text('receipt_width').notNull().default('80mm'), // '80mm' | '58mm'
  autoPrintReceipt: integer('auto_print_receipt', { mode: 'boolean' }).notNull().default(true),
  autoPrintKitchen: integer('auto_print_kitchen', { mode: 'boolean' }).notNull().default(true),
  kitchenCopies: integer('kitchen_copies').notNull().default(1),
  receiptCopies: integer('receipt_copies').notNull().default(1),

  // ─── Receipt branding (professional letterhead/footer) ───
  storeTagline: text('store_tagline'),
  storeLogo: text('store_logo'), // data URL, downscaled on upload
  storePhone: text('store_phone'),
  storePhone2: text('store_phone2'),
  storeAddress: text('store_address'),
  taxNumber: text('tax_number'), // سجل تجاري
  vatNumber: text('vat_number'), // الرقم الضريبي
  receiptFooter: text('receipt_footer').notNull().default('شكراً لزيارتكم'),
  receiptTerms: text('receipt_terms'),
  receiptSocial: text('receipt_social'),
  currencyLabel: text('currency_label').notNull().default('ج.م'),
  showLogo: integer('show_logo', { mode: 'boolean' }).notNull().default(true),
  showCashier: integer('show_cashier', { mode: 'boolean' }).notNull().default(true),
  showOrderId: integer('show_order_id', { mode: 'boolean' }).notNull().default(true),
  showTax: integer('show_tax', { mode: 'boolean' }).notNull().default(true),

  // ─── Remote POS server (owner's phone app) ───────────────
  // Off by default; binds 0.0.0.0 on remotePort only while enabled.
  // remotePinHash is the argon2 PIN the phone logs in with; remoteSecret
  // is the HMAC key for signed tokens (rotated on every PIN change, which
  // invalidates every issued token). Neither is ever sent to the renderer.
  remoteEnabled: integer('remote_enabled', { mode: 'boolean' }).notNull().default(false),
  remotePort: integer('remote_port').notNull().default(4317),
  remotePinHash: text('remote_pin_hash'),
  remoteSecret: text('remote_secret'),
})

// ─── Kitchen Stations (print routing: categories → printer) ────
export const kitchenStations = sqliteTable('kitchen_stations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  printerName: text('printer_name'),
  paperWidth: text('paper_width').notNull().default('80mm'), // '80mm' | '58mm'
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const stationCategories = sqliteTable('station_categories', {
  stationId: text('station_id').notNull().references(() => kitchenStations.id),
  categoryId: text('category_id').notNull().references(() => categories.id),
})

// ─── Delivery Zones (region → fee) ─────────────────────────────
export const deliveryZones = sqliteTable('delivery_zones', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  fee: real('fee').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

// ─── Delivery Profiles (delivery boys) ─────────────────────────
export const deliveryProfiles = sqliteTable('delivery_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

// ─── Discount Codes ────────────────────────────────────────────
// mode 'order' discounts the whole order (classic coupon);
// mode 'daily' is the employee discount — it applies only to the
// product-of-the-day picked in discount_day_products, up to
// `dailyUses` orders per day (shared pool, 0 = unlimited).
export const discountCodes = sqliteTable('discount_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  type: text('type').notNull(), // 'percentage' | 'fixed'
  value: real('value').notNull(),
  mode: text('mode').notNull().default('order'), // 'order' | 'daily'
  dailyUses: integer('daily_uses').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  maxUses: integer('max_uses').notNull().default(0),
  usedCount: integer('used_count').notNull().default(0),
})

// Weekly rotation for 'daily' employee codes: one product per
// weekday (0 = Sunday … 6 = Saturday). The code only discounts
// that day's product.
export const discountDayProducts = sqliteTable('discount_day_products', {
  id: text('id').primaryKey(),
  discountCodeId: text('discount_code_id').notNull().references(() => discountCodes.id),
  dayOfWeek: integer('day_of_week').notNull(),
  productId: text('product_id').notNull().references(() => products.id),
}, (t) => [
  unique('discount_day_products_unique').on(t.discountCodeId, t.dayOfWeek),
])

// ─── Expenses ──────────────────────────────────────────────────
export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  amount: real('amount').notNull(),
  type: text('type').notNull().default('monthly'), // 'monthly' | 'one-time'
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

// ─── Addon / Modifier recipes (ingredient consumption) ────────
export const addonRecipes = sqliteTable('addon_recipes', {
  id: text('id').primaryKey(),
  addonId: text('addon_id').notNull().references(() => addons.id),
  ingredientId: text('ingredient_id').references(() => ingredients.id),
  quantityPerUnit: real('quantity_per_unit').notNull(),
  subRecipeId: text('sub_recipe_id').references(() => subRecipes.id),
})

export const modifierRecipes = sqliteTable('modifier_recipes', {
  id: text('id').primaryKey(),
  modifierId: text('modifier_id').notNull().references(() => modifiers.id),
  ingredientId: text('ingredient_id').references(() => ingredients.id),
  quantityPerUnit: real('quantity_per_unit').notNull(),
  subRecipeId: text('sub_recipe_id').references(() => subRecipes.id),
})

// ─── Customers (delivery autocomplete) ─────────────────────────
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull().unique(),
  name: text('name'),
  address: text('address'),
  orderCount: integer('order_count').notNull().default(0),
  lastOrderAt: text('last_order_at'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('customers_phone_idx').on(t.phone),
])

// ─── Audit log ─────────────────────────────────────────────────
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  deviceLabel: text('device_label'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  before: text('before'),
  after: text('after'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('audit_log_created_idx').on(t.createdAt),
  index('audit_log_entity_idx').on(t.entity, t.entityId),
])

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

export const purchasePriceHistoryRelations = relations(purchasePriceHistory, ({ one }) => ({
  ingredient: one(ingredients, { fields: [purchasePriceHistory.ingredientId], references: [ingredients.id] }),
}))

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  shift: one(shifts, { fields: [cashMovements.shiftId], references: [shifts.id] }),
}))

export const addonRecipesRelations = relations(addonRecipes, ({ one }) => ({
  addon: one(addons, { fields: [addonRecipes.addonId], references: [addons.id] }),
  ingredient: one(ingredients, { fields: [addonRecipes.ingredientId], references: [ingredients.id] }),
}))

export const modifierRecipesRelations = relations(modifierRecipes, ({ one }) => ({
  modifier: one(modifiers, { fields: [modifierRecipes.modifierId], references: [modifiers.id] }),
  ingredient: one(ingredients, { fields: [modifierRecipes.ingredientId], references: [ingredients.id] }),
}))
