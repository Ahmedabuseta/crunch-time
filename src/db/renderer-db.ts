// Pure JavaScript in-memory store (no native modules, works everywhere)
// Same API shape as IPC handlers

type Row = Record<string, any>

class Table {
  rows: Row[] = []
  insert(row: Row) { this.rows.push({ ...row }) }
  select(where?: (r: Row) => boolean): Row[] { return where ? this.rows.filter(where) : [...this.rows] }
  get(where: (r: Row) => boolean): Row | undefined { return this.rows.find(where) }
  update(where: (r: Row) => boolean, set: Partial<Row>) {
    this.rows.forEach(r => { if (where(r)) Object.assign(r, set) })
  }
  delete(where: (r: Row) => boolean) { this.rows = this.rows.filter(r => !where(r)) }
  count(where?: (r: Row) => boolean): number { return this.select(where).length }
}

const tables = {
  categories: new Table(),
  products: new Table(),
  addons: new Table(),
  productAddons: new Table(),
  modifierGroups: new Table(),
  modifiers: new Table(),
  productModifierGroups: new Table(),
  users: new Table(),
  shifts: new Table(),
  orders: new Table(),
  orderItems: new Table(),
  payments: new Table(),
  ingredients: new Table(),
  recipes: new Table(),
  inventoryTransactions: new Table(),
  cashMovements: new Table(),
}

function uuid() { return crypto.randomUUID() }
function now() { return new Date().toISOString() }

function seed() {
  // Categories
  for (const c of [
    { id: 'cat-burgers', name: 'برجر', emoji: '🍔', color: 'var(--cat-burgers)', sort_order: 1, active: 1 },
    { id: 'cat-pizza', name: 'بيتزا', emoji: '🍕', color: 'var(--cat-pizza)', sort_order: 2, active: 1 },
    { id: 'cat-chicken', name: 'دجاج', emoji: '🍗', color: 'var(--cat-chicken)', sort_order: 3, active: 1 },
    { id: 'cat-sides', name: 'أطباق جانبية', emoji: '🍟', color: 'var(--cat-sides)', sort_order: 4, active: 1 },
    { id: 'cat-drinks', name: 'مشروبات', emoji: '🥤', color: 'var(--cat-drinks)', sort_order: 5, active: 1 },
    { id: 'cat-desserts', name: 'حلويات', emoji: '🍦', color: 'var(--cat-desserts)', sort_order: 6, active: 1 },
  ]) tables.categories.insert(c)

  // Products
  for (const p of [
    { id: 'b1', name: 'برجر كلاسيك', price: 85, category_id: 'cat-burgers', emoji: '🍔', description: 'لحم، خس، طماطم', active: 1 },
    { id: 'b2', name: 'برجر جبنة', price: 95, category_id: 'cat-burgers', emoji: '🧀', description: 'جبنة مزدوجة، مخلل، بصل', active: 1 },
    { id: 'b3', name: 'برجر بيكون', price: 110, category_id: 'cat-burgers', emoji: '🥓', description: 'بيكون مقرمش، صوص باربكيو', active: 1 },
    { id: 'b4', name: 'برجر فطر', price: 105, category_id: 'cat-burgers', emoji: '🍄', description: 'جبنة سويسري، فطر', active: 1 },
    { id: 'p1', name: 'مارغريتا', price: 120, category_id: 'cat-pizza', emoji: '🍕', description: 'طماطم، موزاريلا، ريحان', active: 1 },
    { id: 'p2', name: 'بيبروني', price: 145, category_id: 'cat-pizza', emoji: '🌶️', description: 'بيبروني مزدوج، موزاريلا', active: 1 },
    { id: 'p3', name: 'دجاج باربكيو', price: 155, category_id: 'cat-pizza', emoji: '🍗', description: 'صوص باربكيو، دجاج، بصل أحمر', active: 1 },
    { id: 'p4', name: 'خضار', price: 130, category_id: 'cat-pizza', emoji: '🥬', description: 'خضار مشكلة، زيتون، فيتا', active: 1 },
    { id: 'c1', name: 'ناجت دجاج (6)', price: 65, category_id: 'cat-chicken', emoji: '🍗', description: 'ناجت ذهبي مقرمش', active: 1 },
    { id: 'c2', name: 'أجنحة دجاج (8)', price: 105, category_id: 'cat-chicken', emoji: '🍗', description: 'صوص بوفالو أو باربكيو', active: 1 },
    { id: 'c3', name: 'ساندويتش دجاج', price: 90, category_id: 'cat-chicken', emoji: '🥪', description: 'دجاج مقرمش، كول سلو، مخلل', active: 1 },
    { id: 's1', name: 'بطاطس مقلية', price: 35, category_id: 'cat-sides', emoji: '🍟', description: 'بطاطس ذهبية مقرمشة', active: 1 },
    { id: 's2', name: 'حلقات بصل', price: 45, category_id: 'cat-sides', emoji: '🧅', description: 'حلقات بصل مقرمشة', active: 1 },
    { id: 's3', name: 'أصابع موزاريلا', price: 55, category_id: 'cat-sides', emoji: '🧀', description: 'مع صوص مارينارا', active: 1 },
    { id: 's4', name: 'كول سلو', price: 25, category_id: 'cat-sides', emoji: '🥗', description: 'كول سلو كريمي', active: 1 },
    { id: 'd1', name: 'كولا', price: 20, category_id: 'cat-drinks', emoji: '🥤', description: 'كولا باردة', active: 1 },
    { id: 'd2', name: 'ليمونادة', price: 25, category_id: 'cat-drinks', emoji: '🍋', description: 'ليمون طازج', active: 1 },
    { id: 'd3', name: 'ميلك شيك', price: 50, category_id: 'cat-drinks', emoji: '🥛', description: 'فانيليا، شوكولاتة، أو فراولة', active: 1 },
    { id: 'd4', name: 'شاي مثلج', price: 20, category_id: 'cat-drinks', emoji: '🍵', description: 'محلى أو بدون سكر', active: 1 },
    { id: 'e1', name: 'آيس كريم صنداي', price: 45, category_id: 'cat-desserts', emoji: '🍦', description: '3 سكوب، صوص شوكولاتة، كرز', active: 1 },
    { id: 'e2', name: 'تفاح محشو', price: 35, category_id: 'cat-desserts', emoji: '🥧', description: 'دافئ بالقرفة', active: 1 },
    { id: 'e3', name: 'براوني', price: 30, category_id: 'cat-desserts', emoji: '🍫', description: 'براوني شوكولاتة', active: 1 },
  ]) tables.products.insert(p)

  // Addons
  for (const a of [
    { id: 'addon-cheese', name: 'جبنة إضافية', price: 5, emoji: '🧀', active: 1 },
    { id: 'addon-bacon', name: 'بيكون', price: 10, emoji: '🥓', active: 1 },
    { id: 'addon-sauce', name: 'صلصة خاصة', price: 3, emoji: '🫙', active: 1 },
    { id: 'addon-fries', name: 'بطاطس زيادة', price: 8, emoji: '🍟', active: 1 },
    { id: 'addon-drink', name: 'مشروب كبير', price: 7, emoji: '🥤', active: 1 },
    { id: 'addon-onion', name: 'حلقات بصل', price: 8, emoji: '🧅', active: 1 },
    { id: 'addon-coleslaw', name: 'كول سلو', price: 5, emoji: '🥗', active: 1 },
    { id: 'addon-pickle', name: 'مخلل', price: 2, emoji: '🥒', active: 1 },
  ]) tables.addons.insert(a)

  // Modifier groups + modifiers
  tables.modifierGroups.insert({ id: 'grp-size', name: 'الحجم', type: 'single-select', sort_order: 1, active: 1 })
  tables.modifierGroups.insert({ id: 'grp-sauce', name: 'الصوص', type: 'multi-select', sort_order: 2, active: 1 })
  for (const m of [
    { id: 'mod-regular', modifier_group_id: 'grp-size', name: 'عادي', price_adjustment: 0, sort_order: 1, active: 1 },
    { id: 'mod-large', modifier_group_id: 'grp-size', name: 'كبير', price_adjustment: 30, sort_order: 2, active: 1 },
    { id: 'mod-xl', modifier_group_id: 'grp-size', name: 'XL', price_adjustment: 50, sort_order: 3, active: 1 },
    { id: 'mod-bbq', modifier_group_id: 'grp-sauce', name: 'باربكيو', price_adjustment: 0, sort_order: 1, active: 1 },
    { id: 'mod-garlic', modifier_group_id: 'grp-sauce', name: 'ثوم', price_adjustment: 0, sort_order: 2, active: 1 },
    { id: 'mod-spicy', modifier_group_id: 'grp-sauce', name: 'حار', price_adjustment: 10, sort_order: 3, active: 1 },
  ]) tables.modifiers.insert(m)

  for (const pid of ['b1', 'b2', 'b3', 'b4', 'p1', 'p2', 'p3', 'p4']) {
    tables.productModifierGroups.insert({ product_id: pid, modifier_group_id: 'grp-size' })
  }
  for (const pid of ['b1', 'b2', 'b3', 'b4']) {
    tables.productModifierGroups.insert({ product_id: pid, modifier_group_id: 'grp-sauce' })
  }

  // Ingredients
  for (const i of [
    { id: 'ing-bread', name: 'خبز', unit: 'pcs', stock_quantity: 200, min_stock: 20, cost_per_unit: 3, active: 1 },
    { id: 'ing-beef', name: 'لحم بقري', unit: 'g', stock_quantity: 10000, min_stock: 1000, cost_per_unit: 0.2, active: 1 },
    { id: 'ing-chicken', name: 'صدر دجاج', unit: 'g', stock_quantity: 8000, min_stock: 1000, cost_per_unit: 0.15, active: 1 },
    { id: 'ing-cheese', name: 'جبنة', unit: 'g', stock_quantity: 5000, min_stock: 500, cost_per_unit: 0.1, active: 1 },
    { id: 'ing-potato', name: 'بطاطس', unit: 'g', stock_quantity: 15000, min_stock: 2000, cost_per_unit: 0.03, active: 1 },
    { id: 'ing-cola', name: 'كولا', unit: 'ml', stock_quantity: 20000, min_stock: 2000, cost_per_unit: 0.01, active: 1 },
  ]) tables.ingredients.insert(i)

  // Recipes
  for (const r of [
    { id: 'r1', product_id: 'b1', ingredient_id: 'ing-bread', quantity_per_unit: 1 },
    { id: 'r2', product_id: 'b1', ingredient_id: 'ing-beef', quantity_per_unit: 150 },
    { id: 'r3', product_id: 'b2', ingredient_id: 'ing-bread', quantity_per_unit: 1 },
    { id: 'r4', product_id: 'b2', ingredient_id: 'ing-beef', quantity_per_unit: 150 },
    { id: 'r5', product_id: 'b2', ingredient_id: 'ing-cheese', quantity_per_unit: 40 },
    { id: 'r6', product_id: 's1', ingredient_id: 'ing-potato', quantity_per_unit: 200 },
    { id: 'r7', product_id: 'd1', ingredient_id: 'ing-cola', quantity_per_unit: 330 },
  ]) tables.recipes.insert(r)

  // Users
  const ts = now()
  tables.users.insert({ id: 'user-admin', name: 'مدير', pin: '0000', pin_hash: '$argon2id$placeholder', role: 'admin', active: 1, created_at: ts })
  tables.users.insert({ id: 'user-cashier', name: 'كاشير', pin: '1234', pin_hash: '$argon2id$placeholder', role: 'cashier', active: 1, created_at: ts })
}

seed()

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════

export const rendererApi = {
  category: {
    list: () => tables.categories.select(r => r.active === 1).sort((a, b) => a.sort_order - b.sort_order),
    create: (data: any) => { const id = uuid(); tables.categories.insert({ id, ...data, active: 1 }); return { id } },
    update: (id: string, data: any) => { tables.categories.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { tables.categories.update(r => r.id === id, { active: 0 }); return { ok: true } },
    reorder: (ids: string[]) => { ids.forEach((id, i) => tables.categories.update(r => r.id === id, { sort_order: i })); return { ok: true } },
  },
  product: {
    list: (categoryId?: string) => {
      if (categoryId) return tables.products.select(r => r.active === 1 && r.category_id === categoryId)
      return tables.products.select(r => r.active === 1)
    },
    getById: (id: string) => tables.products.get(r => r.id === id) || null,
    create: (data: any) => { const id = uuid(); tables.products.insert({ id, ...data, active: 1 }); return { id } },
    update: (id: string, data: any) => { tables.products.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { tables.products.update(r => r.id === id, { active: 0 }); return { ok: true } },
  },
  addon: {
    list: () => tables.addons.select(r => r.active === 1),
    create: (data: any) => { const id = uuid(); tables.addons.insert({ id, ...data, active: 1 }); return { id } },
    update: (id: string, data: any) => { tables.addons.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { tables.addons.update(r => r.id === id, { active: 0 }); return { ok: true } },
    listByProduct: (productId: string) => {
      const links = tables.productAddons.select(r => r.product_id === productId)
      return links.map(l => tables.addons.get(a => a.id === l.addon_id)).filter(Boolean)
    },
    linkToProduct: (productId: string, addonId: string) => { tables.productAddons.insert({ product_id: productId, addon_id: addonId }); return { ok: true } },
  },
  modifier: {
    listGroups: () => tables.modifierGroups.select(r => r.active === 1).sort((a, b) => a.sort_order - b.sort_order),
    createGroup: (data: any) => { const id = uuid(); tables.modifierGroups.insert({ id, ...data, active: 1 }); return { id } },
    updateGroup: (id: string, data: any) => { tables.modifierGroups.update(r => r.id === id, data); return { ok: true } },
    deleteGroup: (id: string) => { tables.modifierGroups.update(r => r.id === id, { active: 0 }); return { ok: true } },
    listByGroup: (groupId: string) => tables.modifiers.select(r => r.active === 1 && r.modifier_group_id === groupId).sort((a, b) => a.sort_order - b.sort_order),
    createModifier: (data: any) => { const id = uuid(); tables.modifiers.insert({ id, ...data, active: 1 }); return { id } },
    updateModifier: (id: string, data: any) => { tables.modifiers.update(r => r.id === id, data); return { ok: true } },
    deleteModifier: (id: string) => { tables.modifiers.update(r => r.id === id, { active: 0 }); return { ok: true } },
    listByProduct: (productId: string) => {
      const links = tables.productModifierGroups.select(r => r.product_id === productId)
      return links.map(l => {
        const group = tables.modifierGroups.get(g => g.id === l.modifier_group_id)
        if (!group) return null
        return { ...group, modifiers: tables.modifiers.select(r => r.active === 1 && r.modifier_group_id === group.id).sort((a, b) => a.sort_order - b.sort_order) }
      }).filter(Boolean)
    },
    linkToProduct: (productId: string, groupId: string) => { tables.productModifierGroups.insert({ product_id: productId, modifier_group_id: groupId }); return { ok: true } },
  },
  order: {
    create: (data: any) => {
      const id = `#${Date.now().toString().slice(-6)}`
      const ts = now()
      tables.orders.insert({ id, status: 'PAID', order_type: data.orderType, table_number: data.tableNumber || null, delivery_address: data.deliveryAddress || null, delivery_phone: data.deliveryPhone || null, subtotal: data.subtotal, tax: data.tax, delivery_fee: data.deliveryFee || 0, total: data.total, user_id: data.userId || null, shift_id: data.shiftId || null, created_at: ts, updated_at: ts })
      for (const item of data.items) {
        tables.orderItems.insert({ id: uuid(), order_id: id, product_id: item.productId, quantity: item.quantity, unit_price: item.unitPrice, selected_modifiers_json: item.modifiers ? JSON.stringify(item.modifiers) : null, selected_addons_json: item.addons ? JSON.stringify(item.addons) : null })
      }
      return { id }
    },
    list: () => tables.orders.select().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    getById: (id: string) => {
      const order = tables.orders.get(r => r.id === id)
      if (!order) return null
      return { ...order, items: tables.orderItems.select(r => r.order_id === id), payments: tables.payments.select(r => r.order_id === id) }
    },
    updateStatus: (id: string, status: string) => { tables.orders.update(r => r.id === id, { status, updated_at: now() }); return { ok: true } },
    delete: (id: string) => { tables.orders.update(r => r.id === id, { status: 'CANCELLED', updated_at: now() }); return { ok: true } },
  },
  payment: {
    create: (data: any) => { const id = uuid(); tables.payments.insert({ id, ...data, created_at: now() }); return { id } },
    listByOrder: (orderId: string) => tables.payments.select(r => r.order_id === orderId),
    getTotalPaid: (orderId: string) => tables.payments.select(r => r.order_id === orderId).reduce((s, p) => s + p.amount, 0),
  },
  user: {
    list: () => tables.users.select(r => r.active === 1).map(({ pin_hash, pin, ...u }) => u),
    create: (data: any) => { const id = uuid(); tables.users.insert({ id, ...data, pin_hash: '$placeholder', active: 1, created_at: now() }); return { id } },
    update: (id: string, data: any) => { tables.users.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { tables.users.update(r => r.id === id, { active: 0 }); return { ok: true } },
    verifyPin: (id: string, pin: string) => {
      const user = tables.users.get(r => r.id === id && r.active === 1)
      if (!user) return { ok: false, error: 'المستخدم غير موجود' }
      if (user.pin !== pin) return { ok: false, error: 'الرقم السري غلط' }
      return { ok: true, user: { id: user.id, name: user.name, role: user.role } }
    },
  },
  shift: {
    open: (data: any) => { const id = uuid(); tables.shifts.insert({ id, user_id: data.userId, started_at: now(), opening_cash: data.openingCash, status: 'open' }); return { id } },
    close: (id: string, closingCash: number) => { tables.shifts.update(r => r.id === id, { ended_at: now(), closing_cash: closingCash, status: 'closed' }); return { ok: true } },
    getCurrent: () => tables.shifts.get(r => r.status === 'open') || null,
    list: (filters?: any) => {
      if (filters?.userId) return tables.shifts.select(r => r.user_id === filters.userId).sort((a, b) => b.started_at.localeCompare(a.started_at))
      return tables.shifts.select().sort((a, b) => b.started_at.localeCompare(a.started_at))
    },
  },
  cashDrawer: {
    addMovement: (data: any) => { const id = uuid(); tables.cashMovements.insert({ id, ...data, created_at: now() }); return { id } },
    listByShift: (shiftId: string) => tables.cashMovements.select(r => r.shift_id === shiftId),
    reconcile: () => null,
  },
  inventory: {
    listIngredients: () => tables.ingredients.select(r => r.active === 1),
    createIngredient: (data: any) => { const id = uuid(); tables.ingredients.insert({ id, ...data, active: 1 }); return { id } },
    updateIngredient: (id: string, data: any) => { tables.ingredients.update(r => r.id === id, data); return { ok: true } },
    deleteIngredient: (id: string) => { tables.ingredients.update(r => r.id === id, { active: 0 }); return { ok: true } },
    listRecipes: (productId: string) => tables.recipes.select(r => r.product_id === productId),
    upsertRecipe: (data: any) => { if (data.id) { tables.recipes.update(r => r.id === data.id, { quantity_per_unit: data.quantityPerUnit }); return { id: data.id } } const id = uuid(); tables.recipes.insert({ id, ...data }); return { id } },
    deleteRecipe: (id: string) => { tables.recipes.delete(r => r.id === id); return { ok: true } },
    getAlerts: () => tables.ingredients.select(r => r.active === 1 && r.stock_quantity <= r.min_stock),
    restock: (ingredientId: string, qty: number, note?: string) => {
      const ing = tables.ingredients.get(r => r.id === ingredientId)
      if (ing) ing.stock_quantity += qty
      tables.inventoryTransactions.insert({ id: uuid(), ingredient_id: ingredientId, type: 'PURCHASE', quantity: qty, note: note || 'إعادة تعبئة', created_at: now() })
      return { ok: true }
    },
    deductForOrder: (orderId: string) => {
      const items = tables.orderItems.select(r => r.order_id === orderId)
      for (const item of items) {
        const recipeItems = tables.recipes.select(r => r.product_id === item.product_id)
        for (const r of recipeItems) {
          const deduction = r.quantity_per_unit * item.quantity
          const ing = tables.ingredients.get(i => i.id === r.ingredient_id)
          if (ing) ing.stock_quantity -= deduction
          tables.inventoryTransactions.insert({ id: uuid(), ingredient_id: r.ingredient_id, type: 'CONSUMPTION', quantity: -deduction, reference_order_id: orderId, note: `استهلاك طلب ${orderId}`, created_at: now() })
        }
      }
      return { ok: true }
    },
  },
  report: {
    dailySummary: (date?: string) => {
      const targetDate = date || new Date().toISOString().slice(0, 10)
      const all = tables.orders.select()
      const dayOrders = all.filter(o => o.created_at?.startsWith(targetDate) && o.status !== 'CANCELLED')
      const cancelled = all.filter(o => o.created_at?.startsWith(targetDate) && o.status === 'CANCELLED')
      const revenue = dayOrders.reduce((s, o) => s + o.total, 0)
      return { date: targetDate, totalOrders: dayOrders.length, totalRevenue: revenue, avgOrderValue: dayOrders.length > 0 ? revenue / dayOrders.length : 0, cancelledOrders: cancelled.length, cancellationRate: 0 }
    },
    hourlyBreakdown: () => [],
    topItems: (limit = 10) => {
      const allItems = tables.orderItems.select()
      const productMap = new Map(tables.products.select().map(p => [p.id, p]))
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
      const allItems = tables.orderItems.select()
      const productMap = new Map(tables.products.select().map(p => [p.id, p]))
      const catMap = new Map(tables.categories.select().map(c => [c.id, c]))
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
      const all = tables.orders.select(r => r.status !== 'CANCELLED')
      const delivery = all.filter(o => o.order_type === 'delivery')
      const dineIn = all.filter(o => o.order_type === 'dine-in')
      const total = all.length || 1
      return {
        delivery: { count: delivery.length, revenue: delivery.reduce((s, o) => s + o.total, 0), percentage: delivery.length / total * 100 },
        dineIn: { count: dineIn.length, revenue: dineIn.reduce((s, o) => s + o.total, 0), percentage: dineIn.length / total * 100 },
      }
    },
    shiftReport: () => null,
    revenueTrend: (days = 7) => {
      const all = tables.orders.select(r => r.status !== 'CANCELLED')
      const result: any[] = []
      for (let d = days - 1; d >= 0; d--) {
        const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
        const dayOrders = all.filter(o => o.created_at?.startsWith(date))
        result.push({ date, revenue: dayOrders.reduce((s, o) => s + o.total, 0), orderCount: dayOrders.length })
      }
      return result
    },
    inventoryAlerts: () => tables.ingredients.select(r => r.active === 1 && r.stock_quantity <= r.min_stock),
    paymentMethodBreakdown: () => [],
  },
  backup: { trigger: () => ({ ok: true }), getStatus: () => ({ lastBackup: null, backupCount: 0 }) },
}

// Export for tests
export function getTable(name: keyof typeof tables) { return tables[name] }
