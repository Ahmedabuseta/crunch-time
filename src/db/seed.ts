import { getSqlite } from './client'
import { randomUUID } from 'crypto'
import argon2 from 'argon2'

// Deterministic RNG so reseeds produce the same demo month
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TABLES_TO_WIPE = [
  'purchase_price_history', 'inventory_transactions', 'payments', 'order_items',
  'orders', 'cash_movements', 'shifts', 'customers', 'recipes', 'addon_recipes',
  'modifier_recipes', 'product_addons', 'product_modifier_groups', 'products',
  'addons', 'modifiers', 'modifier_groups', 'ingredients', 'categories',
  'users', 'discount_codes', 'delivery_zones', 'expenses', 'settings',
]

export async function seedDatabase() {
  const db = getSqlite()

  // Already on the new catalog → nothing to do
  const hasNew = (db.prepare("SELECT COUNT(*) as c FROM categories WHERE id = 'cat-crepe-savory'").get() as { c: number }).c
  if (hasNew > 0) return

  // Old data present → wipe everything and reseed fresh
  const existing = (db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }).count
  if (existing > 0) {
    db.exec('PRAGMA foreign_keys = OFF')
    for (const t of TABLES_TO_WIPE) db.exec(`DELETE FROM ${t}`)
    db.exec('PRAGMA foreign_keys = ON')
  }

  const now = new Date().toISOString()
  const rand = mulberry32(42)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

  // ─── Settings ────────────────────────────────────────────────
  db.prepare('INSERT INTO settings (id, delivery_fee, tax_rate, restaurant_name, currency) VALUES (?, ?, ?, ?, ?)')
    .run('settings', 25, 0.14, 'كريب هاوس', 'EGP')

  // ─── Delivery zones ──────────────────────────────────────────
  const insertZone = db.prepare('INSERT INTO delivery_zones (id, name, fee, sort_order, active) VALUES (?, ?, ?, ?, 1)')
  insertZone.run('dz-near', 'قريب', 25, 0)
  insertZone.run('dz-mid', 'متوسط', 35, 1)
  insertZone.run('dz-far', 'بعيد', 45, 2)

  // ─── Kitchen stations (print routing — printer picked later) ──
  const insertStation = db.prepare('INSERT INTO kitchen_stations (id, name, printer_name, paper_width, sort_order, active) VALUES (?, ?, NULL, ?, ?, 1)')
  insertStation.run('st-receipt', 'الكاشير (إيصال)', '80mm', 0)
  insertStation.run('st-kitchen-1', 'مطبخ 1', '80mm', 1)
  insertStation.run('st-kitchen-2', 'مطبخ 2', '80mm', 2)

  // ─── Discount codes ──────────────────────────────────────────
  const insertDisc = db.prepare('INSERT INTO discount_codes (id, code, type, value, active, max_uses, used_count) VALUES (?, ?, ?, ?, 1, ?, 0)')
  insertDisc.run('disc-10', 'WELCOME10', 'percentage', 10, 100)
  insertDisc.run('disc-20', 'SAVE20', 'fixed', 20, 50)
  insertDisc.run('disc-5', 'FIVE', 'fixed', 5, 0)

  // ─── Expenses ────────────────────────────────────────────────
  const insertExp = db.prepare('INSERT INTO expenses (id, name, category, amount, type, active) VALUES (?, ?, ?, ?, ?, 1)')
  for (const e of [
    { id: 'exp-salary-1', name: 'رواتب الموظفين', category: 'رواتب', amount: 15000 },
    { id: 'exp-rent', name: 'إيجار المحل', category: 'إيجار', amount: 8000 },
    { id: 'exp-electric', name: 'كهرباء', category: 'مرافق', amount: 2000 },
    { id: 'exp-gas', name: 'غاز', category: 'مرافق', amount: 500 },
    { id: 'exp-water', name: 'مياه', category: 'مرافق', amount: 300 },
    { id: 'exp-internet', name: 'إنترنت', category: 'مرافق', amount: 400 },
    { id: 'exp-maint', name: 'صيانة', category: 'صيانة', amount: 1000 },
  ]) insertExp.run(e.id, e.name, e.category, e.amount, 'monthly')

  // ─── Staff ───────────────────────────────────────────────────
  const adminId = randomUUID()
  db.prepare('INSERT INTO users (id, name, pin_hash, role, active, created_at, hourly_rate, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(adminId, 'أحمد السيد', await argon2.hash('0000'), 'admin', 1, now, 0, 0)
  const cashierA = randomUUID()
  db.prepare('INSERT INTO users (id, name, pin_hash, role, active, created_at, hourly_rate, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(cashierA, 'محمد علي', await argon2.hash('1234'), 'cashier', 1, now, 25, 2)
  const cashierB = randomUUID()
  db.prepare('INSERT INTO users (id, name, pin_hash, role, active, created_at, hourly_rate, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(cashierB, 'مصطفى كريم', await argon2.hash('5678'), 'cashier', 1, now, 25, 2)
  const cashiers = [
    { id: cashierA, name: 'محمد علي' },
    { id: cashierB, name: 'مصطفى كريم' },
  ]

  // ─── Categories ─────────────────────────────────────────────
  const cats = [
    { id: 'cat-crepe-savory', name: 'كريب حادق', emoji: '🥙', color: 'var(--cat-crepe-savory)', sort: 1 },
    { id: 'cat-crepe-sweet', name: 'كريب حلو', emoji: '🍫', color: 'var(--cat-crepe-sweet)', sort: 2 },
    { id: 'cat-pizza', name: 'بيتزا', emoji: '🍕', color: 'var(--cat-pizza)', sort: 3 },
    { id: 'cat-meals', name: 'وجبات', emoji: '🍱', color: 'var(--cat-meals)', sort: 4 },
    { id: 'cat-drinks', name: 'مشروبات', emoji: '🥤', color: 'var(--cat-drinks)', sort: 5 },
  ]
  const insertCat = db.prepare('INSERT INTO categories (id, name, emoji, color, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)')
  for (const c of cats) insertCat.run(c.id, c.name, c.emoji, c.color, c.sort)

  // ─── Products ───────────────────────────────────────────────
  const prods = [
    // Savory crepes
    { id: 'cr1', name: 'كريب فراخ بانيه', price: 70, cost: 30, rollback: 1, cat: 'cat-crepe-savory', emoji: '🍗', desc: 'فراخ بانيه، خضار، موزاريلا' },
    { id: 'cr2', name: 'كريب شاورما دجاج', price: 70, cost: 30, rollback: 1, cat: 'cat-crepe-savory', emoji: '🌯', desc: 'شاورما دجاج، خضار، موزاريلا' },
    { id: 'cr3', name: 'كريب زنجر', price: 75, cost: 32, rollback: 1, cat: 'cat-crepe-savory', emoji: '🌶️', desc: 'دجاج زنجر حار، خس، صوص رانش' },
    { id: 'cr4', name: 'كريب ميكس جبن', price: 55, cost: 22, rollback: 1, cat: 'cat-crepe-savory', emoji: '🧀', desc: 'موزاريلا، رومي، شيدر، خضار' },
    { id: 'cr5', name: 'كريب بطاطس', price: 40, cost: 14, rollback: 1, cat: 'cat-crepe-savory', emoji: '🍟', desc: 'بطاطس محمرة، موزاريلا، كاتشب' },
    { id: 'cr6', name: 'كريب سوسيس', price: 55, cost: 22, rollback: 1, cat: 'cat-crepe-savory', emoji: '🌭', desc: 'سوسيس، خضار، موزاريلا' },
    { id: 'cr7', name: 'كريب كفتة', price: 65, cost: 28, rollback: 1, cat: 'cat-crepe-savory', emoji: '🥩', desc: 'كفتة مشوية، موزاريلا، خضار' },
    { id: 'cr8', name: 'كريب شيش طاووق', price: 70, cost: 30, rollback: 1, cat: 'cat-crepe-savory', emoji: '🍢', desc: 'شيش طاووق، موزاريلا، صوص شيدر' },
    { id: 'cr9', name: 'كريب سوبر كرانشي', price: 78, cost: 34, rollback: 1, cat: 'cat-crepe-savory', emoji: '🍗', desc: 'قطع كرانشي، موزاريلا، خضار' },
    { id: 'cr10', name: 'كريب الوحش', price: 100, cost: 45, rollback: 1, cat: 'cat-crepe-savory', emoji: '👹', desc: 'بانيه، كريسبي، كفتة، بطاطس' },
    // Sweet crepes
    { id: 'sw1', name: 'كريب نوتيلا', price: 40, cost: 15, rollback: 0, cat: 'cat-crepe-sweet', emoji: '🍫', desc: 'نوتيلا' },
    { id: 'sw2', name: 'كريب نوتيلا موز', price: 50, cost: 19, rollback: 0, cat: 'cat-crepe-sweet', emoji: '🍌', desc: 'نوتيلا، موز' },
    { id: 'sw3', name: 'كريب ماستر سويت', price: 62, cost: 25, rollback: 0, cat: 'cat-crepe-sweet', emoji: '🍩', desc: 'نوتيلا، موز، مكسرات، أوريو' },
    // Pizza
    { id: 'p1', name: 'مارغريتا', price: 120, cost: 45, rollback: 1, cat: 'cat-pizza', emoji: '🍕', desc: 'طماطم، موزاريلا، ريحان' },
    { id: 'p2', name: 'بيبروني', price: 145, cost: 55, rollback: 1, cat: 'cat-pizza', emoji: '🌶️', desc: 'بيبروني، موزاريلا' },
    { id: 'p3', name: 'دجاج باربكيو', price: 155, cost: 60, rollback: 1, cat: 'cat-pizza', emoji: '🍗', desc: 'دجاج، صوص باربكيو، بصل' },
    { id: 'p4', name: 'خضار', price: 130, cost: 42, rollback: 1, cat: 'cat-pizza', emoji: '🥬', desc: 'خضار مشكلة، زيتون، فيتا' },
    // Meals
    { id: 'm1', name: 'وجبة كوردون بلو', price: 115, cost: 50, rollback: 1, cat: 'cat-meals', emoji: '🍱', desc: 'كوردون بلو، بطاطس، كول سلو، عيش' },
    { id: 'm2', name: 'وجبة زنجر', price: 100, cost: 42, rollback: 1, cat: 'cat-meals', emoji: '🍗', desc: 'زنجر، بطاطس، كول سلو، عيش' },
    { id: 'm3', name: 'وجبة شيش طاووق', price: 100, cost: 42, rollback: 1, cat: 'cat-meals', emoji: '🍢', desc: 'شيش طاووق، بطاطس، ثومية، عيش' },
    { id: 'm4', name: 'وجبة ناجتس', price: 85, cost: 34, rollback: 1, cat: 'cat-meals', emoji: '🧆', desc: 'ناجتس 9 قطع، بطاطس، كول سلو' },
    // Drinks
    { id: 'd1', name: 'كولا', price: 20, cost: 8, rollback: 0, cat: 'cat-drinks', emoji: '🥤', desc: 'كولا باردة' },
    { id: 'd2', name: 'ليمونادة', price: 25, cost: 10, rollback: 0, cat: 'cat-drinks', emoji: '🍋', desc: 'ليمون طازج' },
    { id: 'd3', name: 'ميلك شيك', price: 50, cost: 20, rollback: 0, cat: 'cat-drinks', emoji: '🥛', desc: 'فانيليا أو شوكولاتة' },
    { id: 'd4', name: 'شاي مثلج', price: 20, cost: 6, rollback: 0, cat: 'cat-drinks', emoji: '🍵', desc: 'محلى أو بدون سكر' },
    { id: 'd5', name: 'عصير مانجو', price: 35, cost: 14, rollback: 0, cat: 'cat-drinks', emoji: '🥭', desc: 'مانجو طبيعي' },
    { id: 'd6', name: 'عصير فراولة', price: 35, cost: 14, rollback: 0, cat: 'cat-drinks', emoji: '🍓', desc: 'فراولة طبيعية' },
  ]
  const insertProd = db.prepare('INSERT INTO products (id, name, price, cost_price, supports_rollback, category_id, emoji, description, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
  for (const p of prods) insertProd.run(p.id, p.name, p.price, p.cost, p.rollback, p.cat, p.emoji, p.desc)
  const prodById = new Map(prods.map(p => [p.id, p]))

  // ─── Addons ─────────────────────────────────────────────────
  const addonData = [
    { id: 'addon-cheese', name: 'جبنة إضافية', price: 7, emoji: '🧀', rollback: 1 },
    { id: 'addon-mozz', name: 'موزاريلا', price: 10, emoji: '🧀', rollback: 1 },
    { id: 'addon-sauce', name: 'صلصة خاصة', price: 5, emoji: '🫙', rollback: 1 },
    { id: 'addon-garlic', name: 'ثومية', price: 10, emoji: '🧄', rollback: 1 },
    { id: 'addon-ketchup', name: 'كاتشب', price: 5, emoji: '🍅', rollback: 1 },
    { id: 'addon-fries', name: 'بطاطس زيادة', price: 12, emoji: '🍟', rollback: 1 },
    { id: 'addon-drink', name: 'مشروب كبير', price: 10, emoji: '🥤', rollback: 0 },
    { id: 'addon-coleslaw', name: 'كول سلو', price: 8, emoji: '🥗', rollback: 1 },
    { id: 'addon-pickle', name: 'مخلل', price: 5, emoji: '🥒', rollback: 1 },
  ]
  const insertAddon = db.prepare('INSERT INTO addons (id, name, price, emoji, supports_rollback, active) VALUES (?, ?, ?, ?, ?, 1)')
  for (const a of addonData) insertAddon.run(a.id, a.name, a.price, a.emoji, a.rollback)
  const addonById = new Map(addonData.map(a => [a.id, a]))

  // ─── Modifier groups + modifiers ────────────────────────────
  const groupSizeId = 'modgrp-size'
  const groupSauceId = 'modgrp-sauce'
  const insertGroup = db.prepare('INSERT INTO modifier_groups (id, name, type, sort_order, active) VALUES (?, ?, ?, ?, 1)')
  insertGroup.run(groupSizeId, 'الحجم', 'single-select', 1)
  insertGroup.run(groupSauceId, 'الصوص', 'multi-select', 2)

  const mods = [
    { id: 'mod-size-regular', grp: groupSizeId, name: 'عادي', adj: 0, sort: 1 },
    { id: 'mod-size-large', grp: groupSizeId, name: 'كبير', adj: 20, sort: 2 },
    { id: 'mod-size-xl', grp: groupSizeId, name: 'دبل', adj: 35, sort: 3 },
    { id: 'mod-sauce-ketchup', grp: groupSauceId, name: 'كاتشب', adj: 0, sort: 1 },
    { id: 'mod-sauce-mayo', grp: groupSauceId, name: 'مايونيز', adj: 0, sort: 2 },
    { id: 'mod-sauce-garlic', grp: groupSauceId, name: 'ثومية', adj: 5, sort: 3 },
    { id: 'mod-sauce-ranch', grp: groupSauceId, name: 'رانش', adj: 5, sort: 4 },
    { id: 'mod-sauce-bbq', grp: groupSauceId, name: 'باربكيو', adj: 0, sort: 5 },
    { id: 'mod-sauce-spicy', grp: groupSauceId, name: 'حار', adj: 5, sort: 6 },
  ]
  const insertMod = db.prepare('INSERT INTO modifiers (id, modifier_group_id, name, price_adjustment, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)')
  for (const m of mods) insertMod.run(m.id, m.grp, m.name, m.adj, m.sort)
  const modById = new Map(mods.map(m => [m.id, m]))

  const savoryIds = ['cr1', 'cr2', 'cr3', 'cr4', 'cr5', 'cr6', 'cr7', 'cr8', 'cr9', 'cr10']
  const pizzaIds = ['p1', 'p2', 'p3', 'p4']
  const mealIds = ['m1', 'm2', 'm3', 'm4']
  const insertPMG = db.prepare('INSERT INTO product_modifier_groups (product_id, modifier_group_id) VALUES (?, ?)')
  for (const pid of [...savoryIds, ...pizzaIds]) insertPMG.run(pid, groupSizeId)
  for (const pid of [...savoryIds, ...mealIds]) insertPMG.run(pid, groupSauceId)

  // ─── Ingredients ────────────────────────────────────────────
  const ingredientsData = [
    { id: 'ing-flour', name: 'دقيق', unit: 'g', stock: 50000, min: 5000, cost: 0.03 },
    { id: 'ing-eggs', name: 'بيض', unit: 'pcs', stock: 600, min: 60, cost: 4 },
    { id: 'ing-milk', name: 'لبن', unit: 'ml', stock: 20000, min: 2000, cost: 0.03 },
    { id: 'ing-bread', name: 'عيش', unit: 'pcs', stock: 400, min: 40, cost: 3 },
    { id: 'ing-dough', name: 'عجينة بيتزا', unit: 'pcs', stock: 200, min: 20, cost: 8 },
    { id: 'ing-chicken-breast', name: 'صدر دجاج', unit: 'g', stock: 25000, min: 2500, cost: 0.15 },
    { id: 'ing-kofta', name: 'كفتة', unit: 'g', stock: 8000, min: 800, cost: 0.18 },
    { id: 'ing-sausage', name: 'سوسيس', unit: 'g', stock: 6000, min: 600, cost: 0.15 },
    { id: 'ing-cheese', name: 'جبنة', unit: 'g', stock: 12000, min: 1200, cost: 0.1 },
    { id: 'ing-mozz', name: 'موزاريلا', unit: 'g', stock: 15000, min: 1500, cost: 0.12 },
    { id: 'ing-lettuce', name: 'خس', unit: 'g', stock: 6000, min: 600, cost: 0.05 },
    { id: 'ing-tomato', name: 'طماطم', unit: 'g', stock: 8000, min: 800, cost: 0.04 },
    { id: 'ing-potato', name: 'بطاطس', unit: 'g', stock: 30000, min: 3000, cost: 0.03 },
    { id: 'ing-onion', name: 'بصل', unit: 'g', stock: 5000, min: 500, cost: 0.02 },
    { id: 'ing-pickle', name: 'مخلل', unit: 'g', stock: 4000, min: 400, cost: 0.03 },
    { id: 'ing-cola', name: 'كولا', unit: 'ml', stock: 30000, min: 3000, cost: 0.01 },
    { id: 'ing-nutella', name: 'نوتيلا', unit: 'g', stock: 8000, min: 800, cost: 0.4 },
    { id: 'ing-banana', name: 'موز', unit: 'g', stock: 5000, min: 500, cost: 0.05 },
    { id: 'ing-nuts', name: 'مكسرات', unit: 'g', stock: 2000, min: 200, cost: 0.8 },
    { id: 'ing-sauce-ketchup', name: 'كاتشب', unit: 'ml', stock: 8000, min: 800, cost: 0.04 },
    { id: 'ing-sauce-mayo', name: 'مايونيز', unit: 'ml', stock: 8000, min: 800, cost: 0.05 },
    { id: 'ing-sauce-garlic', name: 'صوص ثومية', unit: 'ml', stock: 8000, min: 800, cost: 0.05 },
    { id: 'ing-sauce-ranch', name: 'صوص رانش', unit: 'ml', stock: 6000, min: 600, cost: 0.07 },
    { id: 'ing-sauce-bbq', name: 'صوص باربكيو', unit: 'ml', stock: 8000, min: 800, cost: 0.05 },
    { id: 'ing-sauce-spicy', name: 'صوص حار', unit: 'ml', stock: 6000, min: 600, cost: 0.06 },
    { id: 'ing-lemon', name: 'ليمون', unit: 'g', stock: 4000, min: 400, cost: 0.05 },
    { id: 'ing-mango', name: 'مانجو', unit: 'g', stock: 6000, min: 600, cost: 0.12 },
    { id: 'ing-strawberry', name: 'فراولة', unit: 'g', stock: 4000, min: 400, cost: 0.15 },
    { id: 'ing-tea', name: 'شاي', unit: 'g', stock: 1000, min: 100, cost: 0.2 },
    { id: 'ing-pepperoni', name: 'بيبروني', unit: 'g', stock: 3000, min: 300, cost: 0.3 },
  ]
  const insertIng = db.prepare('INSERT INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, active) VALUES (?, ?, ?, ?, ?, ?, 1)')
  for (const i of ingredientsData) insertIng.run(i.id, i.name, i.unit, i.stock, i.min, i.cost)

  // ─── Product recipes ────────────────────────────────────────
  const CREPE_BASE = [['ing-flour', 80], ['ing-milk', 80], ['ing-eggs', 1]] as [string, number][]
  const recipesData: [string, string, string, number][] = []
  let recN = 1
  const addRecipe = (pid: string, iid: string, qty: number) => recipesData.push([`rec-${recN++}`, pid, iid, qty])
  const crepeFillings: Record<string, [string, number][]> = {
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
  }
  for (const pid of [...savoryIds, 'sw1', 'sw2', 'sw3']) {
    for (const [iid, qty] of CREPE_BASE) addRecipe(pid, iid, qty)
    for (const [iid, qty] of crepeFillings[pid]) addRecipe(pid, iid, qty)
  }
  const pizzaFillings: Record<string, [string, number][]> = {
    p1: [['ing-dough', 1], ['ing-mozz', 80], ['ing-tomato', 60]],
    p2: [['ing-dough', 1], ['ing-mozz', 80], ['ing-tomato', 60], ['ing-pepperoni', 50]],
    p3: [['ing-dough', 1], ['ing-mozz', 80], ['ing-chicken-breast', 100], ['ing-sauce-bbq', 20]],
    p4: [['ing-dough', 1], ['ing-mozz', 60], ['ing-tomato', 40], ['ing-lettuce', 30], ['ing-onion', 30]],
  }
  for (const pid of pizzaIds) for (const [iid, qty] of pizzaFillings[pid]) addRecipe(pid, iid, qty)
  const mealFillings: Record<string, [string, number][]> = {
    m1: [['ing-chicken-breast', 150], ['ing-mozz', 30], ['ing-potato', 150], ['ing-bread', 1]],
    m2: [['ing-chicken-breast', 150], ['ing-potato', 150], ['ing-lettuce', 30], ['ing-bread', 1]],
    m3: [['ing-chicken-breast', 150], ['ing-potato', 150], ['ing-bread', 1], ['ing-sauce-garlic', 15]],
    m4: [['ing-chicken-breast', 120], ['ing-potato', 150], ['ing-lettuce', 20]],
  }
  for (const pid of mealIds) for (const [iid, qty] of mealFillings[pid]) addRecipe(pid, iid, qty)
  addRecipe('d1', 'ing-cola', 330)
  addRecipe('d2', 'ing-lemon', 80)
  addRecipe('d3', 'ing-milk', 250)
  addRecipe('d4', 'ing-tea', 5)
  addRecipe('d5', 'ing-mango', 150)
  addRecipe('d6', 'ing-strawberry', 150)
  const insertRecipe = db.prepare('INSERT INTO recipes (id, product_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)')
  for (const r of recipesData) insertRecipe.run(r[0], r[1], r[2], r[3])
  const recipesByProduct = new Map<string, [string, number][]>()
  for (const [, pid, iid, qty] of recipesData) {
    if (!recipesByProduct.has(pid)) recipesByProduct.set(pid, [])
    recipesByProduct.get(pid)!.push([iid, qty])
  }

  // ─── Addon recipes ──────────────────────────────────────────
  const addonRecipesData: [string, string, string, number][] = [
    ['ar1', 'addon-cheese', 'ing-cheese', 20],
    ['ar2', 'addon-mozz', 'ing-mozz', 25],
    ['ar3', 'addon-sauce', 'ing-sauce-bbq', 15],
    ['ar4', 'addon-garlic', 'ing-sauce-garlic', 15],
    ['ar5', 'addon-ketchup', 'ing-sauce-ketchup', 15],
    ['ar6', 'addon-fries', 'ing-potato', 100],
    ['ar7', 'addon-drink', 'ing-cola', 200],
    ['ar8', 'addon-coleslaw', 'ing-lettuce', 50],
    ['ar9', 'addon-pickle', 'ing-pickle', 20],
  ]
  const insertAddonRecipe = db.prepare('INSERT INTO addon_recipes (id, addon_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)')
  for (const r of addonRecipesData) insertAddonRecipe.run(r[0], r[1], r[2], r[3])
  const addonRecipeById = new Map(addonRecipesData.map(r => [r[1], [[r[2], r[3]]] as [string, number][]]))

  // ─── Modifier recipes ───────────────────────────────────────
  const modRecipesData: [string, string, string, number][] = [
    ['mr1', 'mod-size-large', 'ing-flour', 40],
    ['mr2', 'mod-size-large', 'ing-milk', 40],
    ['mr3', 'mod-size-large', 'ing-eggs', 0.5],
    ['mr4', 'mod-size-xl', 'ing-flour', 80],
    ['mr5', 'mod-size-xl', 'ing-milk', 80],
    ['mr6', 'mod-size-xl', 'ing-eggs', 1],
    ['mr7', 'mod-size-xl', 'ing-mozz', 20],
    ['mr8', 'mod-sauce-ketchup', 'ing-sauce-ketchup', 15],
    ['mr9', 'mod-sauce-mayo', 'ing-sauce-mayo', 15],
    ['mr10', 'mod-sauce-garlic', 'ing-sauce-garlic', 15],
    ['mr11', 'mod-sauce-ranch', 'ing-sauce-ranch', 15],
    ['mr12', 'mod-sauce-bbq', 'ing-sauce-bbq', 15],
    ['mr13', 'mod-sauce-spicy', 'ing-sauce-spicy', 15],
  ]
  const insertModRecipe = db.prepare('INSERT INTO modifier_recipes (id, modifier_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)')
  for (const r of modRecipesData) insertModRecipe.run(r[0], r[1], r[2], r[3])
  const modRecipeById = new Map<string, [string, number][]>()
  for (const [, mid, iid, qty] of modRecipesData) {
    if (!modRecipeById.has(mid)) modRecipeById.set(mid, [])
    modRecipeById.get(mid)!.push([iid, qty])
  }

  // ─── Link addons to products ───
  const insertPA = db.prepare('INSERT INTO product_addons (product_id, addon_id) VALUES (?, ?)')
  const savoryAddons = ['addon-cheese', 'addon-mozz', 'addon-sauce', 'addon-garlic', 'addon-ketchup', 'addon-fries', 'addon-drink', 'addon-coleslaw', 'addon-pickle']
  for (const pid of savoryIds) for (const aid of savoryAddons) insertPA.run(pid, aid)
  for (const pid of ['sw1', 'sw2', 'sw3']) insertPA.run(pid, 'addon-drink')
  for (const pid of pizzaIds) for (const aid of ['addon-cheese', 'addon-mozz', 'addon-sauce', 'addon-garlic', 'addon-drink', 'addon-coleslaw']) insertPA.run(pid, aid)
  for (const pid of mealIds) for (const aid of ['addon-sauce', 'addon-garlic', 'addon-ketchup', 'addon-fries', 'addon-drink', 'addon-coleslaw', 'addon-pickle']) insertPA.run(pid, aid)

  // ─── Customers pool ─────────────────────────────────────────
  const customerPool = [
    { name: 'أحمد محمد', phone: '01012345678', addr: 'شارع فيصل، الجيزة' },
    { name: 'محمد إبراهيم', phone: '01123456789', addr: 'شارع الهرم، الجيزة' },
    { name: 'مصطفى حسن', phone: '01234567890', addr: 'عباس العقاد، مدينة نصر' },
    { name: 'كريم عادل', phone: '01512345678', addr: 'شارع 9، المعادي' },
    { name: 'عمر فاروق', phone: '01098765432', addr: 'جامعة الدول، المهندسين' },
    { name: 'يوسف سامي', phone: '01187654321', addr: 'طلعت حرب، وسط البلد' },
    { name: 'محمود عبد الله', phone: '01276543210', addr: 'الخلفاوي، شبرا' },
    { name: 'حسن علي', phone: '01587654321', addr: 'روكسي، مصر الجديدة' },
    { name: 'إبراهيم سيد', phone: '01055556666', addr: 'حدائق القبة' },
    { name: 'علي محمود', phone: '01144445555', addr: 'عين شمس' },
    { name: 'سامح رضا', phone: '01233334444', addr: 'المطرية' },
    { name: 'وليد ناصر', phone: '01522223333', addr: 'إمبابة' },
    { name: 'هاني فؤاد', phone: '01011112222', addr: 'بولاق الدكرور' },
    { name: 'تامر عادل', phone: '01199998888', addr: 'البحر الأعظم، الجيزة' },
    { name: 'شريف كمال', phone: '01277776666', addr: 'فيصل، الطوابق' },
    { name: 'رامي سعيد', phone: '01566665555', addr: 'الهرم، مشعل' },
    { name: 'مينا جرجس', phone: '01088889999', addr: 'شبرا مصر' },
    { name: 'فاطمة أحمد', phone: '01122223333', addr: 'مدينة نصر، مصطفى النحاس' },
    { name: 'منى حسن', phone: '01211110000', addr: 'المعادي الجديدة' },
    { name: 'سارة محمد', phone: '01500001111', addr: 'المهندسين، شهاب' },
    { name: 'نورهان علي', phone: '01033334444', addr: 'الدقي' },
    { name: 'مريم سامح', phone: '01155557777', addr: 'الزمالك' },
    { name: 'هدى كريم', phone: '01266668888', addr: 'مصر الجديدة، الكوربة' },
    { name: 'دينا فاروق', phone: '01577779999', addr: 'التجمع الخامس' },
    { name: 'إسراء محمود', phone: '01044443333', addr: 'حلوان' },
    { name: 'خالد مصطفى', phone: '01166667777', addr: '6 أكتوبر، الحصري' },
    { name: 'سيد عبد الرحمن', phone: '01288889999', addr: 'الشيخ زايد' },
    { name: 'سعيد مرزوق', phone: '01533332222', addr: 'المرج' },
    { name: 'حامد الشيخ', phone: '01077776666', addr: 'عزبة النخل' },
    { name: 'آية حسن', phone: '01100009999', addr: 'جسر السويس' },
  ]
  const insertCust = db.prepare('INSERT INTO customers (id, phone, name, address, order_count, last_order_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const custStats = new Map<string, { count: number; last: string }>()

  // ─── A month of shifts + orders ─────────────────────────────
  const insertShift = db.prepare('INSERT INTO shifts (id, number, user_id, started_at, ended_at, opening_cash, closing_cash, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const insertOrder = db.prepare(`INSERT INTO orders (id, status, order_type, table_number, customer_name, customer_phone, customer_address,
    delivery_address, delivery_phone, subtotal, tax, delivery_fee, delivery_zone_id, delivery_zone_name, delivery_note, discount_code, discount_amount, total,
    payment_type, cashier_name, status_reason, refunded_amount, user_id, shift_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const ZONE_FEES = [
    { id: 'dz-near', name: 'قريب', fee: 25 },
    { id: 'dz-mid', name: 'متوسط', fee: 35 },
    { id: 'dz-far', name: 'بعيد', fee: 45 },
  ]
  const DELIVERY_NOTES = ['الاتصال قبل الوصول', 'الدور الثالث — بدون أسانسير', 'البوابة الخلفية', 'مستعجل لو سمحت']
  const insertItem = db.prepare('INSERT INTO order_items (id, product_id, order_id, quantity, unit_price, item_discount, selected_modifiers_json, selected_addons_json) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
  const insertPay = db.prepare('INSERT INTO payments (id, order_id, method, amount, created_at) VALUES (?, ?, ?, ?, ?)')
  const insertMov = db.prepare('INSERT INTO cash_movements (id, shift_id, type, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
  const insertTxn = db.prepare('INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, reference_order_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')

  const prodIds = prods.map(p => p.id)
  const weights: Record<string, number> = {
    cr1: 5, cr2: 4, cr3: 4, cr4: 3, cr5: 3, cr6: 3, cr7: 2, cr8: 3, cr9: 4, cr10: 3,
    sw1: 3, sw2: 3, sw3: 2, p1: 2, p2: 3, p3: 2, p4: 1,
    m1: 2, m2: 3, m3: 2, m4: 2, d1: 4, d2: 2, d3: 2, d4: 1, d5: 2, d6: 2,
  }
  const weightedBag: string[] = []
  for (const pid of prodIds) for (let k = 0; k < (weights[pid] || 1); k++) weightedBag.push(pid)

  const sauceMods = ['mod-sauce-ketchup', 'mod-sauce-mayo', 'mod-sauce-garlic', 'mod-sauce-ranch', 'mod-sauce-bbq', 'mod-sauce-spicy']
  const CANCEL_REASONS = ['العميل طلب الإلغاء', 'خطأ في إدخال الطلب', 'تأخير التوصيل', 'مشكلة في جودة الطعام', 'العميل لم يستلم']
  const DISC_POOL = [
    { code: 'WELCOME10', type: 'percentage', value: 10 },
    { code: 'SAVE20', type: 'fixed', value: 20 },
    { code: 'FIVE', type: 'fixed', value: 5 },
  ]
  const discUse = new Map<string, number>()

  const consume = (iid: string, qty: number, orderId: string, ts: string, label: string) => {
    insertTxn.run(randomUUID(), iid, 'CONSUMPTION', -qty, orderId, label, ts)
  }

  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const dayStart = midnight.getTime() - 29 * 86400000
  const tsOf = (day: number, h: number, m: number) => new Date(dayStart + day * 86400000 + h * 3600000 + m * 60000).toISOString()

  let orderSeq = 100001
  let shiftNum = 0
  const todayStr = new Date().toISOString().slice(0, 10)

  for (let day = 0; day < 30; day++) {
    for (let s = 0; s < 2; s++) {
      const cashier = cashiers[(day + s) % 2]
      const startH = s === 0 ? 11 : 19
      const endH = s === 0 ? 19 : 26
      const startTs = tsOf(day, startH, int(0, 20))
      const isLastShift = day === 29 && s === 1
      const endTs = isLastShift ? null : tsOf(day, Math.min(endH, 23), int(0, 50))
      const openingCash = int(8, 15) * 100
      const shiftId = randomUUID()
      shiftNum++

      const orderCount = int(8, 15)
      let expected = openingCash
      const saleRows: { id: string; total: number; ts: string }[] = []

      for (let n = 0; n < orderCount; n++) {
        const oh = int(startH, Math.min(endH, 23))
        const ots = tsOf(day, oh, int(0, 59))
        const isDelivery = rand() < 0.45
        const payCash = rand() < 0.7
        const statusRoll = rand()
        const status = statusRoll < 0.04 ? 'CANCELLED' : statusRoll < 0.07 ? 'REFUNDED' : 'COMPLETED'

        // 1–3 items
        const itemN = rand() < 0.55 ? 1 : rand() < 0.85 ? 2 : 3
        const chosen: string[] = []
        for (let k = 0; k < itemN; k++) chosen.push(pick(weightedBag))

        let subtotal = 0
        const orderId = `#${orderSeq++}`
        const itemRows: { pid: string; qty: number; unit: number; mods: any[]; addonIds: string[] }[] = []

        for (const pid of chosen) {
          const prod = prodById.get(pid)!
          const qty = rand() < 0.8 ? 1 : 2
          const mods: any[] = []
          let unit = prod.price
          if ([...savoryIds, ...pizzaIds].includes(pid) && rand() < 0.6) {
            const sz = rand() < 0.45 ? 'mod-size-regular' : rand() < 0.7 ? 'mod-size-large' : 'mod-size-xl'
            const m = modById.get(sz)!
            mods.push({ groupId: groupSizeId, groupName: 'الحجم', modifierId: m.id, modifierName: m.name, priceAdjustment: m.adj })
            unit += m.adj
          }
          if ([...savoryIds, ...mealIds].includes(pid) && rand() < 0.5) {
            const picks = new Set<string>()
            const cnt = rand() < 0.7 ? 1 : 2
            while (picks.size < cnt) picks.add(pick(sauceMods))
            for (const sid of picks) {
              const m = modById.get(sid)!
              mods.push({ groupId: groupSauceId, groupName: 'الصوص', modifierId: m.id, modifierName: m.name, priceAdjustment: m.adj })
              unit += m.adj
            }
          }
          const addonIds: string[] = []
          if (rand() < 0.3) {
            const pool = pid.startsWith('sw') ? ['addon-drink'] : ['addon-cheese', 'addon-mozz', 'addon-garlic', 'addon-fries', 'addon-coleslaw']
            const aid = pick(pool)
            const times = rand() < 0.85 ? 1 : 2
            for (let t = 0; t < times; t++) addonIds.push(aid)
            const ad = addonById.get(aid)!
            unit += ad.price * times
          }
          subtotal += unit * qty
          itemRows.push({ pid, qty, unit, mods, addonIds })

          // Inventory consumption
          for (const [iid, q] of recipesByProduct.get(pid) || []) consume(iid, q * qty, orderId, ots, `استهلاك منتج — طلب ${orderId}`)
          const seenAddons = new Set(addonIds)
          for (const aid of seenAddons) {
            const times = addonIds.filter(x => x === aid).length
            for (const [iid, q] of addonRecipeById.get(aid) || []) consume(iid, q * times * qty, orderId, ots, `استهلاك إضافة — طلب ${orderId}`)
          }
          for (const m of mods) {
            for (const [iid, q] of modRecipeById.get(m.modifierId) || []) consume(iid, q * qty, orderId, ots, `استهلاك موديفاير — طلب ${orderId}`)
          }
        }

        const tax = Math.round(subtotal * 0.14)
        const zone = isDelivery ? pick(ZONE_FEES) : null
        const deliveryFee = zone ? zone.fee : 0
        const deliveryNote = isDelivery && rand() < 0.3 ? pick(DELIVERY_NOTES) : null
        let discountCode: string | null = null
        let discountAmount = 0
        if (status === 'COMPLETED' && rand() < 0.15) {
          const d = pick(DISC_POOL)
          discountCode = d.code
          discountAmount = d.type === 'percentage' ? Math.round(subtotal * d.value / 100) : Math.min(d.value, subtotal)
          discUse.set(d.code, (discUse.get(d.code) || 0) + 1)
        }
        const total = subtotal + tax + deliveryFee - discountAmount

        let customer = null
        if (isDelivery) {
          customer = Math.floor(rand() * customerPool.length) < 24 ? pick(customerPool) : pick(customerPool)
          const st = custStats.get(customer.phone) || { count: 0, last: ots }
          custStats.set(customer.phone, { count: st.count + 1, last: ots })
        }

        let statusReason: string | null = null
        let refundedAmount = 0
        if (status === 'CANCELLED') {
          statusReason = pick(CANCEL_REASONS)
        } else if (status === 'REFUNDED') {
          statusReason = pick(CANCEL_REASONS)
          refundedAmount = Math.round(total * (0.5 + rand() * 0.5))
        }

        const tableNumber = !isDelivery && rand() < 0.6 ? String(int(1, 12)) : null
        insertOrder.run(orderId, status, isDelivery ? 'delivery' : 'dine-in', tableNumber,
          customer?.name || null, customer?.phone || null, customer?.addr || null,
          customer?.addr || null, customer?.phone || null,
          subtotal, tax, deliveryFee, zone?.id || null, zone?.name || null, deliveryNote,
          discountCode, discountAmount, total,
          payCash ? 'cash' : 'visa', cashier.name, statusReason, refundedAmount,
          cashier.id, shiftId, ots, ots)

        for (const r of itemRows) {
          insertItem.run(randomUUID(), r.pid, orderId, r.qty, r.unit,
            r.mods.length ? JSON.stringify(r.mods) : null,
            r.addonIds.length ? JSON.stringify(r.addonIds) : null)
        }
        insertPay.run(randomUUID(), orderId, payCash ? 'cash' : 'card', total, ots)

        if (status === 'COMPLETED' && payCash) {
          saleRows.push({ id: orderId, total, ts: ots })
          expected += total
        }
      }

      // Cash movements for the shift
      insertMov.run(randomUUID(), shiftId, 'OPENING', openingCash, 'رصيد افتتاحي', startTs)
      for (const sRow of saleRows) insertMov.run(randomUUID(), shiftId, 'SALE', sRow.total, `طلب ${sRow.id}`, sRow.ts)

      // Refunds need order context — re-derive: handled inline above is complex,
      // so record refunds by scanning inserted orders of this shift
      const shiftOrders = db.prepare('SELECT * FROM orders WHERE shift_id = ?').all(shiftId) as any[]
      for (const o of shiftOrders) {
        if ((o.status === 'CANCELLED' || o.status === 'REFUNDED') && o.payment_type === 'cash') {
          const amt = o.status === 'CANCELLED' ? o.total : o.refunded_amount
          if (amt > 0) {
            insertMov.run(randomUUID(), shiftId, 'REFUND', amt, `${o.status === 'CANCELLED' ? 'إلغاء' : 'استرداد'} طلب ${o.id} — ${o.status_reason || ''}`, o.created_at)
            expected -= amt
          }
        }
      }

      if (isLastShift) {
        insertShift.run(shiftId, shiftNum, cashier.id, startTs, null, openingCash, null, 'open')
      } else {
        const noise = int(-40, 25)
        const closingCash = Math.max(0, Math.round(expected + noise))
        insertShift.run(shiftId, shiftNum, cashier.id, startTs, endTs, openingCash, closingCash, 'closed')
        insertMov.run(randomUUID(), shiftId, 'CLOSING', closingCash, 'إغلاق الوردية', endTs)
      }
    }
    void todayStr
  }

  // Persist customers
  for (const c of customerPool) {
    const st = custStats.get(c.phone)
    if (!st) continue
    insertCust.run(randomUUID(), c.phone, c.name, c.addr, st.count, st.last, st.last)
  }

  // Discount usage counts
  for (const [code, n] of discUse) {
    db.prepare('UPDATE discount_codes SET used_count = ? WHERE code = ?').run(n, code)
  }

  // Weekly purchases for core ingredients
  const insertPurch = db.prepare('INSERT INTO purchase_price_history (id, ingredient_id, supplier, unit_cost, quantity, purchased_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const corePurchases: [string, string, number, number][] = [
    ['ing-flour', 'مطحن الدقي', 0.028, 20000], ['ing-chicken-breast', 'دواجن البركة', 0.145, 10000],
    ['ing-mozz', 'ألبان الريف', 0.115, 5000], ['ing-potato', 'سوق العبور', 0.028, 15000],
    ['ing-cola', 'شركة المشروبات', 0.01, 20000], ['ing-milk', 'ألبان الريف', 0.028, 8000],
    ['ing-eggs', 'مزرعة النور', 3.8, 300], ['ing-nutella', 'مستورد', 0.38, 3000],
  ]
  for (let w = 0; w < 4; w++) {
    const pday = tsOf(Math.min(29, w * 7 + 3), 9, 0)
    for (const [iid, sup, cost, qty] of corePurchases) {
      insertPurch.run(randomUUID(), iid, sup, cost, qty, pday.slice(0, 10), pday)
      insertTxn.run(randomUUID(), iid, 'PURCHASE', qty, null, `شراء أسبوعي — ${sup}`, pday)
    }
  }
}
