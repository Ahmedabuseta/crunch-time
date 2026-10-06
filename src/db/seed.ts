import { getSqlite } from './client'
import { randomUUID } from 'crypto'
import argon2 from 'argon2'

// Deterministic RNG so the demo data is repeatable on a fresh database.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function seedDatabase() {
  const db = getSqlite()

  // Seeding is only for a genuinely new installation. Never overwrite users,
  // orders, or relations when the app starts with an existing database.
  const hasCoreData = db.prepare(`
    SELECT (
      EXISTS (SELECT 1 FROM users)
      OR EXISTS (SELECT 1 FROM orders)
    ) AS has_core_data
  `).get() as { has_core_data: number }
  if (hasCoreData.has_core_data) return

  const now = new Date().toISOString()
  const rand = mulberry32(42)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

  // ─── Settings ────────────────────────────────────────────────
  db.prepare('INSERT OR IGNORE INTO settings (id, delivery_fee, tax_rate, restaurant_name, currency) VALUES (?, ?, ?, ?, ?)')
    .run('settings', 25, 0.14, 'كريب هاوس', 'EGP')

  // ─── Delivery zones ──────────────────────────────────────────
  const insertZone = db.prepare('INSERT OR IGNORE INTO delivery_zones (id, name, fee, sort_order, active) VALUES (?, ?, ?, ?, 1)')
  insertZone.run('dz-near', 'قريب', 25, 0)
  insertZone.run('dz-mid', 'متوسط', 35, 1)
  insertZone.run('dz-far', 'بعيد', 45, 2)

  // ─── Kitchen stations (print routing — printer picked later) ──
  const insertStation = db.prepare('INSERT OR IGNORE INTO kitchen_stations (id, name, printer_name, paper_width, sort_order, active) VALUES (?, ?, NULL, ?, ?, 1)')
  insertStation.run('st-receipt', 'الكاشير (إيصال)', '80mm', 0)
  insertStation.run('st-kitchen-1', 'مطبخ 1', '80mm', 1)
  insertStation.run('st-kitchen-2', 'مطبخ 2', '80mm', 2)

  // ─── Discount codes ──────────────────────────────────────────
  const insertDisc = db.prepare('INSERT OR IGNORE INTO discount_codes (id, code, type, value, active, max_uses, used_count) VALUES (?, ?, ?, ?, 1, ?, 0)')
  insertDisc.run('disc-10', 'WELCOME10', 'percentage', 10, 100)
  insertDisc.run('disc-20', 'SAVE20', 'fixed', 20, 50)
  insertDisc.run('disc-5', 'FIVE', 'fixed', 5, 0)

  // ─── Expenses ────────────────────────────────────────────────
  const insertExp = db.prepare('INSERT OR IGNORE INTO expenses (id, name, category, amount, type, active) VALUES (?, ?, ?, ?, ?, 1)')
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
  // The real Crunch Time menu. Prices are seeded at 0 where the owner sets them
  // later; Sweets/Treat already carry their published prices.
  const CATALOG: {
    id: string; name: string; emoji: string; color: string
    items: { id: string; name: string; price: number; emoji?: string; desc?: string; rollback?: number }[]
  }[] = [
    {
      id: 'drinks', name: 'المشروبات', emoji: '🥤', color: 'var(--cat-drinks)',
      items: [
        { id: 'd1', name: 'ليمون نعناع', price: 0, emoji: '🍋' },
        { id: 'd2', name: 'مانجا', price: 0, emoji: '🥭' },
        { id: 'd3', name: 'برتقان', price: 0, emoji: '🍊' },
        { id: 'd4', name: 'في كولا', price: 0, emoji: '🥤' },
        { id: 'd5', name: 'في كولا دايت', price: 0, emoji: '🥤' },
        { id: 'd6', name: 'في كولا فراولة', price: 0, emoji: '🍓' },
        { id: 'd7', name: 'مياه صغيرة', price: 0, emoji: '💧' },
        { id: 'd8', name: 'مياه كبيرة', price: 0, emoji: '💧' },
      ],
    },
    {
      id: 'meat_crepe', name: 'كريب لحوم', emoji: '🌯', color: 'var(--cat-burgers)',
      items: [
        { id: 'm1', name: 'برجر', price: 0, emoji: '🍔' },
        { id: 'm2', name: 'هوت دوج', price: 0, emoji: '🌭' },
        { id: 'm3', name: 'سجق', price: 0, emoji: '🌭' },
        { id: 'm4', name: 'كفتة', price: 0, emoji: '🍢' },
      ],
    },
    {
      id: 'breakfast', name: 'فطار', emoji: '🍳', color: 'var(--cat-chicken)',
      items: [
        { id: 'b1', name: 'كريب بطاطس', price: 0, emoji: '🥔' },
        { id: 'b2', name: 'ميكس تشيز', price: 0, emoji: '🧀' },
      ],
    },
    {
      id: 'buckets', name: 'الباكت', emoji: '🍟', color: 'var(--cat-sides)',
      items: [
        { id: 'bk1', name: 'باكت بطاطس فرنس', price: 0, emoji: '🍟' },
        { id: 'bk2', name: 'باكت بطاطس عادي', price: 0, emoji: '🍟' },
        { id: 'bk3', name: 'باكت بطاطس شيدر', price: 0, emoji: '🧀' },
        { id: 'bk4', name: 'باكت بطاطس شيدر هالبينو', price: 0, emoji: '🌶️' },
        { id: 'bk5', name: 'بوب كرانش', price: 0, emoji: '🍗' },
        { id: 'bk6', name: 'بوب تايم', price: 0, emoji: '🍗' },
        { id: 'bk7', name: 'موتزريلا ستيكس', price: 0, emoji: '🧀' },
        { id: 'bk8', name: 'حلقات بصل', price: 0, emoji: '🧅' },
      ],
    },
    {
      id: 'chicken_crepe', name: 'كريب فراخ', emoji: '🍗', color: 'var(--cat-chicken)',
      items: [
        { id: 'c1', name: 'كرانش حار', price: 0, emoji: '🌶️' },
        { id: 'c2', name: 'كرانش بارد', price: 0, emoji: '🍗' },
        { id: 'c3', name: 'زنجر حار', price: 0, emoji: '🌶️' },
        { id: 'c4', name: 'زنجر بارد', price: 0, emoji: '🍗' },
        { id: 'c5', name: 'كوردون بلو', price: 0, emoji: '🍗' },
        { id: 'c6', name: 'مشوي صدور', price: 0, emoji: '🍗' },
        { id: 'c7', name: 'شيش', price: 0, emoji: '🍢' },
        { id: 'c8', name: 'شاورما', price: 0, emoji: '🌯' },
        { id: 'c9', name: 'فاهيتا', price: 0, emoji: '🌯' },
        { id: 'c10', name: 'ناشفل حار', price: 0, emoji: '🌶️' },
      ],
    },
    {
      id: 'syrian', name: 'السوري', emoji: '🥙', color: 'var(--cat-pizza)',
      items: [
        { id: 's1', name: 'بطاطس سوري', price: 0, emoji: '🥔' },
        { id: 's2', name: 'بطاطس موتزريلا', price: 0, emoji: '🧀' },
        { id: 's3', name: 'زنجر سوري', price: 0, emoji: '🌶️' },
        { id: 's4', name: 'بانيه سوري', price: 0, emoji: '🍗' },
        { id: 's5', name: 'كفتة سوري', price: 0, emoji: '🍢' },
        { id: 's6', name: 'فاهيتا سوري', price: 0, emoji: '🌯' },
        { id: 's7', name: 'شاورما سوري', price: 0, emoji: '🌯' },
        { id: 's8', name: 'شيش سوري', price: 0, emoji: '🍢' },
        { id: 's9', name: 'بانيه بطاطس', price: 0, emoji: '🍗' },
        { id: 's10', name: 'زنجر بطاطس', price: 0, emoji: '🌶️' },
        { id: 's11', name: 'شاورما بطاطس', price: 0, emoji: '🌯' },
      ],
    },
    {
      id: 'mixes', name: 'الميكسات', emoji: '🍽️', color: 'var(--cat-meals)',
      items: [
        { id: 'mx1', name: 'طوكيو', price: 0, emoji: '🍱' },
        { id: 'mx2', name: 'برين', price: 0, emoji: '🍱' },
        { id: 'mx3', name: 'نيروبي', price: 0, emoji: '🍱' },
        { id: 'mx4', name: 'ريو', price: 0, emoji: '🍱' },
        { id: 'mx5', name: 'استوكهولم', price: 0, emoji: '🍱' },
        { id: 'mx6', name: 'ميت لافرز', price: 0, emoji: '🥩' },
        { id: 'mx7', name: 'ميت تشيكن', price: 0, emoji: '🍗' },
      ],
    },
    {
      id: 'sweets', name: 'Sweets', emoji: '🍰', color: 'var(--cat-crepe-sweet)',
      items: [
        { id: 'sw1', name: 'Waffle Strawberry', price: 55, emoji: '🍓', desc: 'وافل فراولة' },
        { id: 'sw2', name: 'Nutella Waffle', price: 65, emoji: '🍫', desc: 'وافل نوتيلا' },
        { id: 'sw3', name: 'Pistachio Waffle', price: 70, emoji: '🥜', desc: 'وافل فستق' },
        { id: 'sw4', name: 'Lotus Waffle', price: 70, emoji: '🍪', desc: 'وافل لوتس' },
        { id: 'sw5', name: 'Kinder Waffle', price: 70, emoji: '🎨', desc: 'وافل كندر' },
      ],
    },
    {
      id: 'treat', name: 'Treat', emoji: '🍫', color: 'var(--cat-desserts)',
      items: [
        { id: 'tr1', name: 'Strawberry', price: 95, emoji: '🍓', desc: 'تريت فراولة' },
        { id: 'tr2', name: 'Nutella', price: 105, emoji: '🍫', desc: 'تريت نوتيلا' },
        { id: 'tr3', name: 'Pistachio', price: 130, emoji: '🥜', desc: 'تريت فستق' },
        { id: 'tr4', name: 'Lotus', price: 120, emoji: '🍪', desc: 'تريت لوتس' },
        { id: 'tr5', name: 'Kinder', price: 120, emoji: '🎨', desc: 'تريت كندر' },
      ],
    },
  ]

  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (id, name, emoji, color, sort_order, active) VALUES (?, ?, ?, ?, ?, 1)')
  CATALOG.forEach((c, i) => insertCat.run(c.id, c.name, c.emoji, c.color, i + 1))

  // ─── Products ───────────────────────────────────────────────
  const insertProd = db.prepare('INSERT OR IGNORE INTO products (id, name, price, cost_price, supports_rollback, category_id, emoji, description, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
  const prods: { id: string; name: string; price: number; cost: number; rollback: number; cat: string; emoji: string; desc: string }[] = []
  for (const c of CATALOG) {
    for (const it of c.items) {
      const emoji = it.emoji || c.emoji
      const desc = it.desc || it.name
      const rollback = it.rollback ?? (c.id === 'sweets' || c.id === 'treat' || c.id === 'drinks' ? 0 : 1)
      const row = { id: it.id, name: it.name, price: it.price, cost: 0, rollback, cat: c.id, emoji, desc }
      prods.push(row)
      insertProd.run(row.id, row.name, row.price, row.cost, row.rollback, row.cat, row.emoji, row.desc)
    }
  }
  const prodById = new Map(prods.map(p => [p.id, p]))

  // Flat id lists per category drive the recipe / modifier / addon wiring below.
  const idsOf = (...cats: string[]) => CATALOG.filter(c => cats.includes(c.id)).flatMap(c => c.items.map(i => i.id))
  const drinksIds = idsOf('drinks')
  const meatIds = idsOf('meat_crepe')
  const breakfastIds = idsOf('breakfast')
  const bucketIds = idsOf('buckets')
  const chickenIds = idsOf('chicken_crepe')
  const syrianIds = idsOf('syrian')
  const mixIds = idsOf('mixes')
  const sweetsIds = idsOf('sweets')
  const treatIds = idsOf('treat')

  // Crepe-style items get a dough base + filling; drinks are single ingredients.
  const crepeIds = [...meatIds, ...breakfastIds, ...chickenIds, ...syrianIds, ...mixIds]

  // ─── Addons ─────────────────────────────────────────────────
  // The real topping/side list from the add-ons screen. No ingredient
  // recipes yet — the owner wires consumption per add-on from the
  // inventory screen when they want add-ons to draw down stock.
  const addonData = [
    { id: '9f3720ac-1166-4fe9-9135-02e84a2c344b', name: 'بافلو', price: 25, emoji: '➕', rollback: 1 },
    { id: '9260e43b-b283-4a8c-af85-7ee84612dd20', name: 'بانيه', price: 40, emoji: '➕', rollback: 1 },
    { id: '9d281a34-4cd4-4ba5-ab17-077a95a8b011', name: 'برجر', price: 40, emoji: '➕', rollback: 1 },
    { id: 'addon-fries', name: 'بطاطس زيادة', price: 12, emoji: '🍟', rollback: 1 },
    { id: '768e0c71-4c9e-4ffa-a3e0-b446fa804577', name: 'تكساس', price: 7, emoji: '➕', rollback: 1 },
    { id: 'c1f2c9a9-c13a-4674-a4d6-e5fee6318cd1', name: 'ثاوزنلاند', price: 7, emoji: '➕', rollback: 1 },
    { id: '8c7d7f3f-fbc4-4ac2-86c0-0960559c159d', name: 'زنجرحار', price: 40, emoji: '➕', rollback: 1 },
    { id: '611f6616-05da-4d56-95b1-bfe47aae7227', name: 'سجق', price: 40, emoji: '➕', rollback: 1 },
    { id: '07f62499-2ebe-486e-994e-7a7218900f5c', name: 'شاورما', price: 40, emoji: '➕', rollback: 1 },
    { id: '751550c8-b026-4026-9a6f-a8c70de04f39', name: 'شيدر', price: 25, emoji: '➕', rollback: 1 },
    { id: '9f8d1aaf-2eb0-47a2-a1eb-f562e01db20b', name: 'شيش', price: 40, emoji: '➕', rollback: 1 },
    { id: 'f0e28b2a-1b7f-4d21-9c4f-99fe7d9f951c', name: 'فاهيتا', price: 40, emoji: '➕', rollback: 1 },
    { id: 'addon-ketchup', name: 'كاتشب', price: 7, emoji: '🍅', rollback: 1 },
    { id: 'fd588ed0-033e-44ba-86e3-a75167039fa9', name: 'كرانش', price: 7, emoji: '➕', rollback: 1 },
    { id: 'd3dbd4f7-14ae-4dd0-9031-11c616bcf805', name: 'كرنش', price: 40, emoji: '➕', rollback: 1 },
    { id: '171ec37a-0155-49e5-aa66-b4f52b2f002d', name: 'كفته', price: 40, emoji: '➕', rollback: 1 },
    { id: 'b7a85dc5-8193-4d4d-8d86-2a404711a154', name: 'كوردن بلو', price: 40, emoji: '➕', rollback: 1 },
    { id: 'e07a305b-c8b4-4367-b619-d94d84aa23e2', name: 'مايونيز', price: 7, emoji: '➕', rollback: 1 },
    { id: '9c75a3c7-f568-4254-8d3a-e1003ccb8cd4', name: 'مشوي صدور', price: 40, emoji: '➕', rollback: 1 },
    { id: '885b7e30-417c-4127-99aa-657bccae7451', name: 'موتزريلا', price: 20, emoji: '➕', rollback: 1 },
    { id: 'b87b00cb-a13f-4a77-a25b-56e6d390a689', name: 'ناشفل', price: 40, emoji: '➕', rollback: 1 },
    { id: '23bcda2e-c93f-4e5a-9c7d-a93c43160c04', name: 'هالبينو', price: 7, emoji: '➕', rollback: 1 },
    { id: '6d028c90-a736-4a0a-b695-fec16c2ea71e', name: 'هوت دوج', price: 40, emoji: '➕', rollback: 1 },
  ]
  const insertAddon = db.prepare('INSERT OR IGNORE INTO addons (id, name, price, emoji, supports_rollback, active) VALUES (?, ?, ?, ?, ?, 1)')
  for (const a of addonData) insertAddon.run(a.id, a.name, a.price, a.emoji, a.rollback)
  const addonById = new Map(addonData.map(a => [a.id, a]))

  // ─── Ingredients ────────────────────────────────────────────
  // The real kitchen stock, converted from كجم to grams because the app does no
  // unit conversion — recipe quantities and stock share one unit (grams).
  // Packaged items keep their own unit (علبة / لتر / ظرف). Costs start at 0;
  // the owner fills in purchase prices from the inventory screen.
  // min = a rough reorder threshold (~20% of stock, rounded).
  const ingredientsData = [
    { id: 'ing-chicken-cold', name: 'ألف جزيرة', unit: 'g', stock: 5 * 1000, min: 1000, cost: 0 },
    { id: 'ing-shawarma-cold', name: 'استربس بارد', unit: 'g', stock: 15 * 1000, min: 3000, cost: 0 },
    { id: 'ing-shawarma-hot', name: 'استربس حار', unit: 'g', stock: 30 * 1000, min: 6000, cost: 0 },
    { id: 'ing-buffalo', name: 'بافلو', unit: 'g', stock: 5 * 1000, min: 1000, cost: 0 },
    { id: 'ing-bbq', name: 'باربكيو', unit: 'g', stock: 4 * 1000, min: 800, cost: 0 },
    { id: 'ing-crispy-potato', name: 'بطاطس كريسبي', unit: 'g', stock: 12 * 1000, min: 2400, cost: 0 },
    { id: 'ing-burger', name: 'برجر', unit: 'g', stock: 4.8 * 1000, min: 1000, cost: 0 },
    { id: 'ing-beef', name: 'بيف', unit: 'g', stock: 2.5 * 1000, min: 500, cost: 0 },
    { id: 'ing-baking-powder', name: 'بيك بودر', unit: 'علبة', stock: 1, min: 0, cost: 0 },
    { id: 'ing-egg-powder', name: 'بيض باودر', unit: 'g', stock: 0.25 * 1000, min: 50, cost: 0 },
    { id: 'ing-tiger', name: 'تايجر', unit: 'g', stock: 5 * 1000, min: 1000, cost: 0 },
    { id: 'ing-turkey', name: 'تركي', unit: 'g', stock: 2.5 * 1000, min: 500, cost: 0 },
    { id: 'ing-texas', name: 'تكساس', unit: 'g', stock: 5 * 1000, min: 1000, cost: 0 },
    { id: 'ing-spices', name: 'توابل', unit: 'g', stock: 40 * 1000, min: 8000, cost: 0 },
    { id: 'ing-tatj', name: 'تاتج', unit: 'علبة', stock: 1, min: 0, cost: 0 },
    { id: 'ing-hot-sauce', name: 'حريقة', unit: 'g', stock: 5 * 1000, min: 1000, cost: 0 },
    { id: 'ing-onion-rings', name: 'حلقات بصل', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-pomegranate', name: 'دبس رمان', unit: 'g', stock: 330 * 1000, min: 66000, cost: 0 },
    { id: 'ing-ranch', name: 'رانش', unit: 'g', stock: 5 * 1000, min: 1000, cost: 0 },
    { id: 'ing-rome-cheese', name: 'رومي مبشور', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-sausage', name: 'سجق', unit: 'g', stock: 10 * 1000, min: 2000, cost: 0 },
    { id: 'ing-mint-syrup', name: 'سيرم نعناع', unit: 'لتر', stock: 1, min: 0, cost: 0 },
    { id: 'ing-cheddar', name: 'شيدر', unit: 'g', stock: 10 * 1000, min: 2000, cost: 0 },
    { id: 'ing-shish', name: 'شيش', unit: 'g', stock: 24 * 1000, min: 4800, cost: 0 },
    { id: 'ing-mozz-stick', name: 'صابع موزريلا', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-farm', name: 'فارم', unit: 'g', stock: 25 * 1000, min: 5000, cost: 0 },
    { id: 'ing-vanilla', name: 'فانيليا', unit: 'علبة', stock: 1, min: 0, cost: 0 },
    { id: 'ing-jalapeno', name: 'فلفل هالبينو', unit: 'g', stock: 4 * 1000, min: 800, cost: 0 },
    { id: 'ing-ketchup', name: 'كاتشب ظرف', unit: 'ظرف', stock: 2000, min: 400, cost: 0 },
    { id: 'ing-cancheese', name: 'كانتش', unit: 'g', stock: 10 * 1000, min: 2000, cost: 0 },
    { id: 'ing-crunchy-cold', name: 'كرنشي بارد', unit: 'g', stock: 10 * 1000, min: 2000, cost: 0 },
    { id: 'ing-crunchy-hot', name: 'كرنشي حار', unit: 'g', stock: 20 * 1000, min: 4000, cost: 0 },
    { id: 'ing-kofta', name: 'كفتة', unit: 'g', stock: 9 * 1000, min: 1800, cost: 0 },
    { id: 'ing-cordon-blue', name: 'كوردن بلو', unit: 'g', stock: 24 * 1000, min: 4800, cost: 0 },
    { id: 'ing-mayo', name: 'مايونيز', unit: 'g', stock: 10 * 1000, min: 2000, cost: 0 },
    { id: 'ing-mayo-classic', name: 'مايونيز كلاسيك', unit: 'g', stock: 3 * 1000, min: 600, cost: 0 },
    { id: 'ing-mustard', name: 'مسطردة', unit: 'g', stock: 4 * 1000, min: 800, cost: 0 },
    { id: 'ing-mushroom', name: 'مشروم', unit: 'g', stock: 9.6 * 1000, min: 1920, cost: 0 },
    { id: 'ing-mozzarella', name: 'موزاريلا', unit: 'g', stock: 20 * 1000, min: 4000, cost: 0 },
    { id: 'ing-hotdog', name: 'هوت دوج', unit: 'g', stock: 12 * 1000, min: 2400, cost: 0 },
    { id: 'ing-pistachio-sauce', name: 'صوص فستق', unit: 'g', stock: 1 * 1000, min: 200, cost: 0 },
    { id: 'ing-lotus-sauce', name: 'صوص لوتس', unit: 'g', stock: 1 * 1000, min: 200, cost: 0 },
    { id: 'ing-kinder-sauce', name: 'صوص كندر', unit: 'g', stock: 1 * 1000, min: 200, cost: 0 },
  ]
  // Migrations may already have inserted legacy ingredients before the initial
  // seed runs. Keep the seed idempotent so those rows are preserved.
  const insertIng = db.prepare('INSERT OR IGNORE INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, active) VALUES (?, ?, ?, ?, ?, ?, 1)')
  for (const i of ingredientsData) insertIng.run(i.id, i.name, i.unit, i.stock, i.min, i.cost)

  // ─── Product recipes ────────────────────────────────────────
  // Crepes, buckets and mixes are tracked by their prepared fillings — the dough
  // and fresh produce are untracked staples. Every quantity is in the ingredient's
  // own unit (grams for bulk, 1 = one sachet/box for packaged items).
  const recipesData: [string, string, string, number][] = []
  let recN = 1
  const addRecipe = (pid: string, iid: string, qty: number) => recipesData.push([`rec-${recN++}`, pid, iid, qty])
  const fill = (pid: string, rows: [string, number][]) => { for (const [iid, q] of rows) addRecipe(pid, iid, q) }

  const CRISPY_SIDE = [['ing-crispy-potato', 150]] as [string, number][]

  // كريب لحوم
  fill('m1', [['ing-burger', 120], ['ing-cancheese', 20], ['ing-ketchup', 1]])
  fill('m2', [['ing-hotdog', 110], ['ing-cancheese', 15], ['ing-mayo', 20]])
  fill('m3', [['ing-sausage', 100], ['ing-rome-cheese', 20], ['ing-mayo', 15]])
  fill('m4', [['ing-kofta', 120], ['ing-mozzarella', 20], ['ing-mustard', 10]])

  // فطار
  fill('b1', [['ing-crispy-potato', 150], ['ing-cancheese', 25], ['ing-ketchup', 1]])
  fill('b2', [['ing-cancheese', 40], ['ing-mozzarella', 30], ['ing-cheddar', 20]])

  // الباكت
  fill('bk1', [...CRISPY_SIDE, ['ing-spices', 4]])
  fill('bk2', [...CRISPY_SIDE, ['ing-spices', 6]])
  fill('bk3', [...CRISPY_SIDE, ['ing-cheddar', 30]])
  fill('bk4', [...CRISPY_SIDE, ['ing-cheddar', 30], ['ing-jalapeno', 10]])
  fill('bk5', [['ing-chicken-cold', 130], ...CRISPY_SIDE, ['ing-cancheese', 15]])
  fill('bk6', [['ing-tiger', 130], ...CRISPY_SIDE, ['ing-bbq', 20]])
  fill('bk7', [['ing-mozz-stick', 90], ['ing-ketchup', 1]])
  fill('bk8', [['ing-onion-rings', 110], ['ing-ketchup', 1]])

  // كريب فراخ
  fill('c1', [['ing-crunchy-hot', 120], ['ing-mozzarella', 20], ['ing-hot-sauce', 12]])
  fill('c2', [['ing-crunchy-cold', 120], ['ing-mozzarella', 20], ['ing-ranch', 15]])
  fill('c3', [['ing-turkey', 130], ['ing-jalapeno', 8], ['ing-hot-sauce', 12]])
  fill('c4', [['ing-turkey', 130], ['ing-ranch', 15]])
  fill('c5', [['ing-cordon-blue', 140], ['ing-cheddar', 20], ['ing-ranch', 15]])
  fill('c6', [['ing-chicken-cold', 140], ['ing-mozzarella', 20], ['ing-ranch', 10]])
  fill('c7', [['ing-shish', 120], ['ing-mozzarella', 20], ['ing-bbq', 15]])
  fill('c8', [['ing-shawarma-cold', 120], ['ing-mozzarella', 20], ['ing-mayo-classic', 15]])
  fill('c9', [['ing-shawarma-hot', 120], ['ing-mushroom', 20], ['ing-mozzarella', 15]])
  fill('c10', [['ing-buffalo', 120], ['ing-mozzarella', 20], ['ing-hot-sauce', 12]])

  // السوري
  fill('s1', [['ing-crispy-potato', 160], ['ing-pomegranate', 15], ['ing-mayo-classic', 20]])
  fill('s2', [['ing-crispy-potato', 150], ['ing-mozzarella', 30], ['ing-pomegranate', 12]])
  fill('s3', [['ing-texas', 130], ['ing-pomegranate', 15], ['ing-mayo', 15]])
  fill('s4', [['ing-buffalo', 140], ['ing-pomegranate', 15], ['ing-mayo', 20]])
  fill('s5', [['ing-kofta', 130], ['ing-pomegranate', 12], ['ing-mayo-classic', 15]])
  fill('s6', [['ing-shawarma-hot', 130], ['ing-mushroom', 20], ['ing-pomegranate', 15]])
  fill('s7', [['ing-shawarma-cold', 130], ['ing-pomegranate', 15], ['ing-mayo-classic', 15]])
  fill('s8', [['ing-shish', 130], ['ing-pomegranate', 12], ['ing-mayo-classic', 15]])
  fill('s9', [['ing-buffalo', 140], ['ing-crispy-potato', 100], ['ing-pomegranate', 15]])
  fill('s10', [['ing-texas', 130], ['ing-crispy-potato', 100], ['ing-pomegranate', 12]])
  fill('s11', [['ing-shawarma-cold', 130], ['ing-crispy-potato', 100], ['ing-pomegranate', 15]])

  // الميكسات
  fill('mx1', [['ing-chicken-cold', 120], ...CRISPY_SIDE, ['ing-mozzarella', 15], ['ing-ranch', 10]])
  fill('mx2', [['ing-chicken-cold', 120], ...CRISPY_SIDE, ['ing-ranch', 15], ['ing-mayo', 15]])
  fill('mx3', [['ing-turkey', 120], ...CRISPY_SIDE, ['ing-hot-sauce', 12], ['ing-mayo', 15]])
  fill('mx4', [['ing-beef', 120], ...CRISPY_SIDE, ['ing-cancheese', 20], ['ing-bbq', 15]])
  fill('mx5', [['ing-chicken-cold', 120], ...CRISPY_SIDE, ['ing-mozzarella', 20], ['ing-mayo-classic', 15]])
  fill('mx6', [['ing-farm', 150], ...CRISPY_SIDE, ['ing-mushroom', 30], ['ing-cheddar', 20]])
  fill('mx7', [['ing-tiger', 140], ...CRISPY_SIDE, ['ing-ranch', 15], ['ing-mayo', 15]])

  // Sweets + Treat share a batter base; the named sauce is the topping.
  // Packaged items are consumed in tiny amounts per serving (grams of powder,
  // a fraction of a sachet), so one box/jar covers the whole menu.
  const WAFFLE_BASE = [['ing-egg-powder', 25], ['ing-baking-powder', 0.5], ['ing-vanilla', 0.02]] as [string, number][]
  const TOPPINGS: Record<string, [string, number][]> = {
    sw1: [['ing-tatj', 0.05], ['ing-mint-syrup', 0.05]],
    sw2: [['ing-tatj', 0.05]],
    sw3: [['ing-pistachio-sauce', 0.05]],
    sw4: [['ing-lotus-sauce', 0.05]],
    sw5: [['ing-kinder-sauce', 0.05]],
    tr1: [['ing-tatj', 0.1], ['ing-mint-syrup', 0.1]],
    tr2: [['ing-tatj', 0.1], ['ing-mozzarella', 20]],
    tr3: [['ing-pistachio-sauce', 0.1], ['ing-mozzarella', 20]],
    tr4: [['ing-lotus-sauce', 0.1], ['ing-mozzarella', 20]],
    tr5: [['ing-kinder-sauce', 0.1], ['ing-mozzarella', 20]],
  }
  for (const pid of [...sweetsIds, ...treatIds]) {
    for (const [iid, qty] of WAFFLE_BASE) addRecipe(pid, iid, qty)
    fill(pid, TOPPINGS[pid] || [])
  }

  // المشروبات — packaged items use a fraction of a sachet per cup.
  fill('d1', [['ing-mint-syrup', 0.03], ['ing-spices', 2]])
  fill('d2', [['ing-mayo', 10]])
  fill('d3', [['ing-pomegranate', 15]])
  fill('d4', [['ing-tatj', 0.05]])
  fill('d5', [['ing-tatj', 0.05]])
  fill('d6', [['ing-tatj', 0.05], ['ing-pomegranate', 10]])
  fill('d7', [['ing-spices', 1]])
  fill('d8', [['ing-spices', 1]])
  const insertRecipe = db.prepare('INSERT OR IGNORE INTO recipes (id, product_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)')
  for (const r of recipesData) insertRecipe.run(r[0], r[1], r[2], r[3])
  const recipesByProduct = new Map<string, [string, number][]>()
  for (const [, pid, iid, qty] of recipesData) {
    if (!recipesByProduct.has(pid)) recipesByProduct.set(pid, [])
    recipesByProduct.get(pid)!.push([iid, qty])
  }

  // Addons carry no ingredient recipes yet — the owner wires
  // consumption per add-on from the inventory screen.
  const addonRecipeById = new Map<string, [string, number][]>()

  // ─── Link addons to products ───
  // Every made-to-order department carries the full
  // topping/side list; drinks, sweets and treats stay addon-free.
  const insertPA = db.prepare('INSERT OR IGNORE INTO product_addons (product_id, addon_id) VALUES (?, ?)')
  for (const pid of [...crepeIds, ...bucketIds]) for (const a of addonData) insertPA.run(pid, a.id)

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
  ].slice(0, 8)
  const insertCust = db.prepare('INSERT OR IGNORE INTO customers (id, phone, name, address, order_count, last_order_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const custStats = new Map<string, { count: number; last: string }>()

  // ─── A month of shifts + orders ─────────────────────────────
  const insertShift = db.prepare('INSERT INTO shifts (id, number, user_id, started_at, ended_at, opening_cash, closing_cash, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const insertOrder = db.prepare(`INSERT INTO orders (id, status, order_type, table_number, customer_name, customer_phone, customer_address,
    delivery_address, delivery_phone, subtotal, tax, delivery_fee, delivery_zone_id, delivery_zone_name, delivery_note, discount_code, discount_amount, total,
    payment_type, cashier_name, status_reason, driver_status, refunded_amount, user_id, shift_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
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
  const pendingTransactions: [string, string, string, number, string, string, string][] = []

  // Popularity drives the demo mix: crepes and buckets sell most, desserts least.
  // Zero-priced items are skipped so demo orders always have a real total.
  const pricedProdIds = prods.filter(p => p.price > 0).map(p => p.id)
  const CHEAP = drinksIds.concat(sweetsIds)
  const CORE = [...crepeIds, ...bucketIds, ...mixIds, ...syrianIds]
  const weights: Record<string, number> = {}
  for (const pid of CHEAP) weights[pid] = 2
  for (const pid of CORE) weights[pid] = 3
  for (const pid of meatIds) weights[pid] = 2
  for (const pid of breakfastIds) weights[pid] = 2
  for (const pid of chickenIds) weights[pid] = 3
  for (const pid of treatIds) weights[pid] = 1
  const weightedBag: string[] = []
  for (const pid of pricedProdIds) for (let k = 0; k < (weights[pid] || 1); k++) weightedBag.push(pid)

  const CANCEL_REASONS = ['العميل طلب الإلغاء', 'خطأ في إدخال الطلب', 'تأخير التوصيل', 'مشكلة في جودة الطعام', 'العميل لم يستلم']
  const DISC_POOL = [
    { code: 'WELCOME10', type: 'percentage', value: 10 },
    { code: 'SAVE20', type: 'fixed', value: 20 },
    { code: 'FIVE', type: 'fixed', value: 5 },
  ]
  const discUse = new Map<string, number>()

  const consume = (iid: string, qty: number, orderId: string, ts: string, label: string) => {
    pendingTransactions.push([randomUUID(), iid, 'CONSUMPTION', -qty, orderId, label, ts])
  }

  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const dayStart = midnight.getTime() - 6 * 86400000
  const tsOf = (day: number, h: number, m: number) => new Date(dayStart + day * 86400000 + h * 3600000 + m * 60000).toISOString()

  let orderSeq = 100001
  let shiftNum = 0
  const todayStr = new Date().toISOString().slice(0, 10)

  for (let day = 0; day < 7; day++) {
    for (let s = 0; s < 1; s++) {
      const cashier = cashiers[day % 2]
      const startH = 11
      const endH = 20
      const startTs = tsOf(day, startH, int(0, 20))
      const isLastShift = day === 6
      const endTs = isLastShift ? null : tsOf(day, Math.min(endH, 23), int(0, 50))
      const openingCash = int(8, 15) * 100
      const shiftId = randomUUID()
      shiftNum++
      // Orders reference their shift, so create the parent row first.
      insertShift.run(shiftId, shiftNum, cashier.id, startTs, null, openingCash, null, 'open')

      const orderCount = int(3, 6)
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
          const addonIds: string[] = []
          const addonPool = ['addon-fries', 'addon-ketchup', '768e0c71-4c9e-4ffa-a3e0-b446fa804577', 'c1f2c9a9-c13a-4674-a4d6-e5fee6318cd1', '23bcda2e-c93f-4e5a-9c7d-a93c43160c04']
          if (rand() < 0.3) {
            const aid = pick(addonPool)
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
          payCash ? 'cash' : 'visa', cashier.name, statusReason, isDelivery ? 'unassigned' : null, refundedAmount,
          cashier.id, shiftId, ots, ots)

        for (const r of itemRows) {
          insertItem.run(randomUUID(), r.pid, orderId, r.qty, r.unit,
            r.mods.length ? JSON.stringify(r.mods) : null,
            r.addonIds.length ? JSON.stringify(r.addonIds) : null)
        }
        insertPay.run(randomUUID(), orderId, payCash ? 'cash' : 'card', total, ots)
        for (const txn of pendingTransactions.splice(0)) insertTxn.run(...txn)

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
        db.prepare('UPDATE shifts SET ended_at = NULL, closing_cash = NULL, status = ? WHERE id = ?').run('open', shiftId)
      } else {
        const noise = int(-40, 25)
        const closingCash = Math.max(0, Math.round(expected + noise))
        db.prepare('UPDATE shifts SET ended_at = ?, closing_cash = ?, status = ? WHERE id = ?').run(endTs, closingCash, 'closed', shiftId)
        insertMov.run(randomUUID(), shiftId, 'CLOSING', closingCash, 'إغلاق الوردية', endTs)
      }
    }
    void todayStr
  }

  // Persist customers
  for (const c of customerPool) {
    const st = custStats.get(c.phone)
    if (!st) continue
    insertCust.run(`seed-customer-${c.phone}`, c.phone, c.name, c.addr, st.count, st.last, st.last)
  }

  // Discount usage counts
  for (const [code, n] of discUse) {
    db.prepare('UPDATE discount_codes SET used_count = ? WHERE code = ?').run(n, code)
  }

  // Weekly purchases for the main consumables. Costs here are unknown, so the
  // unit_cost matches the ingredient (0) and the owner records real prices
  // via restock. Quantities are a top-up on top of the opening stock.
  const insertPurch = db.prepare('INSERT INTO purchase_price_history (id, ingredient_id, supplier, unit_cost, quantity, purchased_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const corePurchases: [string, string, number, number][] = [
    ['ing-crispy-potato', 'سوق العبور', 0, 8000], ['ing-mozzarella', 'ألبان الريف', 0, 5000],
    ['ing-cheddar', 'ألبان الريف', 0, 3000], ['ing-kofta', 'دواجن البركة', 0, 4000],
    ['ing-sausage', 'دواجن البركة', 0, 5000], ['ing-shawarma-cold', 'لحمة الدقي', 0, 6000],
    ['ing-shawarma-hot', 'لحمة الدقي', 0, 12000], ['ing-ketchup', 'شركة المشروبات', 0, 1000],
  ]
  for (let w = 0; w < 2; w++) {
    const pday = tsOf(Math.min(6, w * 4 + 2), 9, 0)
    for (const [iid, sup, cost, qty] of corePurchases) {
      insertPurch.run(randomUUID(), iid, sup, cost, qty, pday.slice(0, 10), pday)
      insertTxn.run(randomUUID(), iid, 'PURCHASE', qty, null, `شراء أسبوعي — ${sup}`, pday)
    }
  }
}
