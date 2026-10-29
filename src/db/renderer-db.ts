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
  settings: new Table(), discountCodes: new Table(), deliveryZones: new Table(), deliveryProfiles: new Table(), expenses: new Table(),
  kitchenStations: new Table(), stationCategories: new Table(),
  addonRecipes: new Table(), modifierRecipes: new Table(), customers: new Table(),
  subRecipes: new Table(), subRecipeIngredients: new Table(),
}

const uuid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// Soft-delete by default; admins can request permanent removal with { hard: true }.
type DeleteOpts = { hard?: boolean }

// Mirrors the main-process hardDelete: permanently removes the row plus its link
// rows, refusing when historical data still points at it so reports stay intact.
function hardDelete(
  table: Table,
  id: string,
  checks: { table: Table; where: (r: Row) => boolean; label: string }[] = [],
  linkDeletions: { table: Table; where: (r: Row) => boolean }[] = [],
): { ok: boolean; error?: string } {
  if (!table.get(r => r.id === id)) return { ok: false, error: 'العنصر غير موجود' }
  for (const c of checks) {
    if (c.table.select(c.where).length > 0) {
      return { ok: false, error: `لا يمكن الحذف النهائي — العنصر مرتبط بـ ${c.label}. عطّله بدل حذفه للحفاظ على سجل الطلبات.` }
    }
  }
  for (const d of linkDeletions) d.table.delete(d.where)
  table.delete(r => r.id === id)
  return { ok: true }
}

// ─── Helpers ────────────────────────────────────────────────
function getSettings() { return T.settings.get(r => r.id === 'settings') || { deliveryFee: 25, taxRate: 0.14 } }

// Full rollback — CANCELLED: return ALL ingredients (products + addons)
function rollbackInventory(orderId: string) {
  const items = T.orderItems.select(r => r.orderId === orderId)
  for (const item of items) {
    // Product recipe rollback
    for (const r of T.recipes.select(r => r.productId === item.productId)) {
      const qty = r.quantityPerUnit * item.quantity
      const ing = T.ingredients.get(i => i.id === r.ingredientId)
      if (ing) ing.stockQuantity += qty
      T.inventoryTransactions.insert({ id: uuid(), ingredientId: r.ingredientId, type: 'ADJUSTMENT', quantity: qty, referenceOrderId: orderId, note: `إرجاع منتج — طلب ${orderId}`, createdAt: now() })
    }
    // Addon recipe rollback
    if (item.selectedAddonsJson) {
      try {
        const addonIds = JSON.parse(item.selectedAddonsJson) as string[]
        for (const addonId of addonIds) {
          for (const ar of T.addonRecipes.select(r => r.addonId === addonId)) {
            const qty = ar.quantityPerUnit * item.quantity
            const ing = T.ingredients.get(i => i.id === ar.ingredientId)
            if (ing) ing.stockQuantity += qty
            T.inventoryTransactions.insert({ id: uuid(), ingredientId: ar.ingredientId, type: 'ADJUSTMENT', quantity: qty, referenceOrderId: orderId, note: `إرجاع إضافة — طلب ${orderId}`, createdAt: now() })
          }
        }
      } catch {}
    }
  }
}

// Partial rollback — REFUNDED: only products+addons that support rollback
function rollbackInventoryPartial(orderId: string): number {
  const items = T.orderItems.select(r => r.orderId === orderId)
  let refundedAmount = 0
  for (const item of items) {
    const product = T.products.get(p => p.id === item.productId)
    if (!product) continue
    let itemRefund = 0

    // Product rollback
    if (product.supportsRollback) {
      for (const r of T.recipes.select(r => r.productId === item.productId)) {
        const qty = r.quantityPerUnit * item.quantity
        const ing = T.ingredients.get(i => i.id === r.ingredientId)
        if (ing) ing.stockQuantity += qty
        T.inventoryTransactions.insert({ id: uuid(), ingredientId: r.ingredientId, type: 'ADJUSTMENT', quantity: qty, referenceOrderId: orderId, note: `إرجاع جزئي ${orderId} — ${product.name}`, createdAt: now() })
      }
      itemRefund += (item.unitPrice ?? product.price) * item.quantity
    }

    // Addon rollback
    if (item.selectedAddonsJson) {
      try {
        const addonIds = JSON.parse(item.selectedAddonsJson) as string[]
        for (const addonId of addonIds) {
          const addon = T.addons.get(a => a.id === addonId)
          if (!addon || !addon.supportsRollback) continue
          // Rollback addon recipe ingredients
          for (const ar of T.addonRecipes.select(r => r.addonId === addonId)) {
            const qty = ar.quantityPerUnit * item.quantity
            const ing = T.ingredients.get(i => i.id === ar.ingredientId)
            if (ing) ing.stockQuantity += qty
            T.inventoryTransactions.insert({ id: uuid(), ingredientId: ar.ingredientId, type: 'ADJUSTMENT', quantity: qty, referenceOrderId: orderId, note: `إرجاع إضافة ${orderId} — ${addon.name}`, createdAt: now() })
          }
          itemRefund += addon.price * item.quantity
        }
      } catch {}
    }
    refundedAmount += itemRefund
  }
  return refundedAmount
}

function deductInventory(orderId: string) {
  const items = T.orderItems.select(r => r.orderId === orderId)
  for (const item of items) {
    // Product recipe deduction
    for (const r of T.recipes.select(r => r.productId === item.productId)) {
      const qty = r.quantityPerUnit * item.quantity
      const ing = T.ingredients.get(i => i.id === r.ingredientId)
      if (ing) ing.stockQuantity -= qty
      T.inventoryTransactions.insert({ id: uuid(), ingredientId: r.ingredientId, type: 'CONSUMPTION', quantity: -qty, referenceOrderId: orderId, note: `استهلاك منتج — طلب ${orderId}`, createdAt: now() })
    }
    // Addon recipe deduction
    if (item.selectedAddonsJson) {
      try {
        const addonIds = JSON.parse(item.selectedAddonsJson) as string[]
        for (const addonId of addonIds) {
          for (const ar of T.addonRecipes.select(r => r.addonId === addonId)) {
            const qty = ar.quantityPerUnit * item.quantity
            const ing = T.ingredients.get(i => i.id === ar.ingredientId)
            if (ing) ing.stockQuantity -= qty
            T.inventoryTransactions.insert({ id: uuid(), ingredientId: ar.ingredientId, type: 'CONSUMPTION', quantity: -qty, referenceOrderId: orderId, note: `استهلاك إضافة — طلب ${orderId}`, createdAt: now() })
          }
        }
      } catch {}
    }
  }
}

function seed() {
  // Settings
  T.settings.insert({ id: 'settings', deliveryFee: 25, taxRate: 0.14, restaurantName: 'Crunch Time', currency: 'EGP', receiptWidth: '80mm', receiptCopies: 1, receiptFooter: 'شكراً لزيارتكم', currencyLabel: 'ج.م', showLogo: true, showCashier: true, showOrderId: true, showTax: true })

  // Delivery zones
  T.deliveryZones.insert({ id: 'dz-near', name: 'قريب', fee: 25, sortOrder: 0, active: true })
  T.deliveryZones.insert({ id: 'dz-mid', name: 'متوسط', fee: 35, sortOrder: 1, active: true })
  T.deliveryZones.insert({ id: 'dz-far', name: 'بعيد', fee: 45, sortOrder: 2, active: true })

  // Kitchen stations (print routing — printer picked later in Settings)
  T.kitchenStations.insert({ id: 'st-receipt', name: 'الكاشير (إيصال)', printerName: null, paperWidth: '80mm', sortOrder: 0, active: true })
  T.kitchenStations.insert({ id: 'st-kitchen-1', name: 'مطبخ 1', printerName: null, paperWidth: '80mm', sortOrder: 1, active: true })
  T.kitchenStations.insert({ id: 'st-kitchen-2', name: 'مطبخ 2', printerName: null, paperWidth: '80mm', sortOrder: 2, active: true })

  // Discount codes
  T.discountCodes.insert({ id: 'disc-10', code: 'WELCOME10', type: 'percentage', value: 10, active: true, maxUses: 100, usedCount: 0 })
  T.discountCodes.insert({ id: 'disc-20', code: 'SAVE20', type: 'fixed', value: 20, active: true, maxUses: 50, usedCount: 0 })
  T.discountCodes.insert({ id: 'disc-5', code: 'FIVE', type: 'fixed', value: 5, active: true, maxUses: 0, usedCount: 0 })
  // Employee daily code — the rotation rides on the row
  // itself (the in-browser mock has no day-products table).
  T.discountCodes.insert({
    id: 'disc-staff', code: 'STAFF', type: 'percentage', value: 50, active: true, maxUses: 0, usedCount: 0,
    mode: 'daily', dailyUses: 10,
    dayProducts: [
      { dayOfWeek: 0, productId: 'cr1' }, { dayOfWeek: 1, productId: 'cr3' },
      { dayOfWeek: 2, productId: 'cr6' }, { dayOfWeek: 3, productId: 'cr7' },
      { dayOfWeek: 4, productId: 'cr5' }, { dayOfWeek: 5, productId: 'cr2' },
      { dayOfWeek: 6, productId: 'cr9' },
    ],
  })

  // Expenses
  T.expenses.insert({ id: 'exp-salary-1', name: 'رواتب الموظفين', category: 'رواتب', amount: 15000, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-rent', name: 'إيجار المحل', category: 'إيجار', amount: 8000, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-electric', name: 'كهرباء', category: 'مرافق', amount: 2000, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-gas', name: 'غاز', category: 'مرافق', amount: 500, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-water', name: 'مياه', category: 'مرافق', amount: 300, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-internet', name: 'إنترنت', category: 'مرافق', amount: 400, type: 'monthly', active: true })
  T.expenses.insert({ id: 'exp-maint', name: 'صيانة', category: 'صيانة', amount: 1000, type: 'monthly', active: true })

  // Categories — crepe house
  for (const c of [
    { id: 'cat-crepe-savory', name: 'كريب حادق', emoji: '🥙', color: 'var(--cat-crepe-savory)', sortOrder: 1, active: true },
    { id: 'cat-crepe-sweet', name: 'كريب حلو', emoji: '🍫', color: 'var(--cat-crepe-sweet)', sortOrder: 2, active: true },
    { id: 'cat-pizza', name: 'بيتزا', emoji: '🍕', color: 'var(--cat-pizza)', sortOrder: 3, active: true },
    { id: 'cat-meals', name: 'وجبات', emoji: '🍱', color: 'var(--cat-meals)', sortOrder: 4, active: true },
    { id: 'cat-drinks', name: 'مشروبات', emoji: '🥤', color: 'var(--cat-drinks)', sortOrder: 5, active: true },
  ]) T.categories.insert(c)

  // Products
  for (const p of [
    { id: 'cr1', name: 'كريب فراخ بانيه', price: 70, costPrice: 30, categoryId: 'cat-crepe-savory', emoji: '🍗', description: 'فراخ بانيه، خضار، موزاريلا', active: true, supportsRollback: true },
    { id: 'cr2', name: 'كريب شاورما دجاج', price: 70, costPrice: 30, categoryId: 'cat-crepe-savory', emoji: '🌯', description: 'شاورما دجاج، خضار، موزاريلا', active: true, supportsRollback: true },
    { id: 'cr3', name: 'كريب زنجر', price: 75, costPrice: 32, categoryId: 'cat-crepe-savory', emoji: '🌶️', description: 'دجاج زنجر حار، خس، صوص رانش', active: true, supportsRollback: true },
    { id: 'cr4', name: 'كريب ميكس جبن', price: 55, costPrice: 22, categoryId: 'cat-crepe-savory', emoji: '🧀', description: 'موزاريلا، رومي، شيدر، خضار', active: true, supportsRollback: true },
    { id: 'cr5', name: 'كريب بطاطس', price: 40, costPrice: 14, categoryId: 'cat-crepe-savory', emoji: '🍟', description: 'بطاطس محمرة، موزاريلا، كاتشب', active: true, supportsRollback: true },
    { id: 'cr6', name: 'كريب سوسيس', price: 55, costPrice: 22, categoryId: 'cat-crepe-savory', emoji: '🌭', description: 'سوسيس، خضار، موزاريلا', active: true, supportsRollback: true },
    { id: 'cr7', name: 'كريب كفتة', price: 65, costPrice: 28, categoryId: 'cat-crepe-savory', emoji: '🥩', description: 'كفتة مشوية، موزاريلا، خضار', active: true, supportsRollback: true },
    { id: 'cr8', name: 'كريب شيش طاووق', price: 70, costPrice: 30, categoryId: 'cat-crepe-savory', emoji: '🍢', description: 'شيش طاووق، موزاريلا، صوص شيدر', active: true, supportsRollback: true },
    { id: 'cr9', name: 'كريب سوبر كرانشي', price: 78, costPrice: 34, categoryId: 'cat-crepe-savory', emoji: '🍗', description: 'قطع كرانشي، موزاريلا، خضار', active: true, supportsRollback: true },
    { id: 'cr10', name: 'كريب الوحش', price: 100, costPrice: 45, categoryId: 'cat-crepe-savory', emoji: '👹', description: 'بانيه، كريسبي، كفتة، بطاطس', active: true, supportsRollback: true },
    { id: 'sw1', name: 'كريب نوتيلا', price: 40, costPrice: 15, categoryId: 'cat-crepe-sweet', emoji: '🍫', description: 'نوتيلا', active: true, supportsRollback: false },
    { id: 'sw2', name: 'كريب نوتيلا موز', price: 50, costPrice: 19, categoryId: 'cat-crepe-sweet', emoji: '🍌', description: 'نوتيلا، موز', active: true, supportsRollback: false },
    { id: 'sw3', name: 'كريب ماستر سويت', price: 62, costPrice: 25, categoryId: 'cat-crepe-sweet', emoji: '🍩', description: 'نوتيلا، موز، مكسرات، أوريو', active: true, supportsRollback: false },
    { id: 'p1', name: 'مارغريتا', price: 120, costPrice: 45, categoryId: 'cat-pizza', emoji: '🍕', description: 'طماطم، موزاريلا، ريحان', active: true, supportsRollback: true },
    { id: 'p2', name: 'بيبروني', price: 145, costPrice: 55, categoryId: 'cat-pizza', emoji: '🌶️', description: 'بيبروني، موزاريلا', active: true, supportsRollback: true },
    { id: 'p3', name: 'دجاج باربكيو', price: 155, costPrice: 60, categoryId: 'cat-pizza', emoji: '🍗', description: 'دجاج، صوص باربكيو، بصل', active: true, supportsRollback: true },
    { id: 'p4', name: 'خضار', price: 130, costPrice: 42, categoryId: 'cat-pizza', emoji: '🥬', description: 'خضار مشكلة، زيتون، فيتا', active: true, supportsRollback: true },
    { id: 'm1', name: 'وجبة كوردون بلو', price: 115, costPrice: 50, categoryId: 'cat-meals', emoji: '🍱', description: 'كوردون بلو، بطاطس، كول سلو، عيش', active: true, supportsRollback: true },
    { id: 'm2', name: 'وجبة زنجر', price: 100, costPrice: 42, categoryId: 'cat-meals', emoji: '🍗', description: 'زنجر، بطاطس، كول سلو، عيش', active: true, supportsRollback: true },
    { id: 'm3', name: 'وجبة شيش طاووق', price: 100, costPrice: 42, categoryId: 'cat-meals', emoji: '🍢', description: 'شيش طاووق، بطاطس، ثومية، عيش', active: true, supportsRollback: true },
    { id: 'm4', name: 'وجبة ناجتس', price: 85, costPrice: 34, categoryId: 'cat-meals', emoji: '🧆', description: 'ناجتس 9 قطع، بطاطس، كول سلو', active: true, supportsRollback: true },
    { id: 'd1', name: 'كولا', price: 20, costPrice: 8, categoryId: 'cat-drinks', emoji: '🥤', description: 'كولا باردة', active: true, supportsRollback: false },
    { id: 'd2', name: 'ليمونادة', price: 25, costPrice: 10, categoryId: 'cat-drinks', emoji: '🍋', description: 'ليمون طازج', active: true, supportsRollback: false },
    { id: 'd3', name: 'ميلك شيك', price: 50, costPrice: 20, categoryId: 'cat-drinks', emoji: '🥛', description: 'فانيليا أو شوكولاتة', active: true, supportsRollback: false },
    { id: 'd4', name: 'شاي مثلج', price: 20, costPrice: 6, categoryId: 'cat-drinks', emoji: '🍵', description: 'محلى أو بدون سكر', active: true, supportsRollback: false },
    { id: 'd5', name: 'عصير مانجو', price: 35, costPrice: 14, categoryId: 'cat-drinks', emoji: '🥭', description: 'مانجو طبيعي', active: true, supportsRollback: false },
    { id: 'd6', name: 'عصير فراولة', price: 35, costPrice: 14, categoryId: 'cat-drinks', emoji: '🍓', description: 'فراولة طبيعية', active: true, supportsRollback: false },
  ]) T.products.insert(p)

  // Addons
  for (const a of [
    { id: 'addon-cheese', name: 'جبنة إضافية', price: 7, emoji: '🧀', active: true, supportsRollback: true },
    { id: 'addon-mozz', name: 'موزاريلا', price: 10, emoji: '🧀', active: true, supportsRollback: true },
    { id: 'addon-sauce', name: 'صلصة خاصة', price: 5, emoji: '🫙', active: true, supportsRollback: true },
    { id: 'addon-garlic', name: 'ثومية', price: 10, emoji: '🧄', active: true, supportsRollback: true },
    { id: 'addon-ketchup', name: 'كاتشب', price: 5, emoji: '🍅', active: true, supportsRollback: true },
    { id: 'addon-fries', name: 'بطاطس زيادة', price: 12, emoji: '🍟', active: true, supportsRollback: true },
    { id: 'addon-drink', name: 'مشروب كبير', price: 10, emoji: '🥤', active: true, supportsRollback: false },
    { id: 'addon-coleslaw', name: 'كول سلو', price: 8, emoji: '🥗', active: true, supportsRollback: true },
    { id: 'addon-pickle', name: 'مخلل', price: 5, emoji: '🥒', active: true, supportsRollback: true },
  ]) T.addons.insert(a)

  // Modifier groups + modifiers
  T.modifierGroups.insert({ id: 'grp-size', name: 'الحجم', type: 'single-select', sortOrder: 1, active: true })
  T.modifierGroups.insert({ id: 'grp-sauce', name: 'الصوص', type: 'multi-select', sortOrder: 2, active: true })
  for (const m of [
    { id: 'mod-size-regular', modifierGroupId: 'grp-size', name: 'عادي', priceAdjustment: 0, sortOrder: 1, active: true },
    { id: 'mod-size-large', modifierGroupId: 'grp-size', name: 'كبير', priceAdjustment: 20, sortOrder: 2, active: true },
    { id: 'mod-size-xl', modifierGroupId: 'grp-size', name: 'دبل', priceAdjustment: 35, sortOrder: 3, active: true },
    { id: 'mod-sauce-ketchup', modifierGroupId: 'grp-sauce', name: 'كاتشب', priceAdjustment: 0, sortOrder: 1, active: true },
    { id: 'mod-sauce-mayo', modifierGroupId: 'grp-sauce', name: 'مايونيز', priceAdjustment: 0, sortOrder: 2, active: true },
    { id: 'mod-sauce-garlic', modifierGroupId: 'grp-sauce', name: 'ثومية', priceAdjustment: 5, sortOrder: 3, active: true },
    { id: 'mod-sauce-ranch', modifierGroupId: 'grp-sauce', name: 'رانش', priceAdjustment: 5, sortOrder: 4, active: true },
    { id: 'mod-sauce-bbq', modifierGroupId: 'grp-sauce', name: 'باربكيو', priceAdjustment: 0, sortOrder: 5, active: true },
    { id: 'mod-sauce-spicy', modifierGroupId: 'grp-sauce', name: 'حار', priceAdjustment: 5, sortOrder: 6, active: true },
  ]) T.modifiers.insert(m)

  const savoryIds = ['cr1', 'cr2', 'cr3', 'cr4', 'cr5', 'cr6', 'cr7', 'cr8', 'cr9', 'cr10']
  const pizzaIds = ['p1', 'p2', 'p3', 'p4']
  const mealIds = ['m1', 'm2', 'm3', 'm4']
  for (const pid of [...savoryIds, ...pizzaIds]) T.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-size' })
  for (const pid of [...savoryIds, ...mealIds]) T.productModifierGroups.insert({ productId: pid, modifierGroupId: 'grp-sauce' })

  // Ingredients — crepe house
  for (const i of [
    { id: 'ing-flour', name: 'دقيق', emoji: '🌾', unit: 'g', stockQuantity: 50000, minStock: 5000, costPerUnit: 0.03, active: true },
    { id: 'ing-eggs', name: 'بيض', emoji: '🥚', unit: 'pcs', stockQuantity: 600, minStock: 60, costPerUnit: 4, active: true },
    { id: 'ing-milk', name: 'لبن', emoji: '🥛', unit: 'ml', stockQuantity: 20000, minStock: 2000, costPerUnit: 0.03, active: true },
    { id: 'ing-bread', name: 'عيش', emoji: '🍞', unit: 'pcs', stockQuantity: 400, minStock: 40, costPerUnit: 3, active: true },
    { id: 'ing-dough', name: 'عجينة بيتزا', emoji: '🍕', unit: 'pcs', stockQuantity: 200, minStock: 20, costPerUnit: 8, active: true },
    { id: 'ing-chicken-breast', name: 'صدر دجاج', emoji: '🍗', unit: 'g', stockQuantity: 25000, minStock: 2500, costPerUnit: 0.15, active: true },
    { id: 'ing-kofta', name: 'كفتة', emoji: '🥩', unit: 'g', stockQuantity: 8000, minStock: 800, costPerUnit: 0.18, active: true },
    { id: 'ing-sausage', name: 'سوسيس', emoji: '🌭', unit: 'g', stockQuantity: 6000, minStock: 600, costPerUnit: 0.15, active: true },
    { id: 'ing-cheese', name: 'جبنة', emoji: '🧀', unit: 'g', stockQuantity: 12000, minStock: 1200, costPerUnit: 0.1, active: true },
    { id: 'ing-mozz', name: 'موزاريلا', emoji: '🧀', unit: 'g', stockQuantity: 15000, minStock: 1500, costPerUnit: 0.12, active: true },
    { id: 'ing-lettuce', name: 'خس', emoji: '🥬', unit: 'g', stockQuantity: 6000, minStock: 600, costPerUnit: 0.05, active: true },
    { id: 'ing-tomato', name: 'طماطم', emoji: '🍅', unit: 'g', stockQuantity: 8000, minStock: 800, costPerUnit: 0.04, active: true },
    { id: 'ing-potato', name: 'بطاطس', emoji: '🥔', unit: 'g', stockQuantity: 30000, minStock: 3000, costPerUnit: 0.03, active: true },
    { id: 'ing-onion', name: 'بصل', emoji: '🧅', unit: 'g', stockQuantity: 5000, minStock: 500, costPerUnit: 0.02, active: true },
    { id: 'ing-pickle', name: 'مخلل', emoji: '🥒', unit: 'g', stockQuantity: 4000, minStock: 400, costPerUnit: 0.03, active: true },
    { id: 'ing-cola', name: 'كولا', emoji: '🥤', unit: 'ml', stockQuantity: 30000, minStock: 3000, costPerUnit: 0.01, active: true },
    { id: 'ing-nutella', name: 'نوتيلا', emoji: '🍫', unit: 'g', stockQuantity: 8000, minStock: 800, costPerUnit: 0.4, active: true },
    { id: 'ing-banana', name: 'موز', emoji: '🍌', unit: 'g', stockQuantity: 5000, minStock: 500, costPerUnit: 0.05, active: true },
    { id: 'ing-nuts', name: 'مكسرات', emoji: '🥜', unit: 'g', stockQuantity: 2000, minStock: 200, costPerUnit: 0.8, active: true },
    { id: 'ing-sauce-ketchup', name: 'كاتشب', emoji: '🍅', unit: 'ml', stockQuantity: 8000, minStock: 800, costPerUnit: 0.04, active: true },
    { id: 'ing-sauce-mayo', name: 'مايونيز', emoji: '🫙', unit: 'ml', stockQuantity: 8000, minStock: 800, costPerUnit: 0.05, active: true },
    { id: 'ing-sauce-garlic', name: 'صوص ثومية', emoji: '🧄', unit: 'ml', stockQuantity: 8000, minStock: 800, costPerUnit: 0.05, active: true },
    { id: 'ing-sauce-ranch', name: 'صوص رانش', emoji: '🥗', unit: 'ml', stockQuantity: 6000, minStock: 600, costPerUnit: 0.07, active: true },
    { id: 'ing-sauce-bbq', name: 'صوص باربكيو', emoji: '🫙', unit: 'ml', stockQuantity: 8000, minStock: 800, costPerUnit: 0.05, active: true },
    { id: 'ing-sauce-spicy', name: 'صوص حار', emoji: '🌶️', unit: 'ml', stockQuantity: 6000, minStock: 600, costPerUnit: 0.06, active: true },
    { id: 'ing-lemon', name: 'ليمون', emoji: '🍋', unit: 'g', stockQuantity: 4000, minStock: 400, costPerUnit: 0.05, active: true },
    { id: 'ing-mango', name: 'مانجو', emoji: '🥭', unit: 'g', stockQuantity: 6000, minStock: 600, costPerUnit: 0.12, active: true },
    { id: 'ing-strawberry', name: 'فراولة', emoji: '🍓', unit: 'g', stockQuantity: 4000, minStock: 400, costPerUnit: 0.15, active: true },
    { id: 'ing-tea', name: 'شاي', emoji: '🍵', unit: 'g', stockQuantity: 1000, minStock: 100, costPerUnit: 0.2, active: true },
    { id: 'ing-pepperoni', name: 'بيبروني', emoji: '🍕', unit: 'g', stockQuantity: 3000, minStock: 300, costPerUnit: 0.3, active: true },
  ]) T.ingredients.insert(i)

  // Recipes — crepe base + fillings
  const CB: [string, string, string, number][] = []
  let rn = 1
  const AR = (pid: string, iid: string, q: number) => CB.push([`r${rn++}`, pid, iid, q])
  const BASE: [string, number][] = [['ing-flour', 80], ['ing-milk', 80], ['ing-eggs', 1]]
  const FILL: Record<string, [string, number][]> = {
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
  }
  for (const pid of [...savoryIds, 'sw1', 'sw2', 'sw3', ...pizzaIds, ...mealIds]) {
    if (['p1', 'p2', 'p3', 'p4', 'm1', 'm2', 'm3', 'm4'].includes(pid)) {
      for (const [iid, q] of FILL[pid]) AR(pid, iid, q)
    } else {
      for (const [iid, q] of BASE) AR(pid, iid, q)
      for (const [iid, q] of FILL[pid]) AR(pid, iid, q)
    }
  }
  AR('d1', 'ing-cola', 330); AR('d2', 'ing-lemon', 80); AR('d3', 'ing-milk', 250)
  AR('d4', 'ing-tea', 5); AR('d5', 'ing-mango', 150); AR('d6', 'ing-strawberry', 150)
  for (const r of CB) T.recipes.insert({ id: r[0], productId: r[1], ingredientId: r[2], quantityPerUnit: r[3] })

  // Addon recipes
  for (const ar of [
    { id: 'ar1', addonId: 'addon-cheese', ingredientId: 'ing-cheese', quantityPerUnit: 20 },
    { id: 'ar2', addonId: 'addon-mozz', ingredientId: 'ing-mozz', quantityPerUnit: 25 },
    { id: 'ar3', addonId: 'addon-sauce', ingredientId: 'ing-sauce-bbq', quantityPerUnit: 15 },
    { id: 'ar4', addonId: 'addon-garlic', ingredientId: 'ing-sauce-garlic', quantityPerUnit: 15 },
    { id: 'ar5', addonId: 'addon-ketchup', ingredientId: 'ing-sauce-ketchup', quantityPerUnit: 15 },
    { id: 'ar6', addonId: 'addon-fries', ingredientId: 'ing-potato', quantityPerUnit: 100 },
    { id: 'ar7', addonId: 'addon-drink', ingredientId: 'ing-cola', quantityPerUnit: 200 },
    { id: 'ar8', addonId: 'addon-coleslaw', ingredientId: 'ing-lettuce', quantityPerUnit: 50 },
    { id: 'ar9', addonId: 'addon-pickle', ingredientId: 'ing-pickle', quantityPerUnit: 20 },
  ]) T.addonRecipes.insert(ar)

  // Modifier recipes
  for (const mr of [
    { id: 'mr1', modifierId: 'mod-size-large', ingredientId: 'ing-flour', quantityPerUnit: 40 },
    { id: 'mr2', modifierId: 'mod-size-large', ingredientId: 'ing-milk', quantityPerUnit: 40 },
    { id: 'mr3', modifierId: 'mod-size-large', ingredientId: 'ing-eggs', quantityPerUnit: 0.5 },
    { id: 'mr4', modifierId: 'mod-size-xl', ingredientId: 'ing-flour', quantityPerUnit: 80 },
    { id: 'mr5', modifierId: 'mod-size-xl', ingredientId: 'ing-milk', quantityPerUnit: 80 },
    { id: 'mr6', modifierId: 'mod-size-xl', ingredientId: 'ing-eggs', quantityPerUnit: 1 },
    { id: 'mr7', modifierId: 'mod-size-xl', ingredientId: 'ing-mozz', quantityPerUnit: 20 },
    { id: 'mr8', modifierId: 'mod-sauce-ketchup', ingredientId: 'ing-sauce-ketchup', quantityPerUnit: 15 },
    { id: 'mr9', modifierId: 'mod-sauce-mayo', ingredientId: 'ing-sauce-mayo', quantityPerUnit: 15 },
    { id: 'mr10', modifierId: 'mod-sauce-garlic', ingredientId: 'ing-sauce-garlic', quantityPerUnit: 15 },
    { id: 'mr11', modifierId: 'mod-sauce-ranch', ingredientId: 'ing-sauce-ranch', quantityPerUnit: 15 },
    { id: 'mr12', modifierId: 'mod-sauce-bbq', ingredientId: 'ing-sauce-bbq', quantityPerUnit: 15 },
    { id: 'mr13', modifierId: 'mod-sauce-spicy', ingredientId: 'ing-sauce-spicy', quantityPerUnit: 15 },
  ]) T.modifierRecipes.insert(mr)

  // Link addons to products
  for (const pid of savoryIds) {
    for (const aid of ['addon-cheese', 'addon-mozz', 'addon-sauce', 'addon-garlic', 'addon-ketchup', 'addon-fries', 'addon-drink', 'addon-coleslaw', 'addon-pickle']) {
      T.productAddons.insert({ productId: pid, addonId: aid })
    }
  }
  for (const pid of ['sw1', 'sw2', 'sw3']) T.productAddons.insert({ productId: pid, addonId: 'addon-drink' })
  for (const pid of pizzaIds) {
    for (const aid of ['addon-cheese', 'addon-mozz', 'addon-sauce', 'addon-garlic', 'addon-drink', 'addon-coleslaw']) {
      T.productAddons.insert({ productId: pid, addonId: aid })
    }
  }
  for (const pid of mealIds) {
    for (const aid of ['addon-sauce', 'addon-garlic', 'addon-ketchup', 'addon-fries', 'addon-drink', 'addon-coleslaw', 'addon-pickle']) {
      T.productAddons.insert({ productId: pid, addonId: aid })
    }
  }

  // Users — crepe house staff
  T.users.insert({ id: 'user-admin', name: 'أحمد السيد', pin: 'CrunchTime#2026', role: 'admin', active: true, createdAt: now() })
  T.users.insert({ id: 'user-cashier-a', name: 'محمد علي', pin: '1234', role: 'cashier', active: true, createdAt: now() })
  T.users.insert({ id: 'user-cashier-b', name: 'مصطفى كريم', pin: '5678', role: 'cashier', active: true, createdAt: now() })
}

seed()

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════
export const rendererApi = {
  session: {
    setUser: () => {},
    clearUser: () => {},
  },
  settings: {
    get: () => getSettings(),
    update: (data: any) => { T.settings.update(r => r.id === 'settings', data); return { ok: true } },
  },
  // Remote POS server — the in-browser mock has no Node HTTP listener, so the
  // toggle/port/PIN persist to the mock settings but `running` stays false.
  remote: {
    get: () => {
      const s = getSettings()
      return {
        enabled: !!s.remoteEnabled,
        port: Number(s.remotePort) || 4317,
        hasPin: !!s.remotePinHash,
        running: false,
        addresses: [],
        lan: [],
        remote: [],
        error: null,
      }
    },
    set: (data: { enabled?: boolean; port?: number }) => {
      const patch: any = {}
      if (data.port !== undefined) patch.remotePort = Number(data.port) || 4317
      if (data.enabled !== undefined) patch.remoteEnabled = !!data.enabled
      T.settings.update(r => r.id === 'settings', patch)
      return { ok: true, status: rendererApi.remote.get() }
    },
    setPin: (pin: string) => {
      if (String(pin || '').trim().length < 4) {
        return { ok: false, error: 'الرقم السري لازم يكون 4 أرقام على الأقل', status: rendererApi.remote.get() }
      }
      T.settings.update(r => r.id === 'settings', { remotePinHash: 'mock' })
      return { ok: true, status: rendererApi.remote.get() }
    },
    // Browser dev has no server, so there is nothing to pair with.
    generatePin: () => ({
      ok: false,
      error: 'وضع المتصفح — استخدم تطبيق الكمبيوتر',
      status: rendererApi.remote.get(),
    }),
    pairCode: () => ({ ok: false, error: 'وضع المتصفح — استخدم تطبيق الكمبيوتر' }),
    clearPairCode: () => ({ ok: true }),
  },
  // No server in the browser mock, so there are no pushed events to deliver.
  events: { onPush: () => () => {} },
  // Nor is Tailscale available outside the desktop app.
  tailscale: {
    status: async () => ({
      installed: false, online: false, ipv4: null, dnsName: null,
      binary: null, error: 'وضع المتصفح', canAutoInstall: false,
    }),
    install: async () => ({ ok: false, action: 'none', message: 'وضع المتصفح' }),
    up: async () => ({ ok: false, action: 'none', message: 'وضع المتصفح' }),
    funnelStatus: async () => ({
      available: false, enabled: false, url: null, dnsName: null, publicPort: null, error: 'وضع المتصفح',
    }),
    funnelEnable: async () => ({ ok: false, action: 'none', message: 'وضع المتصفح' }),
    funnelDisable: async () => ({ ok: false, action: 'none', message: 'وضع المتصفح' }),
  },
  discountCode: {
    list: () => T.discountCodes.select(),
    create: (data: any) => { const id = uuid(); T.discountCodes.insert({ id, ...data, active: true, usedCount: 0 }); return { id } },
    update: (id: string, data: any) => { T.discountCodes.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) return hardDelete(T.discountCodes, id)
      const row = T.discountCodes.get(r => r.id === id)
      if (!row) return { ok: false, error: 'كود الخصم غير موجود' }
      T.discountCodes.update(r => r.id === id, { active: false })
      return { ok: true }
    },
    validate: (code: string) => {
      const dc = T.discountCodes.get(r => r.code.toUpperCase() === code.toUpperCase() && r.active)
      if (!dc) return { valid: false, error: 'كود غير صالح' }
      if (dc.maxUses > 0 && dc.usedCount >= dc.maxUses) return { valid: false, error: 'انتهى الاستخدام' }
      // Employee daily code: shared uses per day, and the
      // discount only applies to the product-of-the-day.
      if (dc.mode === 'daily') {
        let usedToday = 0
        if (dc.dailyUses > 0) {
          const today = new Date().toDateString()
          usedToday = T.orders.select(r => r.discountCode === dc.code && r.createdAt && new Date(r.createdAt).toDateString() === today).length
          if (usedToday >= dc.dailyUses) return { valid: false, error: 'تم استهلاك استخدامات اليوم' }
        }
        const row = (dc.dayProducts || []).find((r: any) => r.dayOfWeek === new Date().getDay())
        if (!row) return { valid: false, error: 'لا يوجد صنف محدد لهذا اليوم' }
        const product = T.products.get((r: any) => r.id === row.productId)
        if (!product) return { valid: false, error: 'صنف اليوم غير موجود' }
        return {
          valid: true,
          discount: {
            id: dc.id, code: dc.code, type: dc.type, value: dc.value,
            mode: 'daily', productId: product.id, productName: product.name,
            remaining: dc.dailyUses > 0 ? dc.dailyUses - usedToday : null,
          },
        }
      }
      return { valid: true, discount: { id: dc.id, code: dc.code, type: dc.type, value: dc.value } }
    },
    use: (id: string) => { const dc = T.discountCodes.get(r => r.id === id); if (dc) dc.usedCount++; return { ok: true } },
  },
  deliveryZone: {
    list: (includeInactive?: boolean) => T.deliveryZones.select(includeInactive ? undefined : (r => r.active)).sort((a, b) => a.sortOrder - b.sortOrder),
    create: (data: any) => {
      const id = uuid()
      const maxSort = T.deliveryZones.select().reduce((m, z) => Math.max(m, Number(z.sortOrder) || 0), 0)
      T.deliveryZones.insert({ id, name: String(data.name || '').trim(), fee: Number(data.fee) || 0, sortOrder: maxSort + 1, active: true })
      return { id }
    },
    update: (id: string, data: any) => { T.deliveryZones.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) return hardDelete(T.deliveryZones, id, [{ table: T.orders, where: r => r.deliveryZoneId === id, label: 'طلبات سابقة' }])
      const row = T.deliveryZones.get(r => r.id === id)
      if (!row) return { ok: false, error: 'منطقة التوصيل غير موجودة' }
      T.deliveryZones.update(r => r.id === id, { active: false })
      return { ok: true }
    },
    reorder: (ids: string[]) => { ids.forEach((zid, i) => T.deliveryZones.update(r => r.id === zid, { sortOrder: i })); return { ok: true } },
  },
  deliveryProfile: {
    list: (includeInactive?: boolean) => includeInactive ? T.deliveryProfiles.select() : T.deliveryProfiles.select(r => r.active),
    create: (data: any) => { const id = uuid(); T.deliveryProfiles.insert({ id, name: data.name, phone: data.phone || null, active: true }); return { id } },
    update: (id: string, data: any) => { T.deliveryProfiles.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) return hardDelete(T.deliveryProfiles, id, [{ table: T.orders, where: r => r.deliveryProfileId === id, label: 'طلبات سابقة' }])
      const row = T.deliveryProfiles.get(r => r.id === id)
      if (!row) return { ok: false, error: 'مندوب التوصيل غير موجود' }
      T.deliveryProfiles.update(r => r.id === id, { active: false })
      return { ok: true }
    },
  },
  expense: {
    list: () => T.expenses.select(r => r.active),
    create: (data: any) => { const id = uuid(); T.expenses.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { T.expenses.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) return hardDelete(T.expenses, id)
      const row = T.expenses.get(r => r.id === id)
      if (!row) return { ok: false, error: 'المصروف غير موجود' }
      T.expenses.update(r => r.id === id, { active: false })
      return { ok: true }
    },
    totalMonthly: () => T.expenses.select(r => r.active && r.type === 'monthly').reduce((s, e) => s + e.amount, 0),
  },
  category: {
    list: () => T.categories.select(r => r.active).sort((a, b) => ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)) || a.name.localeCompare(b.name)),
    create: (data: any) => {
      const id = uuid()
      const maxOrder = Math.max(0, ...T.categories.select().map(c => c.sortOrder ?? 0))
      const sortOrder = typeof data.sortOrder === 'number' && !isNaN(data.sortOrder) ? data.sortOrder : maxOrder + 1
      T.categories.insert({ id, ...data, sortOrder, active: true })
      return { id }
    },
    update: (id: string, data: any) => { T.categories.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) {
        return hardDelete(
          T.categories, id,
          [{ table: T.products, where: r => r.categoryId === id, label: 'منتجات' }],
          [{ table: T.stationCategories, where: r => r.categoryId === id }],
        )
      }
      const row = T.categories.get(r => r.id === id)
      if (!row) return { ok: false, error: 'القسم غير موجود' }
      const activeProducts = T.products.select(r => r.categoryId === id && r.active)
      if (activeProducts.length > 0) return { ok: false, error: 'لا يمكن تعطيل القسم وفيه منتجات نشطة. عطّل المنتجات أولاً.' }
      T.categories.update(r => r.id === id, { active: false })
      T.stationCategories.delete(r => r.categoryId === id)
      return { ok: true }
    },
    reorder: (ids: string[]) => { ids.forEach((id, i) => T.categories.update(r => r.id === id, { sortOrder: i + 1 })); return { ok: true } },
  },
  product: {
    list: (categoryId?: string, includeInactive?: boolean) => {
      const rows = includeInactive ? T.products.select() : T.products.select(r => r.active)
      return categoryId ? rows.filter(r => r.categoryId === categoryId) : rows
    },
    getById: (id: string) => T.products.get(r => r.id === id) || null,
    create: (data: any) => { const id = uuid(); T.products.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { T.products.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) {
        return hardDelete(
          T.products, id,
          [{ table: T.orderItems, where: r => r.productId === id, label: 'طلبات سابقة' }],
          [
            { table: T.productAddons, where: r => r.productId === id },
            { table: T.productModifierGroups, where: r => r.productId === id },
            { table: T.recipes, where: r => r.productId === id },
          ],
        )
      }
      const row = T.products.get(r => r.id === id)
      if (!row) return { ok: false, error: 'المنتج غير موجود' }
      T.products.update(r => r.id === id, { active: false })
      T.productAddons.delete(r => r.productId === id)
      T.productModifierGroups.delete(r => r.productId === id)
      return { ok: true }
    },
  },
  addon: {
    list: () => T.addons.select(r => r.active),
    create: (data: any) => { const id = uuid(); T.addons.insert({ id, ...data, active: true }); return { id } },
    update: (id: string, data: any) => { T.addons.update(r => r.id === id, data); return { ok: true } },
    delete: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) {
        return hardDelete(
          T.addons, id,
          [{ table: T.addonRecipes, where: r => r.addonId === id, label: 'وصفات' }],
          [{ table: T.productAddons, where: r => r.addonId === id }],
        )
      }
      const row = T.addons.get(r => r.id === id)
      if (!row) return { ok: false, error: 'الإضافة غير موجودة' }
      T.addons.update(r => r.id === id, { active: false })
      T.productAddons.delete(r => r.addonId === id)
      return { ok: true }
    },
    listByProduct: (productId: string) => T.productAddons.select(r => r.productId === productId).map(l => T.addons.get(a => a.id === l.addonId)).filter(Boolean),
    linkToProduct: (productId: string, addonId: string) => { T.productAddons.insert({ productId, addonId }); return { ok: true } },
    setProductLinks: (productId: string, addonIds: string[]) => { T.productAddons.delete(r => r.productId === productId); addonIds.forEach(id => T.productAddons.insert({ productId, addonId: id })); return { ok: true } },
    listRecipes: (addonId: string) => T.addonRecipes.select(r => r.addonId === addonId),
    upsertRecipe: (data: any) => {
      if (data.id) { T.addonRecipes.update(r => r.id === data.id, { ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit }); return { id: data.id } }
      const id = uuid(); T.addonRecipes.insert({ id, addonId: data.addonId, ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit }); return { id }
    },
    deleteRecipe: (id: string) => { if (!T.addonRecipes.get(r => r.id === id)) return { ok: false, error: 'ارتباط الوصفة غير موجود' }; T.addonRecipes.delete(r => r.id === id); return { ok: true } },
  },
  modifier: {
    listGroups: () => T.modifierGroups.select(r => r.active).sort((a, b) => a.sortOrder - b.sortOrder),
    createGroup: (data: any) => { const id = uuid(); T.modifierGroups.insert({ id, ...data, active: true }); return { id } },
    updateGroup: (id: string, data: any) => { T.modifierGroups.update(r => r.id === id, data); return { ok: true } },
    deleteGroup: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) {
        if (!T.modifierGroups.get(r => r.id === id)) return { ok: false, error: 'مجموعة الخيارات غير موجودة' }
        const groupModifierIds = new Set(T.modifiers.select(r => r.modifierGroupId === id).map(m => m.id))
        if (T.modifierRecipes.select(r => groupModifierIds.has(r.modifierId)).length > 0) {
          return { ok: false, error: 'لا يمكن الحذف النهائي — المجموعة مرتبطة بوصفات خيارات. احذف الوصفات أولاً.' }
        }
        T.modifierRecipes.delete(r => groupModifierIds.has(r.modifierId))
        T.modifiers.delete(r => r.modifierGroupId === id)
        T.productModifierGroups.delete(r => r.modifierGroupId === id)
        T.modifierGroups.delete(r => r.id === id)
        return { ok: true }
      }
      const row = T.modifierGroups.get(r => r.id === id)
      if (!row) return { ok: false, error: 'مجموعة الخيارات غير موجودة' }
      T.modifierGroups.update(r => r.id === id, { active: false })
      T.modifiers.update(r => r.modifierGroupId === id, { active: false })
      T.productModifierGroups.delete(r => r.modifierGroupId === id)
      return { ok: true }
    },
    listByGroup: (groupId: string) => T.modifiers.select(r => r.active && r.modifierGroupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder),
    createModifier: (data: any) => { const id = uuid(); T.modifiers.insert({ id, ...data, active: true }); return { id } },
    updateModifier: (id: string, data: any) => { T.modifiers.update(r => r.id === id, data); return { ok: true } },
    deleteModifier: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) return hardDelete(T.modifiers, id, [{ table: T.modifierRecipes, where: r => r.modifierId === id, label: 'وصفات' }])
      const row = T.modifiers.get(r => r.id === id)
      if (!row) return { ok: false, error: 'الخيار غير موجود' }
      T.modifiers.update(r => r.id === id, { active: false })
      return { ok: true }
    },
    listByProduct: (productId: string) => {
      const links = T.productModifierGroups.select(r => r.productId === productId)
      return links.map(l => { const g = T.modifierGroups.get(g => g.id === l.modifierGroupId); if (!g) return null; return { ...g, modifiers: T.modifiers.select(r => r.active && r.modifierGroupId === g.id).sort((a, b) => a.sortOrder - b.sortOrder) } }).filter(Boolean)
    },
    linkToProduct: (productId: string, groupId: string) => { T.productModifierGroups.insert({ productId, modifierGroupId: groupId }); return { ok: true } },
    setProductLinks: (productId: string, groupIds: string[]) => { T.productModifierGroups.delete(r => r.productId === productId); groupIds.forEach(id => T.productModifierGroups.insert({ productId, modifierGroupId: id })); return { ok: true } },
    listRecipes: (modifierId: string) => T.modifierRecipes.select(r => r.modifierId === modifierId),
    upsertRecipe: (data: any) => {
      if (data.id) { T.modifierRecipes.update(r => r.id === data.id, { ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit }); return { id: data.id } }
      const id = uuid(); T.modifierRecipes.insert({ id, modifierId: data.modifierId, ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit }); return { id }
    },
    deleteRecipe: (id: string) => { if (!T.modifierRecipes.get(r => r.id === id)) return { ok: false, error: 'ارتباط الوصفة غير موجود' }; T.modifierRecipes.delete(r => r.id === id); return { ok: true } },
  },
  order: {
    create: (data: any) => {
      const settings = getSettings()
      const ts = now()
      const deliveryFee = data.orderType === 'delivery' ? (data.deliveryFee ?? settings.deliveryFee) : 0

      // Find current open shift
      const currentShift = T.shifts.get(r => r.status === 'open')
      const shiftId = currentShift?.id || data.shiftId || null
      const shiftNumber = Number(currentShift?.number) || 0
      const seq = T.orders.select(r => r.shiftId === shiftId).length
      const id = shiftNumber > 0
        ? `${shiftNumber}-${String(seq + 1).padStart(3, '0')}`
        : `#${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`

      T.orders.insert({
        id, status: 'COMPLETED', orderType: data.orderType,
        tableNumber: data.orderType === 'dine-in' ? (String(data.tableNumber || '').trim() || null) : null,
        customerName: data.customerName || null, customerPhone: data.customerPhone || null, customerAddress: data.customerAddress || null,
        // Money is always whole pounds — the mock never persists a float total.
        subtotal: Math.round(Number(data.subtotal) || 0),
        tax: Math.round(Number(data.tax) || 0),
        deliveryFee: Math.round(Number(deliveryFee) || 0),
        deliveryZoneId: data.deliveryZoneId || null,
        deliveryZoneName: data.deliveryZoneName
          || T.deliveryZones.get(r => r.id === data.deliveryZoneId)?.name || null,
        deliveryNote: (data.deliveryNote || '').trim() || null,
        deliveryProfileId: data.deliveryProfileId || null,
        deliveryProfileName: data.deliveryProfileName || null,
        // Same derivation as the Electron handler: the client can't claim a
        // driver it never sent, and non-delivery orders never enter the flow.
        driverStatus: data.orderType === 'delivery'
          ? (data.deliveryProfileId ? 'assigned' : 'unassigned')
          : null,
        discountCode: data.discountCode || null, discountAmount: Math.round(Number(data.discountAmount) || 0),
        total: Math.round(Number(data.total) || 0), paymentType: data.paymentType || 'cash',
        userId: data.userId || null, shiftId,
        cashierName: data.cashierName || null, note: (data.note || '').trim() || null, statusReason: null,
        createdAt: ts, updatedAt: ts,
      })
      for (const item of data.items) {
        T.orderItems.insert({
          id: uuid(), orderId: id, productId: item.productId, quantity: item.quantity,
          unitPrice: item.unitPrice, itemDiscount: item.itemDiscount || 0,
          note: (item.note || '').trim() || null,
          selectedModifiersJson: item.modifiers ? JSON.stringify(item.modifiers) : null,
          selectedAddonsJson: item.addons ? JSON.stringify(item.addons) : null,
        })
      }
      // Note: usedCount is incremented by discountCode.use() in Cart.tsx

      // Record SALE cash movement only for cash payments with an open shift
      if (shiftId && (data.paymentType || 'cash') === 'cash') {
        T.cashMovements.insert({ id: uuid(), shiftId, type: 'SALE', amount: data.total, note: `طلب ${id}`, createdAt: ts })
      }

      // Save/update delivery customer
      if (data.orderType === 'delivery' && data.customerPhone) {
        const phone = String(data.customerPhone).replace(/\D/g, '')
        if (phone) {
          const existing = T.customers.get(r => r.phone === phone)
          if (existing) {
            T.customers.update(r => r.phone === phone, {
              name: data.customerName || existing.name,
              address: data.customerAddress || existing.address,
              orderCount: (existing.orderCount || 0) + 1,
              lastOrderAt: ts,
            })
          } else {
            T.customers.insert({ id: uuid(), phone, name: data.customerName || null, address: data.customerAddress || null, orderCount: 1, lastOrderAt: ts, createdAt: ts })
          }
        }
      }

      return { id }
    },
    list: (filters?: any) => {
      let all = T.orders.select()
      const q = filters?.search ? filters.search.toLowerCase() : ''
      if (q) all = all.filter(o => o.id.toLowerCase().includes(q) || (o.customerName || '').toLowerCase().includes(q) || (o.customerPhone || '').toLowerCase().includes(q))
      if (filters?.status) all = all.filter(o => o.status === filters.status)
      if (filters?.from) all = all.filter(o => (o.createdAt || '') >= filters.from)
      if (filters?.to) all = all.filter(o => (o.createdAt || '') <= filters.to + '\uffff')
      return all
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(o => rendererApi.order.getById(o.id))
        .filter(Boolean) as any[]
    },
    getById: (id: string) => {
      const order = T.orders.get(r => r.id === id)
      if (!order) return null
      const items = T.orderItems.select(r => r.orderId === id).map(item => {
        const p = T.products.get(pr => pr.id === item.productId)
        // Check addon rollback status
        let addonRollbackInfo: { name: string; emoji: string; supportsRollback: boolean; price: number }[] = []
        if (item.selectedAddonsJson) {
          try {
            const addonIds = JSON.parse(item.selectedAddonsJson) as string[]
            addonRollbackInfo = addonIds.map((aid: string) => {
              const a = T.addons.get(ad => ad.id === aid)
              return a ? { name: a.name, emoji: a.emoji, supportsRollback: a.supportsRollback ?? true, price: a.price } : { name: '?', emoji: '?', supportsRollback: false, price: 0 }
            })
          } catch {}
        }
        return { ...item, productName: p?.name, productEmoji: p?.emoji, supportsRollback: p?.supportsRollback ?? false, addonRollbackInfo }
      })
      return { ...order, items, payments: T.payments.select(r => r.orderId === id) }
    },
    updateStatus: (id: string, status: string, reason?: string) => {
      const order = T.orders.get(r => r.id === id)
      if (!order) return { ok: false, error: 'الطلب غير موجود' }
      if ((status === 'CANCELLED' || status === 'REFUNDED') && (!reason || !reason.trim())) {
        return { ok: false, error: 'يجب إدخال سبب الإلغاء/الاسترداد' }
      }
      const ts = now()

      if (status === 'CANCELLED' && order.status === 'COMPLETED') {
        rollbackInventory(id)
        // If cash payment and has shift, record refund movement
        if (order.paymentType === 'cash' && order.shiftId) {
          T.cashMovements.insert({ id: uuid(), shiftId: order.shiftId, type: 'REFUND', amount: order.total, note: `إلغاء طلب ${id} — ${reason || ''}`, createdAt: ts })
        }
      }

      if (status === 'REFUNDED' && order.status === 'COMPLETED') {
        const refundedAmount = rollbackInventoryPartial(id)
        // If cash payment and has shift, record refund for the refunded portion only
        if (order.paymentType === 'cash' && order.shiftId && refundedAmount > 0) {
          T.cashMovements.insert({ id: uuid(), shiftId: order.shiftId, type: 'REFUND', amount: refundedAmount, note: `استرداد طلب ${id} — ${reason || ''}`, createdAt: ts })
        }
        T.orders.update(r => r.id === id, { status, statusReason: reason || null, refundedAmount, updatedAt: ts })
        return { ok: true, refundedAmount }
      }

      T.orders.update(r => r.id === id, { status, statusReason: reason || null, updatedAt: ts })
      return { ok: true }
    },
    // Delivery workflow (see the Electron `order:assignDriver` handler).
    assignDriver: (orderId: string, profileId: string) => {
      const order = T.orders.get(r => r.id === orderId)
      if (!order) return { ok: false, error: 'الطلب غير موجود' }
      if (order.orderType !== 'delivery') return { ok: false, error: 'التعيين متاح لطلبات التوصيل فقط' }
      if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        return { ok: false, error: 'الطلب ملغى أو مسترد — مفيش سبب لتعيين سائق' }
      }
      const profile = T.deliveryProfiles.get(r => r.id === profileId)
      if (!profile) return { ok: false, error: 'الديلفري غير موجود' }
      if (!profile.active) return { ok: false, error: 'الديلفري معطل — اختار واحد تاني' }
      T.orders.update(r => r.id === orderId, {
        deliveryProfileId: profile.id,
        deliveryProfileName: profile.name,
        driverStatus: 'assigned',
        updatedAt: now(),
      })
      return { ok: true, receiptReady: true }
    },
    // Today's unresolved delivery orders — feeds the الديلفري tab badge.
    // NULL on a delivery order means the same as 'unassigned' (mirrors the
    // Electron handler: rows written outside order:create still count).
    unassignedCount: () => {
      const todayStr = new Date().toISOString().slice(0, 10)
      return T.orders.select(r =>
        r.orderType === 'delivery' &&
        (r.driverStatus ?? 'unassigned') === 'unassigned' &&
        r.status !== 'CANCELLED' &&
        r.status !== 'REFUNDED' &&
        (r.createdAt || '') >= todayStr
      ).length
    },
    delete: (id: string) => {
      const order = T.orders.get(r => r.id === id)
      if (!order) return { ok: false, error: 'الطلب غير موجود' }
      if (order.status === 'COMPLETED') rollbackInventory(id)
      T.inventoryTransactions.delete(r => r.referenceOrderId === id)
      T.payments.delete(r => r.orderId === id)
      T.orderItems.delete(r => r.orderId === id)
      if (order.shiftId) {
        T.cashMovements.delete(r => r.shiftId === order.shiftId && String(r.note || '').includes(`طلب ${id}`))
      }
      T.orders.delete(r => r.id === id)
      if (order.customerPhone) {
        const customerPhone = String(order.customerPhone).replace(/\D/g, '')
        const customer = T.customers.get(r => r.phone === customerPhone)
        if (customer) {
          const remaining = T.orders.select(r => String(r.customerPhone || '').replace(/\D/g, '') === customerPhone)
          const latest = remaining.reduce((result, current) => !result || current.createdAt > result.createdAt ? current : result, null as Row | null)
          T.customers.update(r => r.id === customer.id, { orderCount: remaining.length, lastOrderAt: latest?.createdAt || null })
        }
      }
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
    delete: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) {
        return hardDelete(T.users, id, [
          { table: T.orders, where: r => r.userId === id, label: 'طلبات سابقة' },
          { table: T.shifts, where: r => r.userId === id, label: 'ورديات' },
        ])
      }
      const row = T.users.get(r => r.id === id)
      if (!row) return { ok: false, error: 'المستخدم غير موجود' }
      if (!row.active) return { ok: false, error: 'المستخدم معطل بالفعل' }
      if (row.role === 'admin') {
        const activeAdmins = T.users.select(r => r.active && r.role === 'admin')
        if (activeAdmins.length <= 1) return { ok: false, error: 'لا يمكن حذف آخر مدير في النظام' }
      }
      T.users.update(r => r.id === id, { active: false })
      return { ok: true }
    },
    verifyPin: (id: string, pin: string) => {
      const user = T.users.get(r => r.id === id && r.active)
      if (!user) return { ok: false, error: 'المستخدم غير موجود' }
      if (user.pin !== pin) return { ok: false, error: 'الرقم السري غلط' }
      return { ok: true, user: { id: user.id, name: user.name, role: user.role } }
    },
  },
  customer: {
    search: (prefix: string) => {
      const digits = String(prefix || '').replace(/\D/g, '')
      if (digits.length < 3) return []
      return T.customers.select(r => (r.phone || '').startsWith(digits))
        .sort((a, b) => (b.lastOrderAt || '').localeCompare(a.lastOrderAt || ''))
        .slice(0, 8)
    },
    upsert: (data: any) => {
      const phone = String(data.phone || '').replace(/\D/g, '')
      if (!phone) return { ok: false }
      const existing = T.customers.get(r => r.phone === phone)
      if (existing) {
        T.customers.update(r => r.phone === phone, {
          name: data.name || existing.name,
          address: data.address || existing.address,
          orderCount: (existing.orderCount || 0) + 1,
          lastOrderAt: now(),
        })
        return { ok: true, id: existing.id }
      }
      const id = uuid()
      T.customers.insert({ id, phone, name: data.name || null, address: data.address || null, orderCount: 1, lastOrderAt: now(), createdAt: now() })
      return { ok: true, id }
    },
  },
  shift: {
    open: (data: any) => {
      const id = uuid()
      const maxNumber = T.shifts.select().reduce((m, s) => Math.max(m, Number(s.number) || 0), 0)
      T.shifts.insert({ id, number: maxNumber + 1, userId: data.userId, startedAt: now(), openingCash: data.openingCash, closingCash: null, status: 'open' })
      T.cashMovements.insert({ id: uuid(), shiftId: id, type: 'OPENING', amount: data.openingCash, note: 'رصيد افتتاحي', createdAt: now() })
      return { id }
    },
    close: (id: string, closingCash: number) => {
      T.shifts.update(r => r.id === id, { endedAt: now(), closingCash, status: 'closed' })
      T.cashMovements.insert({ id: uuid(), shiftId: id, type: 'CLOSING', amount: closingCash, note: 'إغلاق الوردية', createdAt: now() })
      return { ok: true }
    },
    getCurrent: () => T.shifts.get(r => r.status === 'open') || null,
    list: (filters?: any) => filters?.userId ? T.shifts.select(r => r.userId === filters.userId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : T.shifts.select().sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  },
  cashDrawer: {
    addMovement: (data: any) => { const id = uuid(); T.cashMovements.insert({ id, ...data, createdAt: now() }); return { id } },
    listByShift: (shiftId: string) => T.cashMovements.select(r => r.shiftId === shiftId),
    reconcile: (shiftId: string) => {
      const shift = T.shifts.get(r => r.id === shiftId)
      if (!shift) return null
      const movs = T.cashMovements.select(r => r.shiftId === shiftId)
      let expected = shift.openingCash
      const breakdown: Record<string, number> = {}
      for (const m of movs) {
        if (m.type === 'OPENING' || m.type === 'CLOSING') continue
        const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
        expected += m.amount * sign
        breakdown[m.type] = (breakdown[m.type] || 0) + m.amount * sign
      }
      const actual = shift.closingCash ?? 0
      return { openingCash: shift.openingCash, breakdown, expected, actual, difference: actual - expected }
    },
  },
  inventory: {
    listIngredients: () => T.ingredients.select(r => r.active),
    createIngredient: (data: any) => { const id = uuid(); T.ingredients.insert({ id, ...data, active: true }); return { id } },
    updateIngredient: (id: string, data: any) => { T.ingredients.update(r => r.id === id, data); return { ok: true } },
    deleteIngredient: (id: string, opts?: DeleteOpts) => {
      const row = T.ingredients.get(r => r.id === id)
      if (!row) return { ok: false, error: 'المادة غير موجودة' }

      if (opts?.hard) {
        return hardDelete(T.ingredients, id, [
          { table: T.inventoryTransactions, where: r => r.ingredientId === id, label: 'حركات مخزون' },
          { table: T.recipes, where: r => r.ingredientId === id, label: 'وصفات منتجات' },
          { table: T.subRecipeIngredients, where: r => r.ingredientId === id, label: 'وصفات فرعية' },
          { table: T.addonRecipes, where: r => r.ingredientId === id, label: 'وصفات إضافات' },
          { table: T.modifierRecipes, where: r => r.ingredientId === id, label: 'وصفات خيارات' },
        ])
      }
      if (!row.active) return { ok: false, error: 'المادة معطلة بالفعل' }
      const used = T.recipes.select(r => r.ingredientId === id).length > 0
        || T.subRecipeIngredients.select(r => r.ingredientId === id).length > 0
        || T.addonRecipes.select(r => r.ingredientId === id).length > 0
        || T.modifierRecipes.select(r => r.ingredientId === id).length > 0
      if (used) return { ok: false, error: 'لا يمكن تعطيل المادة لأنها مستخدمة في وصفات. احذف الارتباطات أولاً.' }
      T.ingredients.update(r => r.id === id, { active: false })
      return { ok: true }
    },
    listRecipes: (productId: string) => T.recipes.select(r => r.productId === productId),
    upsertRecipe: (data: any) => { if (data.id) { T.recipes.update(r => r.id === data.id, { quantityPerUnit: data.quantityPerUnit }); return { id: data.id } } const id = uuid(); T.recipes.insert({ id, ...data }); return { id } },
    deleteRecipe: (id: string) => {
      const row = T.recipes.get(r => r.id === id)
      if (!row) return { ok: false, error: 'ارتباط الوصفة غير موجود' }
      T.recipes.delete(r => r.id === id)
      return { ok: true }
    },
    getAlerts: () => T.ingredients.select(r => r.active && r.stockQuantity <= r.minStock),
    restock: (ingredientId: string, qty: number, note?: string) => {
      const ing = T.ingredients.get(r => r.id === ingredientId); if (ing) ing.stockQuantity += qty
      T.inventoryTransactions.insert({ id: uuid(), ingredientId, type: 'PURCHASE', quantity: qty, note: note || 'إعادة تعبئة', createdAt: now() }); return { ok: true }
    },
    deductForOrder: (orderId: string) => { deductInventory(orderId); return { ok: true } },
    listTransactions: (ingredientId: string, filters?: any) => {
      const ingredient = T.ingredients.get(r => r.id === ingredientId)
      if (!ingredient) return { ingredient: null, currentStock: 0, openingBalance: 0, movements: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
      let rows = T.inventoryTransactions.select(r => r.ingredientId === ingredientId)
      if (filters?.type) rows = rows.filter(r => r.type === filters.type)
      if (filters?.from) rows = rows.filter(r => (r.createdAt || '') >= filters.from)
      if (filters?.to) rows = rows.filter(r => (r.createdAt || '') <= filters.to + '\uffff')
      rows = rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      const currentStock = Number(ingredient.stockQuantity) || 0
      const grandTotal = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
      const total = rows.length
      const pageSize = Math.min(Math.max(filters?.pageSize || 20, 5), 100)
      const totalPages = Math.max(1, Math.ceil(total / pageSize))
      const page = Math.min(Math.max(filters?.page || 1, 1), totalPages)
      const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)
      const newerSum = rows.slice(0, (page - 1) * pageSize).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
      let running = currentStock - newerSum
      const withBal = [...pageRows].reverse().map(r => {
        const bal = running
        running = running - (Number(r.quantity) || 0)
        return { ...r, quantity: Number(r.quantity) || 0, balance: bal }
      })
      return { ingredient, currentStock, openingBalance: currentStock - grandTotal, movements: withBal.reverse(), total, page, pageSize, totalPages }
    },
    recordWaste: (ingredientId: string, qty: number, note?: string) => {
      const amount = -Math.abs(Number(qty) || 0)
      const ing = T.ingredients.get(r => r.id === ingredientId); if (ing) ing.stockQuantity += amount
      T.inventoryTransactions.insert({ id: uuid(), ingredientId, type: 'WASTE', quantity: amount, note: note || 'تالف', createdAt: now() })
      return { ok: true }
    },
    adjust: (ingredientId: string, delta: number, note?: string) => {
      const qty = Number(delta) || 0
      const ing = T.ingredients.get(r => r.id === ingredientId); if (ing) ing.stockQuantity += qty
      T.inventoryTransactions.insert({ id: uuid(), ingredientId, type: 'ADJUSTMENT', quantity: qty, note: note || 'تسوية يدوية', createdAt: now() })
      return { ok: true }
    },
  },
  report: {
    // End-of-day delivery settlement — groups delivery orders by driver; the
    // cash column is COD money the driver hands over (mirrors `report:driverSummary`).
    driverSummary: (opts?: { from?: string; to?: string }) => {
      const from = (opts?.from || new Date().toISOString().slice(0, 10)).slice(0, 10)
      const to = (opts?.to || from).slice(0, 10)
      const rows = T.orders.select(r =>
        r.orderType === 'delivery' &&
        r.status !== 'CANCELLED' && r.status !== 'REFUNDED' &&
        (r.createdAt || '') >= from && (r.createdAt || '') <= to + '\uffff')
      const profiles = T.deliveryProfiles.select()

      const bucket = () => ({ orderCount: 0, cashTotal: 0, visaTotal: 0, deliveryFee: 0, total: 0 })
      const groups = new Map<string | null, ReturnType<typeof bucket>>()
      for (const o of rows) {
        const key = o.driverStatus === 'assigned' && o.deliveryProfileId ? o.deliveryProfileId : null
        if (!groups.has(key)) groups.set(key, bucket())
        const b = groups.get(key)!
        b.orderCount++
        b.deliveryFee += Number(o.deliveryFee) || 0
        b.total += Number(o.total) || 0
        if (o.paymentType === 'cash') b.cashTotal += Number(o.total) || 0
        else b.visaTotal += Number(o.total) || 0
      }
      const named = [...groups.entries()].map(([profileId, b]) => {
        const p = profileId ? profiles.find(x => x.id === profileId) : null
        const sample = rows.find(o => (o.deliveryProfileId || null) === profileId)
        return {
          profileId,
          name: p?.name || (profileId ? sample?.deliveryProfileName : 'بدون سائق') || 'ديلفري محذوف',
          phone: p?.phone || null,
          active: p ? p.active : false,
          orderCount: b.orderCount,
          cashTotal: Math.round(b.cashTotal),
          visaTotal: Math.round(b.visaTotal),
          deliveryFee: Math.round(b.deliveryFee),
          total: Math.round(b.total),
        }
      })
      const all = bucket()
      for (const o of rows) {
        all.orderCount++
        all.deliveryFee += Number(o.deliveryFee) || 0
        all.total += Number(o.total) || 0
        if (o.paymentType === 'cash') all.cashTotal += Number(o.total) || 0
        else all.visaTotal += Number(o.total) || 0
      }
      return {
        from,
        to,
        drivers: named.filter(d => d.profileId !== null).sort((a, b) => b.total - a.total),
        unassigned: named.find(d => d.profileId === null) || {
          profileId: null, name: 'بدون سائق', phone: null, active: false,
          orderCount: 0, cashTotal: 0, visaTotal: 0, deliveryFee: 0, total: 0,
        },
        totals: {
          orderCount: all.orderCount,
          cashTotal: Math.round(all.cashTotal),
          visaTotal: Math.round(all.visaTotal),
          deliveryFee: Math.round(all.deliveryFee),
          total: Math.round(all.total),
        },
      }
    },
    dailySummary: (date?: string) => {
      const d = date || new Date().toISOString().slice(0, 10)
      const all = T.orders.select()
      const day = all.filter(o => o.createdAt?.startsWith(d) && o.status !== 'CANCELLED')
      const cancelled = all.filter(o => o.createdAt?.startsWith(d) && o.status === 'CANCELLED')
      const refunded = all.filter(o => o.createdAt?.startsWith(d) && o.status === 'REFUNDED')
      const totalRefunded = refunded.reduce((s, o) => s + (o.refundedAmount || 0), 0)
      const revenue = day.reduce((s, o) => s + o.total, 0) - totalRefunded
      const costOfGoods = day.reduce((s, o) => {
        const items = T.orderItems.select(r => r.orderId === o.id)
        return s + items.reduce((is, item) => { const p = T.products.get(pr => pr.id === item.productId); return is + (p?.costPrice || 0) * item.quantity }, 0)
      }, 0)
      return { date: d, totalOrders: day.length, totalRevenue: revenue, avgOrderValue: day.length > 0 ? revenue / day.length : 0, cancelledOrders: cancelled.length, refundedOrders: refunded.length, totalRefunded, cancellationRate: 0, costOfGoods, grossProfit: revenue - costOfGoods }
    },
    periodSummary: (from?: string, to?: string) => {
      const allOrders = T.orders.select()
      const inRange = (o: any) => {
        if (from && o.createdAt < from) return false
if (to && o.createdAt > to + '\uffff') return false
        return true
      }
      const active = allOrders.filter(o => o.status !== 'CANCELLED' && inRange(o))
      const cancelled = allOrders.filter(o => o.status === 'CANCELLED' && inRange(o))
      const refunded = active.filter(o => o.status === 'REFUNDED')
      const totalRefunded = refunded.reduce((s, o) => s + (o.refundedAmount || 0), 0)
      const totalRevenue = active.reduce((s, o) => s + o.total, 0) - totalRefunded
      const costOfGoods = active.reduce((s, o) => {
        const items = T.orderItems.select(r => r.orderId === o.id)
        return s + items.reduce((is, item) => { const p = T.products.get(pr => pr.id === item.productId); return is + (p?.costPrice || 0) * item.quantity }, 0)
      }, 0)
      return {
        from: from || null, to: to || null,
        totalOrders: active.length, totalRevenue,
        avgOrderValue: active.length > 0 ? totalRevenue / active.length : 0,
        cancelledOrders: cancelled.length, refundedOrders: refunded.length, totalRefunded,
        costOfGoods, grossProfit: totalRevenue - costOfGoods,
      }
    },
    profitSummary: (_from?: string, to?: string) => {
      const toDate = (to || new Date().toISOString().slice(0, 10)).slice(0, 10)
      const fromDate = `${toDate.slice(0, 7)}-01`
      const all = T.orders.select().filter(o => { if (o.status === 'CANCELLED') return false; if (o.createdAt < fromDate) return false; if (o.createdAt > toDate + '￿') return false; return true })
      const refunded = all.filter(o => o.status === 'REFUNDED')
      const totalRefunded = refunded.reduce((s, o) => s + (o.refundedAmount || 0), 0)
      const revenue = all.reduce((s, o) => s + o.total, 0) - totalRefunded
      const costOfGoods = all.reduce((s, o) => { const items = T.orderItems.select(r => r.orderId === o.id); return s + items.reduce((is, item) => { const p = T.products.get(pr => pr.id === item.productId); return is + (p?.costPrice || 0) * item.quantity }, 0) }, 0)
      const totalExpenses = T.expenses.select(r => r.active).reduce((s, e) => s + e.amount, 0)
      const deliveryFees = all.filter(o => o.orderType === 'delivery').reduce((s, o) => s + (o.deliveryFee || 0), 0)
      const discounts = all.reduce((s, o) => s + (o.discountAmount || 0), 0)
      const taxCollected = all.reduce((s, o) => s + o.tax, 0)
      return { from: fromDate, to: toDate, revenue, costOfGoods, grossProfit: revenue - costOfGoods, totalExpenses, deliveryFees, discounts, taxCollected, totalRefunded, netProfit: revenue - costOfGoods - totalExpenses }
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
    shiftReport: (shiftId: string) => {
      const shift = T.shifts.get(r => r.id === shiftId)
      if (!shift) return null
      const user = T.users.get(r => r.id === shift.userId)
      const shiftOrders = T.orders.select(o => o.shiftId === shiftId && o.status !== 'CANCELLED')
      const movs = T.cashMovements.select(r => r.shiftId === shiftId)
      let expected = shift.openingCash
      for (const m of movs) {
        if (m.type === 'OPENING' || m.type === 'CLOSING') continue
        const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
        expected += m.amount * sign
      }
      const payAgg: Record<string, any> = {}
      for (const o of shiftOrders) {
        const method = o.paymentType || 'cash'
        if (!payAgg[method]) payAgg[method] = { method, count: 0, total: 0 }
        payAgg[method].count++
        payAgg[method].total += o.total
      }
      const productMap = new Map(T.products.select().map((p: any) => [p.id, p]))
      const itemAgg: Record<string, any> = {}
      for (const o of shiftOrders) {
        for (const item of T.orderItems.select((i: any) => i.orderId === o.id)) {
          if (!itemAgg[item.productId]) itemAgg[item.productId] = { productId: item.productId, qty: 0, revenue: 0 }
          itemAgg[item.productId].qty += item.quantity
          itemAgg[item.productId].revenue += item.unitPrice * item.quantity
        }
      }
      const topItems = Object.values(itemAgg).sort((a: any, b: any) => b.qty - a.qty).slice(0, 5).map((t: any) => {
        const p = productMap.get(t.productId)
        return { name: p?.name || 'غير معروف', emoji: p?.emoji || '', qty: t.qty, revenue: Math.round(t.revenue * 100) / 100 }
      })
      const hourAgg: Record<number, any> = {}
      for (const o of shiftOrders) {
        const h = new Date(o.createdAt).getHours()
        if (!hourAgg[h]) hourAgg[h] = { orderCount: 0, revenue: 0 }
        hourAgg[h].orderCount++
        hourAgg[h].revenue += o.total
      }
      const hourly = Object.entries(hourAgg)
        .map(([hour, data]: [string, any]) => ({ hour: Number(hour), orderCount: data.orderCount, revenue: Math.round(data.revenue * 100) / 100 }))
        .sort((a: any, b: any) => a.hour - b.hour)
      const movAgg: Record<string, number> = {}
      for (const m of movs) {
        if (m.type === 'OPENING' || m.type === 'CLOSING') continue
        const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
        movAgg[m.type] = (movAgg[m.type] || 0) + m.amount * sign
      }
      const movements = Object.entries(movAgg).map(([type, amount]) => ({ type, amount: Math.round(amount * 100) / 100 }))
      return {
        shiftId, userName: user?.name || 'غير معروف',
        startedAt: shift.startedAt, endedAt: shift.endedAt,
        orderCount: shiftOrders.length,
        totalRevenue: shiftOrders.reduce((s: number, o: any) => s + o.total, 0),
        openingCash: shift.openingCash, closingCash: shift.closingCash,
        expectedCash: expected,
        cashDifference: shift.closingCash != null ? shift.closingCash - expected : null,
        payments: Object.values(payAgg),
        topItems,
        hourly,
        movements,
      }
    },
    revenueTrend: (days = 7) => {
      const all = T.orders.select(r => r.status !== 'CANCELLED'); const result: any[] = []
      for (let d = days - 1; d >= 0; d--) { const date = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10); const day = all.filter(o => o.createdAt?.startsWith(date)); result.push({ date, revenue: day.reduce((s, o) => s + o.total, 0), orderCount: day.length }) }
      return result
    },
    laborSummary: (from?: string, to?: string) => {
      const inRange = (ts: string) => { if (from && ts < from) return false; if (to && ts > to + '\uffff') return false; return true }
      const allUsers = T.users.select(r => r.active)
      const allShifts = T.shifts.select().filter(x => inRange(x.startedAt))
      const allOrders = T.orders.select().filter(o => o.status !== 'CANCELLED' && inRange(o.createdAt))
      const totalRevenue = allOrders.reduce((s, o) => s + o.total, 0)
      let totalLaborCost = 0
      const staff = allUsers.map(u => {
        const uShifts = allShifts.filter(x => x.userId === u.id)
        const hoursWorked = uShifts.reduce((s, x) => x.endedAt ? s + (new Date(x.endedAt).getTime() - new Date(x.startedAt).getTime()) / 3600000 : s, 0)
        const uOrders = allOrders.filter(o => o.userId === u.id)
        const sales = uOrders.reduce((s, o) => s + o.total, 0)
        const wage = hoursWorked * (u.hourlyRate || 0)
        const commission = sales * ((u.commissionRate || 0) / 100)
        const laborCost = wage + commission
        totalLaborCost += laborCost
        return { id: u.id, name: u.name, role: u.role, hourlyRate: u.hourlyRate || 0, commissionRate: u.commissionRate || 0, shiftCount: uShifts.length, hoursWorked: Math.round(hoursWorked * 10) / 10, orderCount: uOrders.length, sales, wage: Math.round(wage), commission: Math.round(commission), laborCost: Math.round(laborCost) }
      }).sort((a: any, b: any) => b.sales - a.sales)
      return { totalRevenue, totalLaborCost: Math.round(totalLaborCost), laborCostPct: totalRevenue > 0 ? (totalLaborCost / totalRevenue) * 100 : 0, staff }
    },
    voidSummary: (from?: string, to?: string) => {
      const inRange = (ts: string) => { if (from && ts < from) return false; if (to && ts > to + '\uffff') return false; return true }
      const allOrders = T.orders.select().filter(o => inRange(o.createdAt))
      const cancelled = allOrders.filter(o => o.status === 'CANCELLED')
      const refunded = allOrders.filter(o => o.status === 'REFUNDED')
      const allUsers = T.users.select()
      const voidByUser: Record<string, any> = {}
      const bump = (userId: string | null, cashierName: string | null, kind: string, amount: number) => {
        const key = userId || cashierName || 'unknown'
        if (!voidByUser[key]) { const u = allUsers.find(x => x.id === userId); voidByUser[key] = { name: u?.name || cashierName || 'غير معروف', cancels: 0, refunds: 0, cancelAmount: 0, refundAmount: 0 } }
        if (kind === 'cancel') { voidByUser[key].cancels++; voidByUser[key].cancelAmount += amount } else { voidByUser[key].refunds++; voidByUser[key].refundAmount += amount }
      }
      for (const o of cancelled) bump(o.userId, o.cashierName, 'cancel', o.total)
      for (const o of refunded) bump(o.userId, o.cashierName, 'refund', o.refundedAmount || o.total)
      const discounted = allOrders.filter(o => o.status !== 'CANCELLED' && (o.discountAmount || 0) > 0)
      const discountByUser: Record<string, any> = {}
      for (const o of discounted) {
        const key = o.userId || o.cashierName || 'unknown'
        if (!discountByUser[key]) { const u = allUsers.find(x => x.id === o.userId); discountByUser[key] = { name: u?.name || o.cashierName || 'غير معروف', count: 0, total: 0 } }
        discountByUser[key].count++; discountByUser[key].total += o.discountAmount || 0
      }
      return {
        cancelCount: cancelled.length, cancelAmount: cancelled.reduce((s, o) => s + o.total, 0),
        refundCount: refunded.length, refundAmount: refunded.reduce((s, o) => s + (o.refundedAmount || 0), 0),
        discountCount: discounted.length, discountAmount: discounted.reduce((s, o) => s + (o.discountAmount || 0), 0),
        cancels: cancelled.slice(0, 20).map(o => ({ id: o.id, total: o.total, reason: o.statusReason, cashierName: o.cashierName, createdAt: o.createdAt })),
        refunds: refunded.slice(0, 20).map(o => ({ id: o.id, total: o.total, refundedAmount: o.refundedAmount, reason: o.statusReason, cashierName: o.cashierName, createdAt: o.createdAt })),
        discounts: discounted.slice(0, 20).map(o => ({ id: o.id, total: o.total, discountAmount: o.discountAmount, discountCode: o.discountCode, cashierName: o.cashierName, createdAt: o.createdAt })),
        voidByUser: Object.values(voidByUser).sort((a: any, b: any) => (b.cancelAmount + b.refundAmount) - (a.cancelAmount + a.refundAmount)),
        discountByUser: Object.values(discountByUser).sort((a: any, b: any) => b.total - a.total),
      }
    },
    inventoryAlerts: () => T.ingredients.select(r => r.active && r.stockQuantity <= r.minStock),
    paymentMethodBreakdown: () => [],
  },
  printer: {
    list: async () => [],
    printHtml: async (html: string, _opts?: any) => {
      const w = window.open('', '_blank', 'width=400,height=600')
      if (!w) return { ok: false, error: 'تعذر فتح نافذة الطباعة' }
      w.document.write(html)
      w.document.close()
      w.onload = () => { w.print() }
      return { ok: true }
    },
    test: async () => ({ ok: true }),
  },
  station: {
    list: (includeInactive?: boolean) => {
      const rows = T.kitchenStations.select(includeInactive ? undefined : (r => r.active)).sort((a, b) => a.sortOrder - b.sortOrder)
      const links = T.stationCategories.select()
      return rows.map(s => ({ ...s, categoryIds: links.filter(l => l.stationId === s.id).map(l => l.categoryId) }))
    },
    create: (data: any) => {
      const id = uuid()
      const maxSort = T.kitchenStations.select().reduce((m, z) => Math.max(m, Number(z.sortOrder) || 0), 0)
      T.kitchenStations.insert({ id, name: String(data.name || 'محطة'), printerName: data.printerName || null, paperWidth: data.paperWidth || '80mm', sortOrder: maxSort + 1, active: true })
      if (Array.isArray(data.categoryIds)) for (const cid of data.categoryIds) T.stationCategories.insert({ stationId: id, categoryId: cid })
      return { id }
    },
    update: (id: string, data: any) => {
      const update: any = {}
      if (data.name !== undefined) update.name = data.name
      if (data.printerName !== undefined) update.printerName = data.printerName
      if (data.paperWidth !== undefined) update.paperWidth = data.paperWidth
      if (data.active !== undefined) update.active = data.active
      if (Object.keys(update).length > 0) T.kitchenStations.update(r => r.id === id, update)
      if (Array.isArray(data.categoryIds)) {
        T.stationCategories.delete(r => r.stationId === id)
        for (const cid of data.categoryIds) T.stationCategories.insert({ stationId: id, categoryId: cid })
      }
      return { ok: true }
    },
    delete: (id: string, opts?: DeleteOpts) => {
      if (opts?.hard) {
        return hardDelete(T.kitchenStations, id, [], [{ table: T.stationCategories, where: r => r.stationId === id }])
      }
      const row = T.kitchenStations.get(r => r.id === id)
      if (!row) return { ok: false, error: 'محطة المطبخ غير موجودة' }
      T.kitchenStations.update(r => r.id === id, { active: false })
      return { ok: true }
    },
    routeOrder: (orderId: string) => {
      const items = T.orderItems.select(r => r.orderId === orderId)
      const pMap = new Map(T.products.select().map(p => [p.id, p]))
      const links = T.stationCategories.select()
      const catToStation = new Map<string, string>()
      for (const l of links) if (!catToStation.has(l.categoryId)) catToStation.set(l.categoryId, l.stationId)
      const stations = T.kitchenStations.select(r => r.active && r.id !== 'st-receipt').sort((a, b) => a.sortOrder - b.sortOrder)
      const routes: { station: any; items: any[] }[] = stations.map(s => ({ station: { ...s, categoryIds: links.filter(l => l.stationId === (s as any).id).map(l => l.categoryId) }, items: [] as any[] }))
      const unrouted: any[] = []
      for (const item of items) {
        const p = pMap.get(item.productId) as any
        const sid = p?.categoryId ? catToStation.get(p.categoryId) : undefined
        const route = routes.find(r => r.station.id === sid)
        const enriched = { ...item, productName: p?.name, productEmoji: p?.emoji, categoryId: p?.categoryId }
        if (route) route.items.push(enriched)
        else unrouted.push(enriched)
      }
      return { routes: routes.filter(r => r.items.length > 0), unrouted }
    },
  },
  subRecipe: {
    listAll: () => T.subRecipes.select().map(s => ({
      ...s,
      ingredientCount: T.subRecipeIngredients.select(r => r.subRecipeId === s.id).length,
    })),
    upsert: (data: any) => {
      if (data.id) { T.subRecipes.update(r => r.id === data.id, { name: data.name, unit: data.unit }); return { id: data.id } }
      const id = uuid(); T.subRecipes.insert({ id, name: data.name, unit: data.unit, active: true }); return { id }
    },
    delete: (id: string, opts?: DeleteOpts) => {
      const row = T.subRecipes.get(r => r.id === id)
      if (!row) return { ok: false, error: 'الوصفة الفرعية غير موجودة' }

      if (opts?.hard) {
        return hardDelete(
          T.subRecipes, id,
          [
            { table: T.recipes, where: r => r.subRecipeId === id, label: 'وصفات منتجات' },
            { table: T.addonRecipes, where: r => r.subRecipeId === id, label: 'وصفات إضافات' },
            { table: T.modifierRecipes, where: r => r.subRecipeId === id, label: 'وصفات خيارات' },
          ],
          [{ table: T.subRecipeIngredients, where: r => r.subRecipeId === id }],
        )
      }
      if (!row.active) return { ok: false, error: 'الوصفة الفرعية معطلة بالفعل' }
      const used = T.recipes.select(r => r.subRecipeId === id).length > 0
        || T.addonRecipes.select(r => r.subRecipeId === id).length > 0
        || T.modifierRecipes.select(r => r.subRecipeId === id).length > 0
      if (used) return { ok: false, error: 'لا يمكن تعطيل الوصفة الفرعية لأنها مرتبطة بمنتجات/إضافات/خيارات.' }
      T.subRecipes.update(r => r.id === id, { active: false })
      return { ok: true }
    },
    listIngredients: (subRecipeId: string) => T.subRecipeIngredients.select(r => r.subRecipeId === subRecipeId),
    upsertIngredient: (data: any) => {
      if (data.id) { T.subRecipeIngredients.update(r => r.id === data.id, { ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit }); return { id: data.id } }
      const id = uuid(); T.subRecipeIngredients.insert({ id, subRecipeId: data.subRecipeId, ingredientId: data.ingredientId, quantityPerUnit: data.quantityPerUnit }); return { id }
    },
    deleteIngredient: (id: string) => {
      const row = T.subRecipeIngredients.get(r => r.id === id)
      if (!row) return { ok: false, error: 'ارتباط المادة غير موجود' }
      T.subRecipeIngredients.delete(r => r.id === id)
      return { ok: true }
    },
  },
  backup: { trigger: () => ({ ok: true }), getStatus: () => ({ lastBackup: null, backupCount: 0 }) },
}
