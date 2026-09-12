type Row = Record<string, any>

class Table {
  rows: Row[] = []
  insert(row: Row) { this.rows.push({ ...row }) }
  select(where?: (r: Row) => boolean): Row[] { return where ? this.rows.filter(where) : [...this.rows] }
  get(where: (r: Row) => boolean): Row | undefined { return this.rows.find(where) }
  update(where: (r: Row) => boolean, set: Partial<Row>) { this.rows.forEach(r => { if (where(r)) Object.assign(r, set) }) }
  delete(where: (r: Row) => boolean) { this.rows = this.rows.filter(r => !where(r)) }
}

const T = {
  categories: new Table(), products: new Table(), addons: new Table(), productAddons: new Table(),
  modifierGroups: new Table(), modifiers: new Table(), productModifierGroups: new Table(),
  users: new Table(), shifts: new Table(), orders: new Table(), orderItems: new Table(),
  payments: new Table(), ingredients: new Table(), recipes: new Table(),
  inventoryTransactions: new Table(), cashMovements: new Table(),
  settings: new Table(), discountCodes: new Table(), expenses: new Table(),
}

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// ─── Helpers ────────────────────────────────────────────────
function getSettings() { return T.settings.get(r => r.id === 'settings') || { deliveryFee: 25, taxRate: 0.14 } }

function rollbackInventory(orderId: string) {
  const items = T.orderItems.select(r => r.orderId === orderId)
  for (const item of items) {
    for (const r of T.recipes.select(r => r.productId === item.productId)) {
      const qty = r.quantityPerUnit * item.quantity
      const ing = T.ingredients.get(i => i.id === r.ingredientId)
      if (ing) ing.stockQuantity += qty
      T.inventoryTransactions.insert({ id: uuid(), ingredientId: r.ingredientId, type: 'ADJUSTMENT', quantity: qty, referenceOrderId: orderId, note: `إرجاع طلب ${orderId}`, createdAt: now() })
    }
  }
}

function deductInventory(orderId: string) {
  const items = T.orderItems.select(r => r.orderId === orderId)
  for (const item of items) {
    for (const r of T.recipes.select(r => r.productId === item.productId)) {
      const qty = r.quantityPerUnit * item.quantity
      const ing = T.ingredients.get(i => i.id === r.ingredientId)
      if (ing) ing.stockQuantity -= qty
      T.inventoryTransactions.insert({ id: uuid(), ingredientId: r.ingredientId, type: 'CONSUMPTION', quantity: -qty, referenceOrderId: orderId, note: `استهلاك طلب ${orderId}`, createdAt: now() })
    }
  }
}

function seed() {
  // Settings
  T.settings.insert({ id: 'settings', deliveryFee: 25, taxRate: 0.14, restaurantName: 'فاست فود', currency: 'EGP' })

  // Discount codes
  T.discountCodes.insert({ id: 'disc-10', code: 'WELCOME10', type: 'percentage', value: 10, active: true, maxUses: 100, usedCount: 0 })
  T.discountCodes.insert({ id: 'disc-20', code: 'SAVE20', type: 'fixed', value: 20, active: true, maxUses: 50, usedCount: 0 })
  T.discountCodes.insert({ id: 'disc-5', code: 'FIVE', type: 'fixed', value: 5, active: true, maxUses: 0, usedCount: 0 })

  // Expenses
  T.expenses.insert({ id: 'exp-salary-1', name: 'رواتب الموظفين', category: 'رواتب', amount: 15000, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-rent', name: 'إيجار المحل', category: 'إيجار', amount: 8000, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-electric', name: 'كهرباء', category: 'مرافق', amount: 2000, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-gas', name: 'غاز', category: 'مرافق', amount: 500, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-water', name: 'مياه', category: 'مرافق', amount: 300, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-internet', name: 'إنترنت', category: 'مرافق', amount: 400, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-maint', name: 'صيانة', category: 'صيانة', amount: 1000, type: 'monthly', active: true })

  // Categories
  for (const c of [
    { id: 'cat-burgers', name: 'برجر', emoji: '🍔', color: 'var(--cat-burgers)', sortOrder: 1, active: true },
    { id: 'cat-pizza', name: 'بيتزا', emoji: '🍕', color: 'var(--cat-pizza)', sortOrder: 2, active: true },
    { id: 'cat-chicken', name: 'دجاج', emoji: '🍗', color: 'var(--cat-chicken)', sortOrder: 3, active: true },
    { id: 'cat-sides', name: 'أطباق جانبية', emoji: '🍟', color: 'var(--cat-sides)', sortOrder: 4, active: true },
    { id: 'cat-drinks', name: 'مشروبات', emoji: '🥤', color: 'var(--cat-drinks)', sortOrder: 5, active: true },
    { id: 'cat-desserts', name: 'حلويات', emoji: '🍦', color: 'var(--cat-desserts)', sortOrder: 6, active: true },
  ]) T.categories.insert(c)

  // Products (with costPrice for profit calc)
  for (const p of [
    { id: 'b1', name: 'برجر كلاسيك', price: 85, costPrice: 35, categoryId: 'cat-burgers', emoji: '🍔', description: 'لحم، خس، طماطم', active: true },
    { id: 'b2', name: 'برجر جبنة', price: 95, costPrice: 40, categoryId: 'cat-burgers', emoji: '🧀', description: 'جبنة مزدوجة، مخلل، بصل', active: true },
    { id: 'b3', name: 'برجر بيكون', price: 110, costPrice: 48, categoryId: 'cat-burgers', emoji: '🥓', description: 'بيكون مقرمش، صوص باربكيو', active: true },
    { id: 'b4', name: 'برجر فطر', price: 105, costPrice: 45, categoryId: 'cat-burgers', emoji: '🍄', description: 'جبنة سويسري، فطر', active: true },
    { id: 'p1', name: 'مارغريتا', price: 120, costPrice: 45, categoryId: 'cat-pizza', emoji: '🍕', description: 'طماطم، موزاريلا، ريحان', active: true },
    { id: 'p2', name: 'بيبروني', price: 145, costPrice: 55, categoryId: 'cat-pizza', emoji: '🌶️', description: 'بيبروني مزدوج، موزاريلا', active: true },
    { id: 'p3', name: 'دجاج باربكيو', price: 155, costPrice: 60, categoryId: 'cat-pizza', emoji: '🍗', description: 'صوص باربكيو، دجاج، بصل أحمر', active: true },
    { id: 'p4', name: 'خضار', price: 130, costPrice: 42, categoryId: 'cat-pizza', emoji: '🥬', description: 'خضار مشكلة، زيتون، فيتا', active: true },
    { id: 'c1', name: 'ناجت دجاج (6)', price: 65, costPrice: 25, categoryId: 'cat-chicken', emoji: '🍗', description: 'ناجت ذهبي مقرمش', active: true },
    { id: 'c2', name: 'أجنحة دجاج (8)', price: 105, costPrice: 42, categoryId: 'cat-chicken', emoji: '🍗', description: 'صوص بوفالو أو باربكيو', active: true },
    { id: 'c3', name: 'ساندويتش دجاج', price: 90, costPrice: 35, categoryId: 'cat-chicken', emoji: '🥪', description: 'دجاج مقرمش، كول سلو، مخلل', active: true },
    { id: 's1', name: 'بطاطس مقلية', price: 35, costPrice: 10, categoryId: 'cat-sides', emoji: '🍟', description: 'بطاطس ذهبية مقرمشة', active: true },
    { id: 's2', name: 'حلقات بصل', price: 45, costPrice: 15, categoryId: 'cat-sides', emoji: '🧅', description: 'حلقات بصل مقرمشة', active: true },
    { id: 's3', name: 'أصابع موزاريلا', price: 55, costPrice: 22, categoryId: 'cat-sides', emoji: '🧀', description: 'مع صوص مارينارا', active: true },
    { id: 's4', name: 'كول سلو', price: 25, costPrice: 8, categoryId: 'cat-sides', emoji: '🥗', description: 'كول سلو كريمي', active: true },
    { id: 'd1', name: 'كولا', price: 20, costPrice: 8, categoryId: 'cat-drinks', emoji: '🥤', description: 'كولا باردة', active: true },
    { id: 'd2', name: 'ليمونادة', price: 25, costPrice: 10, categoryId: 'cat-drinks', emoji: '🍋', description: 'ليمون طازج', active: true },
    { id: 'd3', name: 'ميلك شيك', price: 50, costPrice: 20, categoryId: 'cat-drinks', emoji: '🥛', description: 'فانيليا، شوكولاتة، أو فراولة', active: true },
    { id: 'd4', name: 'شاي مثلج', price: 20, costPrice: 6, categoryId: 'cat-drinks', emoji: '🍵', description: 'محلى أو بدون سكر', active: true },
    { id: 'e1', name: 'آيس كريم صنداي', price: 45, costPrice: 18, categoryId: 'cat-desserts', emoji: '🍦', description: '3 سكوب، صوص شوكولاتة، كرز', active: true },
    { id: 'e2', name: 'تفاح محشو', price: 35, costPrice: 14, categoryId: 'cat-desserts', emoji: '🥧', description: 'دافئ بالقرفة', active: true },
    { id: 'e3', name: 'براوني', price: 30, costPrice: 12, categoryId: 'cat-desserts', emoji: '🍫', description: 'براوني شوكولاتة', active: true },
  ]) T.products.insert(p)

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
  ]) T.addons.insert(a)

  // Modifier groups + modifiers
  T.modifierGroups.insert({ id: 'grp-size', name: 'الحجم', type: 'single-select', sortOrder: 1, active: true })
  T.modifierGroups.insert({ id: 'grp-sauce', name: 'الصوص', type: 'multi-select', sortOrder: 2, active: true })
  T.modifierGroups.insert({ id: 'grp-cooking', name: 'السلق', type: 'single-select', sortOrder: 3, active: true })
  T.modifierGroups.insert({ id: 'grp-extras', name: 'إضافات المشروبات', type: 'multi-select', sortOrder: 4, active: true })
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
  ]) T.modifiers.insert(m)

  for (const pid of ['b1', 'b2', 'b3', 'b4', 'p1', 'p2', 'p3', 'p4']) T.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-size' })
  for (const pid of ['b1', 'b2', 'b3', 'b4']) T.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-sauce' })
  for (const pid of ['c1', 'c2', 'c3']) T.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-cooking' })
  for (const pid of ['d1', 'd2', 'd3', 'd4']) T.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-extras' })

  // Ingredients
  for (const i of [
    { id: 'ing-bread', name: 'خبز', unit: 'pcs', stockQuantity: 200, minStock: 20, costPerUnit: 3, active: true },
    { id: 'ing-beef', name: 'لحم بقري', unit: 'g', stockQuantity: 10000, minStock: 1000, costPerUnit: 0.2, active: true },
    { id: 'ing-chicken', name: 'صدر دجاج', unit: 'g', stockQuantity: 8000, minStock: 1000, costPerUnit: 0.15, active: true },
    { id: 'ing-cheese', name: 'جبنة', unit: 'g', stockQuantity: 5000, minStock: 500, costPerUnit: 0.1, active: true },
    { id: 'ing-potato', name: 'بطاطس', unit: 'g', stockQuantity: 15000, minStock: 2000, costPerUnit: 0.03, active: true },
    { id: 'ing-cola', name: 'كولا', unit: 'ml', stockQuantity: 20000, minStock: 2000, costPerUnit: 0.01, active: true },
  ]) T.ingredients.insert(i)

  // Recipes
  for (const r of [
    { id: 'r1', productId: 'b1', ingredientId: 'ing-bread', quantityPerUnit: 1 },
    { id: 'r2', productId: 'b1', ingredientId: 'ing-beef', quantityPerUnit: 150 },
    { id: 'r3', productId: 'b2', ingredientId: 'ing-bread', quantityPerUnit: 1 },
    { id: 'r4', productId: 'b2', ingredientId: 'ing-beef', quantityPerUnit: 150 },
    { id: 'r5', productId: 'b2', ingredientId: 'ing-cheese', quantityPerUnit: 40 },
    { id: 'r6', productId: 's1', ingredientId: 'ing-potato', quantityPerUnit: 200 },
    { id: 'r7', productId: 'd1', ingredientId: 'ing-cola', quantityPerUnit: 330 },
  ]) T.recipes.insert(r)

  // Users
  T.users.insert({ id: 'user-admin', name: 'مدير', pin: '0000', role: 'admin', active: true, createdAt: now() })
  T.users.insert({ id: 'user-cashier', name: 'كاشير', pin: '1234', role: 'cashier', active: true, createdAt: now() })
}

seed()

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════
export const rendererApi = {
  settings: {
    get: () => getSettings(),
    update: (data: any) => { T.settings.update(r => r.id === 'settings', data); return { ok: true } },
  },
  discountCode: {
    list: () => T.discountCodes.select(),
    create: (data: any) => { const id = uuid(); T.discountCodes.insert({ id, ...data, active: true, usedCount: 0 }); return { id } },
    update: (id: string, data: any) => { T.discountCodes.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { T.discountCodes.delete(r => r.id === id); return { ok: true } },
    validate: (code: string) => {
      const dc = T.discountCodes.get(r => r.code.toUpperCase() === code.toUpperCase() && r.active)
      if (!dc) return { valid: false, error: 'كود غير صالح' }
      if (dc.maxUses > 0 && dc.usedCount >= dc.maxUses) return { valid: false, error: 'انتهى الاستخدام' }
      return { valid: true, discount: { id: dc.id, code: dc.code, type: dc.type, value: dc.value } }
    },
    use: (id: string) => { const dc = T.discountCodes.get(r => r.id === id); if (dc) dc.usedCount++; return { ok: true } },
  },
  expense: {
    list: () => T.expenses.select(r => r.active),
    create: (data: any) => { const id = uuid(); T.expenses.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { T.expenses.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { T.expenses.update(r => r.id === id, { active: false }); return { ok: true } },
    totalMonthly: () => T.expenses.select(r => r.active && r.type === 'monthly').reduce((s, e) => s + e.amount, 0),
  },
  category: {
    list: () => T.categories.select(r => r.active).sort((a, b) => a.sortOrder - b.sortOrder),
    create: (data: any) => { const id = uuid(); T.categories.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { T.categories.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { T.categories.update(r => r.id === id, { active: false }); return { ok: true } },
    reorder: (ids: string[]) => { ids.forEach((id, i) => T.categories.update(r => r.id === id, { sortOrder: i })); return { ok: true } },
  },
  product: {
    list: (categoryId?: string) => categoryId ? T.products.select(r => r.active && r.categoryId === categoryId) : T.products.select(r => r.active),
    getById: (id: string) => T.products.get(r => r.id === id) || null,
    create: (data: any) => { const id = uuid(); T.products.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { T.products.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { T.products.update(r => r.id === id, { active: false }); return { ok: true } },
  },
  addon: {
    list: () => T.addons.select(r => r.active),
    create: (data: any) => { const id = uuid(); T.addons.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { T.addons.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { T.addons.update(r => r.id === id, { active: false }); return { ok: true } },
    listByProduct: (productId: string) => T.productAddons.select(r => r.productId === productId).map(l => T.addons.get(a => a.id === l.addonId)).filter(Boolean),
    linkToProduct: (productId: string, addonId: string) => { T.productAddons.insert({ productId, addonId }); return { ok: true } },
  },
  modifier: {
    listGroups: () => T.modifierGroups.select(r => r.active).sort((a, b) => a.sortOrder - b.sortOrder),
    createGroup: (data: any) => { const id = uuid(); T.modifierGroups.insert({ id, ...data, active: true }); return { id } },
    updateGroup: (id: string, data: any) => { T.modifierGroups.update(r => r.id === id, data); return { ok: true } },
    deleteGroup: (id: string) => { T.modifierGroups.update(r => r.id === id, { active: false }); return { ok: true } },
    listByGroup: (groupId: string) => T.modifiers.select(r => r.active && r.modifierGroupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder),
    createModifier: (data: any) => { const id = uuid(); T.modifiers.insert({ id, ...data, active: true }); return { id } },
    updateModifier: (id: string, data: any) => { T.modifiers.update(r => r.id === id, data); return { ok: true } },
    deleteModifier: (id: string) => { T.modifiers.update(r => r.id === id, { active: false }); return { ok: true } },
    listByProduct: (productId: string) => {
      const links = T.productModifierGroups.select(r => r.productId === productId)
      return links.map(l => { const g = T.modifierGroups.get(g => g.id === l.modifierGroupId); if (!g) return null; return { ...g, modifiers: T.modifiers.select(r => r.active && r.modifierGroupId === g.id).sort((a, b) => a.sortOrder - b.sortOrder) } }).filter(Boolean)
    },
    linkToProduct: (productId: string, groupId: string) => { T.productModifierGroups.insert({ productId, modifierGroupId: groupId }); return { ok: true } },
  },
  order: {
    create: (data: any) => {
      const settings = getSettings()
      const id = `#${Date.now().toString().slice(-6)}`
      const ts = now()
      const deliveryFee = data.orderType === 'delivery' ? (data.deliveryFee ?? settings.deliveryFee) : 0
      T.orders.insert({
        id, status: 'PAID', orderType: data.orderType, tableNumber: data.tableNumber || null,
        customerName: data.customerName || null, customerPhone: data.customerPhone || null, customerAddress: data.customerAddress || null,
        subtotal: data.subtotal, tax: data.tax, deliveryFee,
        discountCode: data.discountCode || null, discountAmount: data.discountAmount || 0,
        total: data.total, paymentType: data.paymentType || 'cash',
        userId: data.userId || null, shiftId: data.shiftId || null,
        cashierName: data.cashierName || null, statusReason: null,
        createdAt: ts, updatedAt: ts,
      })
      for (const item of data.items) {
        T.orderItems.insert({
          id: uuid(), orderId: id, productId: item.productId, quantity: item.quantity,
          unitPrice: item.unitPrice, itemDiscount: item.itemDiscount || 0,
          selectedModifiersJson: item.modifiers ? JSON.stringify(item.modifiers) : null,
          selectedAddonsJson: item.addons ? JSON.stringify(item.addons) : null,
        })
      }
      if (data.discountCodeId) { const dc = T.discountCodes.get(r => r.id === data.discountCodeId); if (dc) dc.usedCount++ }
      return { id }
    },
    list: (filters?: any) => {
      let all = T.orders.select()
      if (filters?.search) { const s = filters.search.toLowerCase(); all = all.filter(o => o.id.toLowerCase().includes(s) || (o.customerName && o.customerName.toLowerCase().includes(s))) }
      if (filters?.status) all = all.filter(o => o.status === filters.status)
      return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    getById: (id: string) => {
      const order = T.orders.get(r => r.id === id)
      if (!order) return null
      const items = T.orderItems.select(r => r.orderId === id).map(item => { const p = T.products.get(pr => pr.id === item.productId); return { ...item, productName: p?.name, productEmoji: p?.emoji } })
      return { ...order, items, payments: T.payments.select(r => r.orderId === id) }
    },
    updateStatus: (id: string, status: string, reason?: string) => {
      const order = T.orders.get(r => r.id === id)
      if (!order) return { ok: false, error: 'الطلب غير موجود' }
      if ((status === 'CANCELLED' || status === 'REFUNDED') && (order.status === 'PAID' || order.status === 'PREPARING' || order.status === 'READY')) {
        rollbackInventory(id)
      }
      T.orders.update(r => r.id === id, { status, statusReason: reason || null, updatedAt: now() })
      return { ok: true }
    },
  },
  payment: {
    create: (data: any) => { const id = uuid(); T.payments.insert({ id, ...data, createdAt: now() }); return { id } },
    listByOrder: (orderId: string) => T.payments.select(r => r.orderId === orderId),
    getTotalPaid: (orderId: string) => T.payments.select(r => r.orderId === orderId).reduce((s, p) => s + p.amount, 0),
  },
  user: {
    list: () => T.users.select(r => r.active).map(({ pin, ...u }) => u),
    create: (data: any) => { const id = uuid(); T.users.insert({ id, ...data, active: true, createdAt: now() }); return { id } },
    update: (id: string, data: any) => { T.users.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string) => { T.users.update(r => r.id === id, { active: false }); return { ok: true } },
    verifyPin: (id: string, pin: string) => {
      const user = T.users.get(r => r.id === id && r.active)
      if (!user) return { ok: false, error: 'المستخدم غير موجود' }
      if (user.pin !== pin) return { ok: false, error: 'الرقم السري غلط' }
      return { ok: true, user: { id: user.id, name: user.name, role: user.role } }
    },
  },
  shift: {
    open: (data: any) => { const id = uuid(); T.shifts.insert({ id, userId: data.userId, startedAt: now(), openingCash: data.openingCash, closingCash: null, status: 'open' }); return { id } },
    close: (id: string, closingCash: number) => { T.shifts.update(r => r.id === id, { endedAt: now(), closingCash, status: 'closed' }); return { ok: true } },
    getCurrent: () => T.shifts.get(r => r.status === 'open') || null,
    list: (filters?: any) => filters?.userId ? T.shifts.select(r => r.userId === filters.userId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : T.shifts.select().sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  },
  cashDrawer: {
    addMovement: (data: any) => { const id = uuid(); T.cashMovements.insert({ id, ...data, createdAt: now() }); return { id } },
    listByShift: (shiftId: string) => T.cashMovements.select(r => r.shiftId === shiftId),
    reconcile: () => null,
  },
  inventory: {
    listIngredients: () => T.ingredients.select(r => r.active),
    createIngredient: (data: any) => { const id = uuid(); T.ingredients.insert({ id, ...data, active: true }); return { id } },
    updateIngredient: (id: string, data: any) => { T.ingredients.update(r => r.id === id, data); return { ok: true } },
    deleteIngredient: (id: string) => { T.ingredients.update(r => r.id === id, { active: false }); return { ok: true } },
    listRecipes: (productId: string) => T.recipes.select(r => r.productId === productId),
    upsertRecipe: (data: any) => { if (data.id) { T.recipes.update(r => r.id === data.id, { quantityPerUnit: data.quantityPerUnit }); return { id: data.id } } const id = uuid(); T.recipes.insert({ id, ...data }); return { id } },
    deleteRecipe: (id: string) => { T.recipes.delete(r => r.id === id); return { ok: true } },
    getAlerts: () => T.ingredients.select(r => r.active && r.stockQuantity <= r.minStock),
    restock: (ingredientId: string, qty: number, note?: string) => {
      const ing = T.ingredients.get(r => r.id === ingredientId); if (ing) ing.stockQuantity += qty
      T.inventoryTransactions.insert({ id: uuid(), ingredientId, type: 'PURCHASE', quantity: qty, note: note || 'إعادة تعبئة', createdAt: now() }); return { ok: true }
    },
    deductForOrder: (orderId: string) => { deductInventory(orderId); return { ok: true } },
  },
  report: {
    dailySummary: (date?: string) => {
      const d = date || new Date().toISOString().slice(0, 10)
      const all = T.orders.select()
      const day = all.filter(o => o.createdAt?.startsWith(d) && o.status !== 'CANCELLED')
      const cancelled = all.filter(o => o.createdAt?.startsWith(d) && o.status === 'CANCELLED')
      const refunded = all.filter(o => o.createdAt?.startsWith(d) && o.status === 'REFUNDED')
      const revenue = day.reduce((s, o) => s + o.total, 0)
      const costOfGoods = day.reduce((s, o) => {
        const items = T.orderItems.select(r => r.orderId === o.id)
        return s + items.reduce((is, item) => { const p = T.products.get(pr => pr.id === item.productId); return is + (p?.costPrice || 0) * item.quantity }, 0)
      }, 0)
      return { date: d, totalOrders: day.length, totalRevenue: revenue, avgOrderValue: day.length > 0 ? revenue / day.length : 0, cancelledOrders: cancelled.length, refundedOrders: refunded.length, cancellationRate: 0, costOfGoods, grossProfit: revenue - costOfGoods }
    },
    profitSummary: (from?: string, to?: string) => {
      const all = T.orders.select().filter(o => { if (o.status === 'CANCELLED') return false; if (from && o.createdAt < from) return false; if (to && o.createdAt > to) return false; return true })
      const revenue = all.reduce((s, o) => s + o.total, 0)
      const costOfGoods = all.reduce((s, o) => { const items = T.orderItems.select(r => r.orderId === o.id); return s + items.reduce((is, item) => { const p = T.products.get(pr => pr.id === item.productId); return is + (p?.costPrice || 0) * item.quantity }, 0) }, 0)
      const totalExpenses = T.expenses.select(r => r.active).reduce((s, e) => s + e.amount, 0)
      const deliveryFees = all.filter(o => o.orderType === 'delivery').reduce((s, o) => s + (o.deliveryFee || 0), 0)
      const discounts = all.reduce((s, o) => s + (o.discountAmount || 0), 0)
      const taxCollected = all.reduce((s, o) => s + o.tax, 0)
      return { revenue, costOfGoods, grossProfit: revenue - costOfGoods, totalExpenses, deliveryFees, discounts, taxCollected, netProfit: revenue - costOfGoods - totalExpenses }
    },
    hourlyBreakdown: () => [],
    topItems: (limit = 10) => {
      const items = T.orderItems.select(); const pMap = new Map(T.products.select().map(p => [p.id, p]))
      const counts: Record<string, any> = {}
      for (const item of items) { const p = pMap.get(item.productId); if (!p) continue; if (!counts[p.id]) counts[p.id] = { name: p.name, emoji: p.emoji, totalQuantity: 0, totalRevenue: 0 }; counts[p.id].totalQuantity += item.quantity; counts[p.id].totalRevenue += item.unitPrice * item.quantity }
      return Object.values(counts).sort((a: any, b: any) => b.totalQuantity - a.totalQuantity).slice(0, limit)
    },
    categoryRevenue: () => {
      const items = T.orderItems.select(); const pMap = new Map(T.products.select().map(p => [p.id, p])); const cMap = new Map(T.categories.select().map(c => [c.id, c]))
      const catRev: Record<string, any> = {}
      for (const item of items) { const p = pMap.get(item.productId); if (!p) continue; const c = cMap.get(p.categoryId); if (!c) continue; if (!catRev[c.id]) catRev[c.id] = { categoryId: c.id, name: c.name, totalRevenue: 0 }; catRev[c.id].totalRevenue += item.unitPrice * item.quantity }
      return Object.values(catRev).sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
    },
    addonStats: () => [], ticketDistribution: () => [],
    orderTypeSplit: () => {
      const all = T.orders.select(r => r.status !== 'CANCELLED'); const del = all.filter(o => o.orderType === 'delivery'); const dine = all.filter(o => o.orderType === 'dine-in'); const t = all.length || 1
      return { delivery: { count: del.length, revenue: del.reduce((s, o) => s + o.total, 0), percentage: del.length / t * 100 }, dineIn: { count: dine.length, revenue: dine.reduce((s, o) => s + o.total, 0), percentage: dine.length / t * 100 } }
    },
    shiftReport: () => null,
    revenueTrend: (days = 7) => {
      const all = T.orders.select(r => r.status !== 'CANCELLED'); const result: any[] = []
      for (let d = days - 1; d >= 0; d--) { const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10); const day = all.filter(o => o.createdAt?.startsWith(date)); result.push({ date, revenue: day.reduce((s, o) => s + o.total, 0), orderCount: day.length }) }
      return result
    },
    inventoryAlerts: () => T.ingredients.select(r => r.active && r.stockQuantity <= r.minStock),
    paymentMethodBreakdown: () => [],
  },
  backup: { trigger: () => ({ ok: true }), getStatus: () => ({ lastBackup: null, backupCount: 0 }) },
}
