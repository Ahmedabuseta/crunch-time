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
    { id: 'cat-burgers', name: 'برجر', emoji: '🍔', color: 'var(--cat-burgers)', sortOrder: 1, active: true },
    { id: 'cat-pizza', name: 'بيتزا', emoji: '🍕', color: 'var(--cat-pizza)', sortOrder: 2, active: true },
    { id: 'cat-chicken', name: 'دجاج', emoji: '🍗', color: 'var(--cat-chicken)', sortOrder: 3, active: true },
    { id: 'cat-sides', name: 'أطباق جانبية', emoji: '🍟', color: 'var(--cat-sides)', sortOrder: 4, active: true },
    { id: 'cat-drinks', name: 'مشروبات', emoji: '🥤', color: 'var(--cat-drinks)', sortOrder: 5, active: true },
    { id: 'cat-desserts', name: 'حلويات', emoji: '🍦', color: 'var(--cat-desserts)', sortOrder: 6, active: true },
  ]) tables.categories.insert(c)

  // Products
  for (const p of [
    { id: 'b1', name: 'برجر كلاسيك', price: 85, categoryId: 'cat-burgers', emoji: '🍔', description: 'لحم، خس، طماطم', active: true },
    { id: 'b2', name: 'برجر جبنة', price: 95, categoryId: 'cat-burgers', emoji: '🧀', description: 'جبنة مزدوجة، مخلل، بصل', active: true },
    { id: 'b3', name: 'برجر بيكون', price: 110, categoryId: 'cat-burgers', emoji: '🥓', description: 'بيكون مقرمش، صوص باربكيو', active: true },
    { id: 'b4', name: 'برجر فطر', price: 105, categoryId: 'cat-burgers', emoji: '🍄', description: 'جبنة سويسري، فطر', active: true },
    { id: 'p1', name: 'مارغريتا', price: 120, categoryId: 'cat-pizza', emoji: '🍕', description: 'طماطم، موزاريلا، ريحان', active: true },
    { id: 'p2', name: 'بيبروني', price: 145, categoryId: 'cat-pizza', emoji: '🌶️', description: 'بيبروني مزدوج، موزاريلا', active: true },
    { id: 'p3', name: 'دجاج باربكيو', price: 155, categoryId: 'cat-pizza', emoji: '🍗', description: 'صوص باربكيو، دجاج، بصل أحمر', active: true },
    { id: 'p4', name: 'خضار', price: 130, categoryId: 'cat-pizza', emoji: '🥬', description: 'خضار مشكلة، زيتون، فيتا', active: true },
    { id: 'c1', name: 'ناجت دجاج (6)', price: 65, categoryId: 'cat-chicken', emoji: '🍗', description: 'ناجت ذهبي مقرمش', active: true },
    { id: 'c2', name: 'أجنحة دجاج (8)', price: 105, categoryId: 'cat-chicken', emoji: '🍗', description: 'صوص بوفالو أو باربكيو', active: true },
    { id: 'c3', name: 'ساندويتش دجاج', price: 90, categoryId: 'cat-chicken', emoji: '🥪', description: 'دجاج مقرمش، كول سلو، مخلل', active: true },
    { id: 's1', name: 'بطاطس مقلية', price: 35, categoryId: 'cat-sides', emoji: '🍟', description: 'بطاطس ذهبية مقرمشة', active: true },
    { id: 's2', name: 'حلقات بصل', price: 45, categoryId: 'cat-sides', emoji: '🧅', description: 'حلقات بصل مقرمشة', active: true },
    { id: 's3', name: 'أصابع موزاريلا', price: 55, categoryId: 'cat-sides', emoji: '🧀', description: 'مع صوص مارينارا', active: true },
    { id: 's4', name: 'كول سلو', price: 25, categoryId: 'cat-sides', emoji: '🥗', description: 'كول سلو كريمي', active: true },
    { id: 'd1', name: 'كولا', price: 20, categoryId: 'cat-drinks', emoji: '🥤', description: 'كولا باردة', active: true },
    { id: 'd2', name: 'ليمونادة', price: 25, categoryId: 'cat-drinks', emoji: '🍋', description: 'ليمون طازج', active: true },
    { id: 'd3', name: 'ميلك شيك', price: 50, categoryId: 'cat-drinks', emoji: '🥛', description: 'فانيليا، شوكولاتة، أو فراولة', active: true },
    { id: 'd4', name: 'شاي مثلج', price: 20, categoryId: 'cat-drinks', emoji: '🍵', description: 'محلى أو بدون سكر', active: true },
    { id: 'e1', name: 'آيس كريم صنداي', price: 45, categoryId: 'cat-desserts', emoji: '🍦', description: '3 سكوب، صوص شوكولاتة، كرز', active: true },
    { id: 'e2', name: 'تفاح محشو', price: 35, categoryId: 'cat-desserts', emoji: '🥧', description: 'دافئ بالقرفة', active: true },
    { id: 'e3', name: 'براوني', price: 30, categoryId: 'cat-desserts', emoji: '🍫', description: 'براوني شوكولاتة', active: true },
  ]) tables.products.insert(p)

  // Addons
  for (const a of [
    { id: 'addon-cheese', name: 'جبنة إضافية', price: 5, emoji: '🧀', active: true },
    { id: 'addon-bacon', name: 'بيكون', price: 10, emoji: '🥓', active: true },
    { id: 'addon-sauce', name: 'صلصة خاصة', price: 3, emoji: '🫙', active: true },
    { id: 'addon-fries', name: 'بطاطس زيادة', price: 8, emoji: '🍟', active: true },
    { id: 'addon-drink', name: 'مشروب كبير', price: 7, emoji: '🥤', active: true },
    { id: 'addon-onion', name: 'حلقات بصل', price: 8, emoji: '🧅', active: true },
    { id: 'addon-coleslaw', name: 'كول سلو', price: 5, emoji: '🥗', active: true },
    { id: 'addon-pickle', name: 'مخلل', price: 2, emoji: '🥒', active: true },
  ]) tables.addons.insert(a)

  // Modifier groups + modifiers
  tables.modifierGroups.insert({ id: 'grp-size', name: 'الحجم', type: 'single-select', sortOrder: 1, active: true })
  tables.modifierGroups.insert({ id: 'grp-sauce', name: 'الصوص', type: 'multi-select', sortOrder: 2, active: true })
  tables.modifierGroups.insert({ id: 'grp-cooking', name: 'السلق', type: 'single-select', sortOrder: 3, active: true })
  tables.modifierGroups.insert({ id: 'grp-extras', name: 'إضافات المشروبات', type: 'multi-select', sortOrder: 4, active: true })
  for (const m of [
    { id: 'mod-regular', modifierGroupId: 'grp-size', name: 'عادي', priceAdjustment: 0, sortOrder: 1, active: true },
    { id: 'mod-large', modifierGroupId: 'grp-size', name: 'كبير', priceAdjustment: 30, sortOrder: 2, active: true },
    { id: 'mod-xl', modifierGroupId: 'grp-size', name: 'XL', priceAdjustment: 50, sortOrder: 3, active: true },
    { id: 'mod-bbq', modifierGroupId: 'grp-sauce', name: 'باربكيو', priceAdjustment: 0, sortOrder: 1, active: true },
    { id: 'mod-garlic', modifierGroupId: 'grp-sauce', name: 'ثوم', priceAdjustment: 0, sortOrder: 2, active: true },
    { id: 'mod-spicy', modifierGroupId: 'grp-sauce', name: 'حار', priceAdjustment: 10, sortOrder: 3, active: true },
    { id: 'mod-well-done', modifierGroupId: 'grp-cooking', name: 'مستوي', priceAdjustment: 0, sortOrder: 1, active: true },
    { id: 'mod-medium', modifierGroupId: 'grp-cooking', name: 'متوسط', priceAdjustment: 0, sortOrder: 2, active: true },
    { id: 'mod-rare', modifierGroupId: 'grp-cooking', name: 'نيء', priceAdjustment: 0, sortOrder: 3, active: true },
    { id: 'mod-ice', modifierGroupId: 'grp-extras', name: 'ثلج', priceAdjustment: 0, sortOrder: 1, active: true },
    { id: 'mod-lemon', modifierGroupId: 'grp-extras', name: 'ليمون', priceAdjustment: 5, sortOrder: 2, active: true },
    { id: 'mod-mint', modifierGroupId: 'grp-extras', name: 'نعناع', priceAdjustment: 5, sortOrder: 3, active: true },
  ]) tables.modifiers.insert(m)

  // Link size to burgers + pizza
  for (const pid of ['b1', 'b2', 'b3', 'b4', 'p1', 'p2', 'p3', 'p4']) tables.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-size' })
  // Link sauce to burgers
  for (const pid of ['b1', 'b2', 'b3', 'b4']) tables.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-sauce' })
  // Link cooking to chicken
  for (const pid of ['c1', 'c2', 'c3']) tables.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-cooking' })
  // Link extras to drinks
  for (const pid of ['d1', 'd2', 'd3', 'd4']) tables.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-extras' })

  // Ingredients
  for (const i of [
    { id: 'ing-bread', name: 'خبز', unit: 'pcs', stockQuantity: 200, minStock: 20, costPerUnit: 3, active: true },
    { id: 'ing-beef', name: 'لحم بقري', unit: 'g', stockQuantity: 10000, minStock: 1000, costPerUnit: 0.2, active: true },
    { id: 'ing-chicken', name: 'صدر دجاج', unit: 'g', stockQuantity: 8000, minStock: 1000, costPerUnit: 0.15, active: true },
    { id: 'ing-cheese', name: 'جبنة', unit: 'g', stockQuantity: 5000, minStock: 500, costPerUnit: 0.1, active: true },
    { id: 'ing-potato', name: 'بطاطس', unit: 'g', stockQuantity: 15000, minStock: 2000, costPerUnit: 0.03, active: true },
    { id: 'ing-cola', name: 'كولا', unit: 'ml', stockQuantity: 20000, minStock: 2000, costPerUnit: 0.01, active: true },
  ]) tables.ingredients.insert(i)

  // Recipes
  for (const r of [
    { id: 'r1', productId: 'b1', ingredientId: 'ing-bread', quantityPerUnit: 1 },
    { id: 'r2', productId: 'b1', ingredientId: 'ing-beef', quantityPerUnit: 150 },
    { id: 'r3', productId: 'b2', ingredientId: 'ing-bread', quantityPerUnit: 1 },
    { id: 'r4', productId: 'b2', ingredientId: 'ing-beef', quantityPerUnit: 150 },
    { id: 'r5', productId: 'b2', ingredientId: 'ing-cheese', quantityPerUnit: 40 },
    { id: 'r6', productId: 's1', ingredientId: 'ing-potato', quantityPerUnit: 200 },
    { id: 'r7', productId: 'd1', ingredientId: 'ing-cola', quantityPerUnit: 330 },
  ]) tables.recipes.insert(r)

  // Users
  const ts = now()
  tables.users.insert({ id: 'user-admin', name: 'مدير', pin: '0000', pinHash: '$argon2id$placeholder', role: 'admin', active: true, createdAt: ts })
  tables.users.insert({ id: 'user-cashier', name: 'كاشير', pin: '1234', pinHash: '$argon2id$placeholder', role: 'cashier', active: true, createdAt: ts })
}

seed()

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════

export const rendererApi = {
  category: {
    list: () => tables.categories.select(r => r.active).sort((a, b) => a.sortOrder - b.sortOrder),
    create: (data: any) => { const id = uuid(); tables.categories.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { tables.categories.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { tables.categories.update(r => r.id === id, { active: false }); return { ok: true } },
    reorder: (ids: string[]) => { ids.forEach((id, i) => tables.categories.update(r => r.id === id, { sortOrder: i })); return { ok: true } },
  },
  product: {
    list: (categoryId?: string) => {
      if (categoryId) return tables.products.select(r => r.active && r.categoryId === categoryId)
      return tables.products.select(r => r.active)
    },
    getById: (id: string) => tables.products.get(r => r.id === id) || null,
    create: (data: any) => { const id = uuid(); tables.products.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { tables.products.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { tables.products.update(r => r.id === id, { active: false }); return { ok: true } },
  },
  addon: {
    list: () => tables.addons.select(r => r.active),
    create: (data: any) => { const id = uuid(); tables.addons.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { tables.addons.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { tables.addons.update(r => r.id === id, { active: false }); return { ok: true } },
    listByProduct: (productId: string) => {
      const links = tables.productAddons.select(r => r.productId === productId)
      return links.map(l => tables.addons.get(a => a.id === l.addonId)).filter(Boolean)
    },
    linkToProduct: (productId: string, addonId: string) => { tables.productAddons.insert({ productId: productId, addonId: addonId }); return { ok: true } },
  },
  modifier: {
    listGroups: () => tables.modifierGroups.select(r => r.active).sort((a, b) => a.sortOrder - b.sortOrder),
    createGroup: (data: any) => { const id = uuid(); tables.modifierGroups.insert({ id, ...data, active: true }); return { id } },
    updateGroup: (id: string, data: any) => { tables.modifierGroups.update(r => r.id === id, data); return { ok: true } },
    deleteGroup: (id: string) => { tables.modifierGroups.update(r => r.id === id, { active: false }); return { ok: true } },
    listByGroup: (groupId: string) => tables.modifiers.select(r => r.active && r.modifierGroupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder),
    createModifier: (data: any) => { const id = uuid(); tables.modifiers.insert({ id, ...data, active: true }); return { id } },
    updateModifier: (id: string, data: any) => { tables.modifiers.update(r => r.id === id, data); return { ok: true } },
    deleteModifier: (id: string) => { tables.modifiers.update(r => r.id === id, { active: false }); return { ok: true } },
    listByProduct: (productId: string) => {
      const links = tables.productModifierGroups.select(r => r.productId === productId)
      return links.map(l => {
        const group = tables.modifierGroups.get(g => g.id === l.modifierGroupId)
        if (!group) return null
        return { ...group, modifiers: tables.modifiers.select(r => r.active && r.modifierGroupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder) }
      }).filter(Boolean)
    },
    linkToProduct: (productId: string, groupId: string) => { tables.productModifierGroups.insert({ productId: productId, modifierGroupId: groupId }); return { ok: true } },
  },
  order: {
    create: (data: any) => {
      const id = `#${Date.now().toString().slice(-6)}`
      const ts = now()
      tables.orders.insert({ id, status: 'PAID', orderType: data.orderType, tableNumber: data.tableNumber || null, deliveryAddress: data.deliveryAddress || null, deliveryPhone: data.deliveryPhone || null, subtotal: data.subtotal, tax: data.tax, deliveryFee: data.deliveryFee || 0, total: data.total, userId: data.userId || null, shiftId: data.shiftId || null, createdAt: ts, updatedAt: ts })
      for (const item of data.items) {
        tables.orderItems.insert({ id: uuid(), orderId: id, productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice, selectedModifiersJson: item.modifiers ? JSON.stringify(item.modifiers) : null, selectedAddonsJson: item.addons ? JSON.stringify(item.addons) : null })
      }
      return { id }
    },
    list: () => tables.orders.select().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    getById: (id: string) => {
      const order = tables.orders.get(r => r.id === id)
      if (!order) return null
      return { ...order, items: tables.orderItems.select(r => r.orderId === id), payments: tables.payments.select(r => r.orderId === id) }
    },
    updateStatus: (id: string, status: string) => { tables.orders.update(r => r.id === id, { status, updatedAt: now() }); return { ok: true } },
    delete: (id: string) => { tables.orders.update(r => r.id === id, { status: 'CANCELLED', updatedAt: now() }); return { ok: true } },
  },
  payment: {
    create: (data: any) => { const id = uuid(); tables.payments.insert({ id, ...data, createdAt: now() }); return { id } },
    listByOrder: (orderId: string) => tables.payments.select(r => r.orderId === orderId),
    getTotalPaid: (orderId: string) => tables.payments.select(r => r.orderId === orderId).reduce((s, p) => s + p.amount, 0),
  },
  user: {
    list: () => tables.users.select(r => r.active).map(({ pinHash, pin, ...u }) => u),
    create: (data: any) => { const id = uuid(); tables.users.insert({ id, ...data, pinHash: '$placeholder', active: true, createdAt: now() }); return { id } },
    update: (id: string, data: any) => { tables.users.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { tables.users.update(r => r.id === id, { active: false }); return { ok: true } },
    verifyPin: (id: string, pin: string) => {
      const user = tables.users.get(r => r.id === id && r.active)
      if (!user) return { ok: false, error: 'المستخدم غير موجود' }
      if (user.pin !== pin) return { ok: false, error: 'الرقم السري غلط' }
      return { ok: true, user: { id: user.id, name: user.name, role: user.role } }
    },
  },
  shift: {
    open: (data: any) => { const id = uuid(); tables.shifts.insert({ id, userId: data.userId, startedAt: now(), openingCash: data.openingCash, status: 'open' }); return { id } },
    close: (id: string, closingCash: number) => { tables.shifts.update(r => r.id === id, { endedAt: now(), closingCash: closingCash, status: 'closed' }); return { ok: true } },
    getCurrent: () => tables.shifts.get(r => r.status === 'open') || null,
    list: (filters?: any) => {
      if (filters?.userId) return tables.shifts.select(r => r.userId === filters.userId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      return tables.shifts.select().sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    },
  },
  cashDrawer: {
    addMovement: (data: any) => { const id = uuid(); tables.cashMovements.insert({ id, ...data, createdAt: now() }); return { id } },
    listByShift: (shiftId: string) => tables.cashMovements.select(r => r.shiftId === shiftId),
    reconcile: () => null,
  },
  inventory: {
    listIngredients: () => tables.ingredients.select(r => r.active),
    createIngredient: (data: any) => { const id = uuid(); tables.ingredients.insert({ id, ...data, active: true }); return { id } },
    updateIngredient: (id: string, data: any) => { tables.ingredients.update(r => r.id === id, data); return { ok: true } },
    deleteIngredient: (id: string) => { tables.ingredients.update(r => r.id === id, { active: false }); return { ok: true } },
    listRecipes: (productId: string) => tables.recipes.select(r => r.productId === productId),
    upsertRecipe: (data: any) => { if (data.id) { tables.recipes.update(r => r.id === data.id, { quantityPerUnit: data.quantityPerUnit }); return { id: data.id } } const id = uuid(); tables.recipes.insert({ id, ...data }); return { id } },
    deleteRecipe: (id: string) => { tables.recipes.delete(r => r.id === id); return { ok: true } },
    getAlerts: () => tables.ingredients.select(r => r.active && r.stockQuantity <= r.minStock),
    restock: (ingredientId: string, qty: number, note?: string) => {
      const ing = tables.ingredients.get(r => r.id === ingredientId)
      if (ing) ing.stockQuantity += qty
      tables.inventoryTransactions.insert({ id: uuid(), ingredientId: ingredientId, type: 'PURCHASE', quantity: qty, note: note || 'إعادة تعبئة', createdAt: now() })
      return { ok: true }
    },
    deductForOrder: (orderId: string) => {
      const items = tables.orderItems.select(r => r.orderId === orderId)
      for (const item of items) {
        const recipeItems = tables.recipes.select(r => r.productId === item.productId)
        for (const r of recipeItems) {
          const deduction = r.quantityPerUnit * item.quantity
          const ing = tables.ingredients.get(i => i.id === r.ingredientId)
          if (ing) ing.stockQuantity -= deduction
          tables.inventoryTransactions.insert({ id: uuid(), ingredientId: r.ingredientId, type: 'CONSUMPTION', quantity: -deduction, reference_orderId: orderId, note: `استهلاك طلب ${orderId}`, createdAt: now() })
        }
      }
      return { ok: true }
    },
  },
  report: {
    dailySummary: (date?: string) => {
      const targetDate = date || new Date().toISOString().slice(0, 10)
      const all = tables.orders.select()
      const dayOrders = all.filter(o => o.createdAt?.startsWith(targetDate) && o.status !== 'CANCELLED')
      const cancelled = all.filter(o => o.createdAt?.startsWith(targetDate) && o.status === 'CANCELLED')
      const revenue = dayOrders.reduce((s, o) => s + o.total, 0)
      return { date: targetDate, totalOrders: dayOrders.length, totalRevenue: revenue, avgOrderValue: dayOrders.length > 0 ? revenue / dayOrders.length : 0, cancelledOrders: cancelled.length, cancellationRate: 0 }
    },
    hourlyBreakdown: () => [],
    topItems: (limit = 10) => {
      const allItems = tables.orderItems.select()
      const productMap = new Map(tables.products.select().map(p => [p.id, p]))
      const counts: Record<string, any> = {}
      for (const item of allItems) {
        const p = productMap.get(item.productId)
        if (!p) continue
        if (!counts[p.id]) counts[p.id] = { name: p.name, emoji: p.emoji, totalQuantity: 0, totalRevenue: 0 }
        counts[p.id].totalQuantity += item.quantity
        counts[p.id].totalRevenue += item.unitPrice * item.quantity
      }
      return Object.values(counts).sort((a: any, b: any) => b.totalQuantity - a.totalQuantity).slice(0, limit)
    },
    categoryRevenue: () => {
      const allItems = tables.orderItems.select()
      const productMap = new Map(tables.products.select().map(p => [p.id, p]))
      const catMap = new Map(tables.categories.select().map(c => [c.id, c]))
      const catRevenue: Record<string, any> = {}
      for (const item of allItems) {
        const p = productMap.get(item.productId)
        if (!p) continue
        const c = catMap.get(p.categoryId)
        if (!c) continue
        if (!catRevenue[c.id]) catRevenue[c.id] = { categoryId: c.id, name: c.name, totalRevenue: 0 }
        catRevenue[c.id].totalRevenue += item.unitPrice * item.quantity
      }
      return Object.values(catRevenue).sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
    },
    addonStats: () => [],
    ticketDistribution: () => [],
    orderTypeSplit: () => {
      const all = tables.orders.select(r => r.status !== 'CANCELLED')
      const delivery = all.filter(o => o.orderType === 'delivery')
      const dineIn = all.filter(o => o.orderType === 'dine-in')
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
        const dayOrders = all.filter(o => o.createdAt?.startsWith(date))
        result.push({ date, revenue: dayOrders.reduce((s, o) => s + o.total, 0), orderCount: dayOrders.length })
      }
      return result
    },
    inventoryAlerts: () => tables.ingredients.select(r => r.active && r.stockQuantity <= r.minStock),
    paymentMethodBreakdown: () => [],
  },
  backup: { trigger: () => ({ ok: true }), getStatus: () => ({ lastBackup: null, backupCount: 0 }) },
}

// Export for tests
export function getTable(name: keyof typeof tables) { return tables[name] }
