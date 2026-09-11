import { getSqlite } from './client'
import { randomUUID } from 'crypto'
import argon2 from 'argon2'

export async function seedDatabase() {
  const db = getSqlite()

  // Check if already seeded
  const existing = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number }
  if (existing.count > 0) {
    db.close()
    return
  }

  const now = new Date().toISOString()

  // ─── Default admin user ─────────────────────────────────────
  const adminId = randomUUID()
  const adminPinHash = await argon2.hash('0000') // default PIN
  db.prepare('INSERT INTO users (id, name, pin_hash, role, active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(adminId, 'مدير', adminPinHash, 'admin', 1, now)

  // ─── Categories ─────────────────────────────────────────────
  const cats = [
    { id: 'cat-burgers', name: 'برجر', emoji: '🍔', color: 'var(--cat-burgers)', sort: 1 },
    { id: 'cat-pizza', name: 'بيتزا', emoji: '🍕', color: 'var(--cat-pizza)', sort: 2 },
    { id: 'cat-chicken', name: 'دجاج', emoji: '🍗', color: 'var(--cat-chicken)', sort: 3 },
    { id: 'cat-sides', name: 'أطباق جانبية', emoji: '🍟', color: 'var(--cat-sides)', sort: 4 },
    { id: 'cat-drinks', name: 'مشروبات', emoji: '🥤', color: 'var(--cat-drinks)', sort: 5 },
    { id: 'cat-desserts', name: 'حلويات', emoji: '🍦', color: 'var(--cat-desserts)', sort: 6 },
  ]
  const insertCat = db.prepare('INSERT INTO categories (id, name, emoji, color, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)')
  for (const c of cats) insertCat.run(c.id, c.name, c.emoji, c.color, c.sort)

  // ─── Products ───────────────────────────────────────────────
  const prods = [
    { id: 'b1', name: 'برجر كلاسيك', price: 85, cat: 'cat-burgers', emoji: '🍔', desc: 'لحم، خس، طماطم' },
    { id: 'b2', name: 'برجر جبنة', price: 95, cat: 'cat-burgers', emoji: '🧀', desc: 'جبنة مزدوجة، مخلل، بصل' },
    { id: 'b3', name: 'برجر بيكون', price: 110, cat: 'cat-burgers', emoji: '🥓', desc: 'بيكون مقرمش، صوص باربكيو' },
    { id: 'b4', name: 'برجر فطر', price: 105, cat: 'cat-burgers', emoji: '🍄', desc: 'جبنة سويسري، فطر' },
    { id: 'p1', name: 'مارغريتا', price: 120, cat: 'cat-pizza', emoji: '🍕', desc: 'طماطم، موزاريلا، ريحان' },
    { id: 'p2', name: 'بيبروني', price: 145, cat: 'cat-pizza', emoji: '🌶️', desc: 'بيبروني مزدوج، موزاريلا' },
    { id: 'p3', name: 'دجاج باربكيو', price: 155, cat: 'cat-pizza', emoji: '🍗', desc: 'صوص باربكيو، دجاج، بصل أحمر' },
    { id: 'p4', name: 'خضار', price: 130, cat: 'cat-pizza', emoji: '🥬', desc: 'خضار مشكلة، زيتون، فيتا' },
    { id: 'c1', name: 'ناجت دجاج (6)', price: 65, cat: 'cat-chicken', emoji: '🍗', desc: 'ناجت ذهبي مقرمش' },
    { id: 'c2', name: 'أجنحة دجاج (8)', price: 105, cat: 'cat-chicken', emoji: '🍗', desc: 'صوص بوفالو أو باربكيو' },
    { id: 'c3', name: 'ساندويتش دجاج', price: 90, cat: 'cat-chicken', emoji: '🥪', desc: 'دجاج مقرمش، كول سلو، مخلل' },
    { id: 's1', name: 'بطاطس مقلية', price: 35, cat: 'cat-sides', emoji: '🍟', desc: 'بطاطس ذهبية مقرمشة' },
    { id: 's2', name: 'حلقات بصل', price: 45, cat: 'cat-sides', emoji: '🧅', desc: 'حلقات بصل مقرمشة' },
    { id: 's3', name: 'أصابع موزاريلا', price: 55, cat: 'cat-sides', emoji: '🧀', desc: 'مع صوص مارينارا' },
    { id: 's4', name: 'كول سلو', price: 25, cat: 'cat-sides', emoji: '🥗', desc: 'كول سلو كريمي' },
    { id: 'd1', name: 'كولا', price: 20, cat: 'cat-drinks', emoji: '🥤', desc: 'كولا باردة' },
    { id: 'd2', name: 'ليمونادة', price: 25, cat: 'cat-drinks', emoji: '🍋', desc: 'ليمون طازج' },
    { id: 'd3', name: 'ميلك شيك', price: 50, cat: 'cat-drinks', emoji: '🥛', desc: 'فانيليا، شوكولاتة، أو فراولة' },
    { id: 'd4', name: 'شاي مثلج', price: 20, cat: 'cat-drinks', emoji: '🍵', desc: 'محلى أو بدون سكر' },
    { id: 'e1', name: 'آيس كريم صنداي', price: 45, cat: 'cat-desserts', emoji: '🍦', desc: '3 سكوب، صوص شوكولاتة، كرز' },
    { id: 'e2', name: 'تفاح محشو', price: 35, cat: 'cat-desserts', emoji: '🥧', desc: 'دافئ بالقرفة' },
    { id: 'e3', name: 'براوني', price: 30, cat: 'cat-desserts', emoji: '🍫', desc: 'براوني شوكولاتة' },
  ]
  const insertProd = db.prepare('INSERT INTO products (id, name, price, category_id, emoji, description, active) VALUES (?, ?, ?, ?, ?, ?, 1)')
  for (const p of prods) insertProd.run(p.id, p.name, p.price, p.cat, p.emoji, p.desc)

  // ─── Addons ─────────────────────────────────────────────────
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
  const insertAddon = db.prepare('INSERT INTO addons (id, name, price, emoji, active) VALUES (?, ?, ?, ?, 1)')
  for (const a of addonData) insertAddon.run(a.id, a.name, a.price, a.emoji)

  // ─── Modifier groups + modifiers ────────────────────────────
  const groupSizeId = 'modgrp-size'
  const groupSauceId = 'modgrp-sauce'

  const insertGroup = db.prepare('INSERT INTO modifier_groups (id, name, type, sort_order, active) VALUES (?, ?, ?, ?, 1)')
  insertGroup.run(groupSizeId, 'الحجم', 'single-select', 1)
  insertGroup.run(groupSauceId, 'الصوص', 'multi-select', 2)

  const insertMod = db.prepare('INSERT INTO modifiers (id, modifier_group_id, name, price_adjustment, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)')
  insertMod.run('mod-size-regular', groupSizeId, 'عادي', 0, 1)
  insertMod.run('mod-size-large', groupSizeId, 'كبير', 30, 2)
  insertMod.run('mod-size-xl', groupSizeId, 'XL', 50, 3)
  insertMod.run('mod-sauce-bbq', groupSauceId, 'باربكيو', 0, 1)
  insertMod.run('mod-sauce-garlic', groupSauceId, 'ثوم', 0, 2)
  insertMod.run('mod-sauce-spicy', groupSauceId, 'حار', 10, 3)

  // Link modifier groups to relevant products (burgers + pizza)
  const insertPMG = db.prepare('INSERT INTO product_modifier_groups (product_id, modifier_group_id) VALUES (?, ?)')
  for (const pid of ['b1', 'b2', 'b3', 'b4', 'p1', 'p2', 'p3', 'p4']) {
    insertPMG.run(pid, groupSizeId)
  }
  for (const pid of ['b1', 'b2', 'b3', 'b4']) {
    insertPMG.run(pid, groupSauceId)
  }

  // ─── Sample ingredients ─────────────────────────────────────
  const ingredientsData = [
    { id: 'ing-bread', name: 'خبز', unit: 'pcs', stock: 200, min: 20, cost: 3 },
    { id: 'ing-beef', name: 'لحم بقري', unit: 'g', stock: 10000, min: 1000, cost: 0.2 },
    { id: 'ing-chicken-breast', name: 'صدر دجاج', unit: 'g', stock: 8000, min: 1000, cost: 0.15 },
    { id: 'ing-cheese', name: 'جبنة', unit: 'g', stock: 5000, min: 500, cost: 0.1 },
    { id: 'ing-lettuce', name: 'خس', unit: 'g', stock: 3000, min: 300, cost: 0.05 },
    { id: 'ing-tomato', name: 'طماطم', unit: 'g', stock: 5000, min: 500, cost: 0.04 },
    { id: 'ing-potato', name: 'بطاطس', unit: 'g', stock: 15000, min: 2000, cost: 0.03 },
    { id: 'ing-cola', name: 'كولا', unit: 'ml', stock: 20000, min: 2000, cost: 0.01 },
  ]
  const insertIng = db.prepare('INSERT INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, active) VALUES (?, ?, ?, ?, ?, ?, 1)')
  for (const i of ingredientsData) insertIng.run(i.id, i.name, i.unit, i.stock, i.min, i.cost)

  // ─── Sample recipes ─────────────────────────────────────────
  const recipesData = [
    { id: 'rec-1', productId: 'b1', ingredientId: 'ing-bread', qty: 1 },
    { id: 'rec-2', productId: 'b1', ingredientId: 'ing-beef', qty: 150 },
    { id: 'rec-3', productId: 'b1', ingredientId: 'ing-lettuce', qty: 30 },
    { id: 'rec-4', productId: 'b1', ingredientId: 'ing-tomato', qty: 50 },
    { id: 'rec-5', productId: 'b2', ingredientId: 'ing-bread', qty: 1 },
    { id: 'rec-6', productId: 'b2', ingredientId: 'ing-beef', qty: 150 },
    { id: 'rec-7', productId: 'b2', ingredientId: 'ing-cheese', qty: 40 },
    { id: 'rec-8', productId: 's1', ingredientId: 'ing-potato', qty: 200 },
    { id: 'rec-9', productId: 'd1', ingredientId: 'ing-cola', qty: 330 },
  ]
  const insertRecipe = db.prepare('INSERT INTO recipes (id, product_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)')
  for (const r of recipesData) insertRecipe.run(r.id, r.productId, r.ingredientId, r.qty)

  db.close()
}
