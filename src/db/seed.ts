import { getSqlite } from './client'
import { randomUUID } from 'crypto'
import argon2 from 'argon2'

// Seeds ONLY the reference data a brand-new install needs to log in and sell:
// staff, menu, stock, settings. No fabricated orders, shifts, customers or
// purchase history — sales data comes from real use or a restored backup.
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
    .run(adminId, 'أحمد السيد', await argon2.hash('CrunchTime#2026'), 'admin', 1, now, 0, 0)
  const cashierA = randomUUID()
  db.prepare('INSERT INTO users (id, name, pin_hash, role, active, created_at, hourly_rate, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(cashierA, 'محمد علي', await argon2.hash('1234'), 'cashier', 1, now, 25, 2)
  const cashierB = randomUUID()
  db.prepare('INSERT INTO users (id, name, pin_hash, role, active, created_at, hourly_rate, commission_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(cashierB, 'مصطفى كريم', await argon2.hash('5678'), 'cashier', 1, now, 25, 2)
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
  for (const c of CATALOG) {
    for (const it of c.items) {
      const emoji = it.emoji || c.emoji
      const desc = it.desc || it.name
      const rollback = it.rollback ?? (c.id === 'sweets' || c.id === 'treat' || c.id === 'drinks' ? 0 : 1)
      const row = { id: it.id, name: it.name, price: it.price, cost: 0, rollback, cat: c.id, emoji, desc }
      insertProd.run(row.id, row.name, row.price, row.cost, row.rollback, row.cat, row.emoji, row.desc)
    }
  }

  // Flat id lists per category drive the recipe / modifier / addon wiring below.
  const idsOf = (...cats: string[]) => CATALOG.filter(c => cats.includes(c.id)).flatMap(c => c.items.map(i => i.id))
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
  // The real topping/side list from the add-ons screen, completed with every
  // remaining sauce type (باربكيو، رانش، ترياكي…). Proteins, cheeses and
  // sauces each cover all their types. Every addon gets an ingredient
  // consumption recipe further below, so add-ons draw down stock.
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
    // ─ صوصات بكل أنواعها (سعر الصوصات الحالي 7ج) ─
    { id: 'addon-bbq', name: 'باربكيو', price: 7, emoji: '➕', rollback: 1 },
    { id: 'addon-ranch', name: 'رانش', price: 7, emoji: '➕', rollback: 1 },
    { id: 'addon-teriyaki', name: 'ترياكي', price: 7, emoji: '➕', rollback: 1 },
    { id: 'addon-fajita-sauce', name: 'صوص فاهيتا', price: 7, emoji: '➕', rollback: 1 },
    { id: 'addon-balsamic', name: 'صوص بلسمك', price: 7, emoji: '➕', rollback: 1 },
    { id: 'addon-harissa', name: 'هريسه', price: 7, emoji: '➕', rollback: 1 },
    { id: 'addon-tiger', name: 'تايجر', price: 7, emoji: '➕', rollback: 1 },
    { id: 'addon-pomegranate', name: 'دبس رمان', price: 7, emoji: '➕', rollback: 1 },
    { id: 'addon-hot-sauce', name: 'حريقة', price: 7, emoji: '🌶️', rollback: 1 },
    { id: 'addon-mustard', name: 'مسطردة', price: 7, emoji: '➕', rollback: 1 },
    // ─ إضافات جديدة بسعرها من ملف الوصفات (30ج) ─
    { id: 'addon-mushroom', name: 'مشروم', price: 30, emoji: '🍄', rollback: 1 },
    { id: 'addon-basturma', name: 'بسطرمة', price: 30, emoji: '🥩', rollback: 1 },
  ]
  const insertAddon = db.prepare('INSERT OR IGNORE INTO addons (id, name, price, emoji, supports_rollback, active) VALUES (?, ?, ?, ?, ?, 1)')
  for (const a of addonData) insertAddon.run(a.id, a.name, a.price, a.emoji, a.rollback)

  // ─── Ingredients ────────────────────────────────────────────
  // The real kitchen stock, converted from كجم to grams because the app does no
  // unit conversion — recipe quantities and stock share one unit (grams).
  // Packaged items keep their own unit (علبة / لتر / ظرف / قطعة).
  // The 33 priced entries carry the real purchase data:
  // cost_per_unit = package price ÷ purchase_qty (package size in
  // stock units), and supplier is who we buy it from. Unpriced
  // items start at 0 cost; the owner fills them in from the
  // inventory screen. min = a rough reorder threshold (~20% of stock).
  const ingredientsData = [
    { id: 'ing-chicken-cold', name: 'ثاوزند آيلاند', unit: 'g', stock: 50 * 1000, min: 1000, cost: 0.092, pack: 5000, sup: 'اليو' },
    { id: 'ing-shawarma-cold', name: 'استربس بارد', unit: 'g', stock: 150 * 1000, min: 3000, cost: 0.203, pack: 15000, sup: 'روستي' },
    { id: 'ing-shawarma-hot', name: 'استربس حار', unit: 'g', stock: 150 * 1000, min: 6000, cost: 0.203, pack: 15000, sup: 'روستي' },
    { id: 'ing-buffalo', name: 'بافلو', unit: 'g', stock: 50 * 1000, min: 1000, cost: 0.087, pack: 5000, sup: 'ولعين' },
    { id: 'ing-bbq', name: 'باربكيو', unit: 'g', stock: 170 * 1000, min: 3400, cost: 0.02, pack: 17000, sup: 'هاينز' },
    { id: 'ing-crispy-potato', name: 'بطاطس (كريسبي / فرسكس / فارم فريتس)', unit: 'g', stock: 125 * 1000, min: 2500, cost: 0.0576, pack: 12500, sup: 'متعدد' },
    { id: 'ing-burger', name: 'برجر', unit: 'g', stock: 6 * 1000, min: 1000, cost: 2.15, pack: 600, sup: 'دايم' },
    { id: 'ing-beef', name: 'بيف / روزبيف', unit: 'g', stock: 5 * 1000, min: 500, cost: 0.32, pack: 500, sup: 'دايم' },
    { id: 'ing-baking-powder', name: 'بيك بودر', unit: 'علبة', stock: 1, min: 0, cost: 0 },
    { id: 'ing-egg-powder', name: 'بيض باودر', unit: 'g', stock: 0.25 * 1000, min: 50, cost: 0 },
    { id: 'ing-tiger', name: 'تايجر', unit: 'g', stock: 50 * 1000, min: 1000, cost: 0.058, pack: 5000, sup: 'اليو' },
    { id: 'ing-turkey', name: 'تركي / رومي مدخن', unit: 'g', stock: 5 * 1000, min: 500, cost: 0.25, pack: 500, sup: 'دايم' },
    { id: 'ing-texas', name: 'تكساس', unit: 'g', stock: 50 * 1000, min: 1000, cost: 0.13, pack: 5000, sup: 'اليو' },
    { id: 'ing-spices', name: 'توابل', unit: 'g', stock: 40 * 1000, min: 8000, cost: 0 },
    { id: 'ing-tatj', name: 'تاتج', unit: 'علبة', stock: 1, min: 0, cost: 0 },
    { id: 'ing-hot-sauce', name: 'هريسة شطة (حريقة)', unit: 'g', stock: 200 * 1000, min: 4000, cost: 0.0155, pack: 20000, sup: 'جولدن باك' },
    { id: 'ing-onion-rings', name: 'حلقات بصل', unit: 'g', stock: 10 * 1000, min: 400, cost: 0.1, pack: 1000, sup: 'سمارت' },
    { id: 'ing-pomegranate', name: 'دبس رمان', unit: 'g', stock: 39.6 * 1000, min: 800, cost: 0.00884, pack: 3960, sup: 'الطيبات' },
    { id: 'ing-ranch', name: 'رانش', unit: 'g', stock: 50 * 1000, min: 1000, cost: 0.092, pack: 5000, sup: 'اليو' },
    { id: 'ing-rome-cheese', name: 'رومي مبشور', unit: 'g', stock: 10 * 1000, min: 400, cost: 0.125, pack: 1000, sup: 'ريفال' },
    { id: 'ing-sausage', name: 'سجق', unit: 'g', stock: 100 * 1000, min: 2000, cost: 0.185, pack: 10000, sup: 'ميتلاند' },
    { id: 'ing-mint-syrup', name: 'سيرم نعناع', unit: 'لتر', stock: 1, min: 0, cost: 0 },
    { id: 'ing-cheddar', name: 'شيدر (صوص)', unit: 'g', stock: 50 * 1000, min: 2000, cost: 0.138, pack: 5000, sup: 'اليو' },
    { id: 'ing-shish', name: 'شيش', unit: 'g', stock: 108 * 1000, min: 4800, cost: 0.2, pack: 10800, sup: 'متعدد' },
    { id: 'ing-mozz-stick', name: 'اصابع موزاريلا', unit: 'g', stock: 10 * 1000, min: 400, cost: 0.15, pack: 1000, sup: 'سمارت' },
    { id: 'ing-farm', name: 'فارم', unit: 'g', stock: 25 * 1000, min: 5000, cost: 0 },
    { id: 'ing-vanilla', name: 'فانيليا', unit: 'علبة', stock: 1, min: 0, cost: 0 },
    { id: 'ing-jalapeno', name: 'فلفل هالبينو', unit: 'g', stock: 160 * 1000, min: 3200, cost: 0.00656, pack: 16000, sup: 'ارابيكس' },
    { id: 'ing-ketchup', name: 'كاتشب ظرف', unit: 'ظرف', stock: 20 * 1000, min: 400, cost: 0.485, pack: 1000, sup: 'هاينز' },
    { id: 'ing-cancheese', name: 'كاتشب جركن', unit: 'g', stock: 100 * 1000, min: 2000, cost: 0.04, pack: 10000, sup: 'اليو' },
    { id: 'ing-crunchy-cold', name: 'كرنشي بارد', unit: 'g', stock: 100 * 1000, min: 2000, cost: 0.085, pack: 10000, sup: 'شاهيتا' },
    { id: 'ing-crunchy-hot', name: 'كرنشي حار', unit: 'g', stock: 100 * 1000, min: 4000, cost: 0.085, pack: 10000, sup: 'شاهيتا' },
    { id: 'ing-kofta', name: 'كفتة', unit: 'g', stock: 72 * 1000, min: 1800, cost: 0.01944, pack: 7200, sup: 'دايم' },
    { id: 'ing-cordon-blue', name: 'كوردن بلو', unit: 'g', stock: 120 * 1000, min: 4800, cost: 0.17, pack: 12000, sup: 'سمارت' },
    { id: 'ing-mayo', name: 'مايونيز', unit: 'g', stock: 100 * 1000, min: 2000, cost: 0.065, pack: 10000, sup: 'اليو' },
    { id: 'ing-mayo-classic', name: 'مايونيز كلاسيك', unit: 'g', stock: 120 * 1000, min: 2400, cost: 0.03225, pack: 12000, sup: 'هاينز' },
    { id: 'ing-mustard', name: 'مسطردة', unit: 'g', stock: 39 * 1000, min: 800, cost: 0.08974, pack: 3900, sup: 'هاينز' },
    { id: 'ing-mushroom', name: 'مشروم', unit: 'g', stock: 96 * 1000, min: 1920, cost: 0.08125, pack: 9600, sup: 'كنانة' },
    { id: 'ing-mozzarella', name: 'موزاريلا', unit: 'g', stock: 10 * 1000, min: 4000, cost: 0.12, pack: 1000, sup: 'متعدد' },
    { id: 'ing-hotdog', name: 'هوت دوج', unit: 'g', stock: 120 * 1000, min: 2400, cost: 0.185, pack: 12000, sup: 'ميتلاند' },
    { id: 'ing-pistachio-sauce', name: 'صوص فستق', unit: 'g', stock: 1 * 1000, min: 200, cost: 0 },
    { id: 'ing-lotus-sauce', name: 'صوص لوتس', unit: 'g', stock: 1 * 1000, min: 200, cost: 0 },
    { id: 'ing-kinder-sauce', name: 'صوص كندر', unit: 'g', stock: 1 * 1000, min: 200, cost: 0 },
    // ── الوصفات الجديدة: خضار طازج + صوصات + بروتين ──
    { id: 'ing-olives', name: 'زيتون', unit: 'g', stock: 2 * 1000, min: 400, cost: 0.096, pack: 1000 },
    { id: 'ing-lettuce', name: 'خس', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-pepper', name: 'فلفل', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-pepper-mix', name: 'فلفل الوان', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-onion', name: 'بصل', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-tomato', name: 'طماطم', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-pickles', name: 'خيار مخلل', unit: 'g', stock: 1 * 1000, min: 200, cost: 0 },
    { id: 'ing-chicken-breast', name: 'صدور', unit: 'g', stock: 12 * 1000, min: 2400, cost: 0.27, pack: 1000 },
    { id: 'ing-breast-marinated', name: 'صدور متبلة', unit: 'g', stock: 5 * 1000, min: 1000, cost: 0 },
    { id: 'ing-pepperoni', name: 'ببروني', unit: 'g', stock: 2 * 1000, min: 400, cost: 0.825, pack: 200 },
    { id: 'ing-zinger', name: 'زنجر', unit: 'g', stock: 5 * 1000, min: 1000, cost: 0 },
    { id: 'ing-baniye', name: 'بانيه', unit: 'قطعة', stock: 100, min: 20, cost: 0 },
    { id: 'ing-fajita', name: 'فاهيتا', unit: 'g', stock: 3 * 1000, min: 600, cost: 0 },
    { id: 'ing-fajita-sauce', name: 'صوص فاهيتا', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-teriyaki', name: 'ترياكي صوص', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-balsamic', name: 'صوص بلسمك', unit: 'g', stock: 2 * 1000, min: 400, cost: 0 },
    { id: 'ing-harissa', name: 'هريسه', unit: 'g', stock: 1 * 1000, min: 200, cost: 0 },
    { id: 'ing-basturma', name: 'بسطرمة', unit: 'g', stock: 1 * 1000, min: 200, cost: 0 },
    // ── ورقات ومستلزمات: بالقطعة ──
    // Food items draw down in recipes (crepe wrappers, waffles);
    // packaging/operational supplies stay inventory-only.
    { id: 'ing-hall-crepe', name: 'كريب الصالة', unit: 'pcs', stock: 4000, min: 800, cost: 1, pack: 4000 },
    { id: 'ing-tiktaway-crepe', name: 'كريب تيكتاواي', unit: 'pcs', stock: 6000, min: 1200, cost: 1.97, pack: 6000 },
    { id: 'ing-waffle', name: 'وافل', unit: 'pcs', stock: 1000, min: 200, cost: 4.5, pack: 1000 },
    { id: 'ing-prod-sticker', name: 'ستيكر تاريخ الإنتاج', unit: 'pcs', stock: 2000, min: 400, cost: 0.195, pack: 2000 },
    { id: 'ing-sticky-disc', name: 'دائرة لزق', unit: 'pcs', stock: 1000, min: 200, cost: 0.4, pack: 1000 },
    { id: 'ing-potato-box', name: 'علب بطاطس', unit: 'pcs', stock: 2000, min: 400, cost: 1.45, pack: 2000 },
    { id: 'ing-potato-box-mix', name: 'علب بطاطس مركب', unit: 'pcs', stock: 2000, min: 400, cost: 1.67, pack: 2000 },
    { id: 'ing-sandwich-paper', name: 'سندوتش ورق', unit: 'pcs', stock: 2000, min: 400, cost: 1.15, pack: 2000 },
    { id: 'ing-butter-paper', name: 'ورق زبدة', unit: 'pcs', stock: 4000, min: 800, cost: 0.925, pack: 4000 },
    // ── الفاتورة الجديدة: دقيق وزيت وسكر وزبدة ──
    // دقيق comes in a 25 kg sack; زيت by the bottle
    // (treated as 1 kg — weigh the bottle and edit
    // «حجم العبوة» if it differs).
    { id: 'ing-flour', name: 'دقيق', unit: 'g', stock: 25 * 1000, min: 5000, cost: 0.0206, pack: 25000 },
    { id: 'ing-oil', name: 'زيت', unit: 'g', stock: 1000, min: 200, cost: 0.06, pack: 1000 },
    { id: 'ing-milk-powder', name: 'لبن بودر', unit: 'g', stock: 1200, min: 240, cost: 0.4292, pack: 1200 },
    { id: 'ing-sugar', name: 'سكر عادي', unit: 'g', stock: 1000, min: 200, cost: 0.028, pack: 1000 },
    { id: 'ing-butter', name: 'زبدة', unit: 'g', stock: 1000, min: 200, cost: 0.16, pack: 1000 },
    { id: 'ing-powdered-sugar', name: 'سكر بودرة', unit: 'g', stock: 1000, min: 200, cost: 0.081, pack: 1000 },
    { id: 'ing-honey', name: 'عسل', unit: 'g', stock: 1000, min: 200, cost: 0.239, pack: 1000 },
    // Dough ingredients with no purchase line yet —
    // count the stock and enter «سعر العبوة» to price them.
    { id: 'ing-egg-white-powder', name: 'بياض بيض بودرة', unit: 'g', stock: 0, min: 0, cost: 0 },
    { id: 'ing-water', name: 'ميه', unit: 'g', stock: 0, min: 0, cost: 0 },
  ]
  // Migrations may already have inserted legacy ingredients before the initial
  // seed runs. Keep the seed idempotent so those rows are preserved.
  // purchase_qty defaults to a 1kg package for gram items and 1
  // for packaged items when the entry carries no explicit pack size.
  const insertIng = db.prepare('INSERT OR IGNORE INTO ingredients (id, name, unit, stock_quantity, min_stock, cost_per_unit, purchase_qty, supplier, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
  for (const i of ingredientsData) insertIng.run(i.id, i.name, i.unit, i.stock, i.min, i.cost, i.pack ?? (i.unit === 'g' ? 1000 : 1), i.sup ?? null)

  // ─── Product recipes ────────────────────────────────────────
  // The kitchen recipe book: fillings, cheeses, sauces — and fresh produce too.
  // Every quantity is in the ingredient's own unit (grams for bulk, 1 = one
  // sachet/box for packaged items). Mapping notes from the recipes file:
  //  • "أو" choices (تركي أو بيف، استربس حار أو بارد) are seeded as modifier
  //    groups below — each option carries its own drawdown.
  //  • piece quantities use the ingredient's own previous recipe as the scale
  //    reference (برجر 1.5↔120ج ⇒ 80ج/قطعة، كفتة 4↔120ج ⇒ 30ج، كوردن بلو
  //    3↔140ج ≈ 46.7ج، كرنشي 2.5↔120ج ⇒ 48ج); بانيه keeps its new قطعة unit.
  //  • spelling variants point at the stock row that actually exists:
  //    موتزريلا→موزاريلا، رومي→رومي مبشور، كاتشب 12ج→1 ظرف، بطاطس→بطاطس
  //    كريسبي، شاورما→استربس بارد، ثاوثند ايلاند→ألف جزيرة، خص→خس، توابل
  //    ناشفل→توابل. شاورما recipes use مايونيز كلاسيك (the store's convention).
  const recipesData: [string, string, string | null, number, string | null][] = []
  let recN = 1
  const addRecipe = (pid: string, iid: string, qty: number) => recipesData.push([`rec-${recN++}`, pid, iid, qty, null])
  // One unit of a sub-recipe (e.g. a dough piece) per product.
  const addSub = (pid: string, subRecipeId: string, qty: number) => recipesData.push([`rec-${recN++}`, pid, null, qty, subRecipeId])
  const fill = (pid: string, rows: [string, number][]) => { for (const [iid, q] of rows) addRecipe(pid, iid, q) }

  const CRISPY_SIDE = [['ing-crispy-potato', 150]] as [string, number][]

  // كريب لحوم
  fill('m1', [['ing-burger', 120], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-pickles', 10], ['ing-pepperoni', 20], ['ing-texas', 20], ['ing-cheddar', 30], ['ing-lettuce', 20]])
  fill('m2', [['ing-hotdog', 150], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper', 15], ['ing-onion', 15], ['ing-bbq', 12], ['ing-mayo', 12]])
  fill('m3', [['ing-sausage', 150], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper-mix', 15], ['ing-onion', 15], ['ing-tomato', 15], ['ing-pomegranate', 20], ['ing-mayo', 12]])
  fill('m4', [['ing-kofta', 120], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper', 10], ['ing-onion', 10], ['ing-teriyaki', 20], ['ing-mayo', 12]])

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
  // c1/c2 ← «كرنشي حار» (اختيار نوع اللحوم عبر الموديفاير؛ البارد نفس الوصفة
  // بالكرنشي البارد). c3/c4 ← «زنجر حار أو بارد» + صلصة الـ preparation
  // (حار→تايجر، بارد→كاتشب) والاستربس عبر موديفاير 200ج.
  fill('c1', [['ing-crunchy-hot', 120], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper', 10], ['ing-lettuce', 20], ['ing-ketchup', 1], ['ing-mayo', 12]])
  fill('c2', [['ing-crunchy-cold', 120], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper', 10], ['ing-lettuce', 20], ['ing-ketchup', 1], ['ing-mayo', 12]])
  fill('c3', [['ing-turkey', 12], ['ing-beef', 12], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper', 10], ['ing-lettuce', 20], ['ing-texas', 12], ['ing-cheddar', 20], ['ing-tiger', 12]])
  fill('c4', [['ing-turkey', 12], ['ing-beef', 12], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper', 10], ['ing-lettuce', 20], ['ing-texas', 12], ['ing-cheddar', 20], ['ing-ketchup', 1]])
  fill('c5', [['ing-cordon-blue', 140], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper', 10], ['ing-ketchup', 1], ['ing-mayo', 12], ['ing-cheddar', 30], ['ing-lettuce', 20]])
  fill('c6', [['ing-breast-marinated', 240], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper', 10], ['ing-lettuce', 20], ['ing-ketchup', 1], ['ing-mayo', 12]])
  fill('c7', [['ing-shish', 120], ['ing-mozzarella', 20], ['ing-bbq', 15]])
  fill('c8', [['ing-shawarma-cold', 170], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-pepper', 10], ['ing-onion', 10], ['ing-mayo-classic', 12]])
  fill('c9', [['ing-chicken-breast', 180], ['ing-mushroom', 50], ['ing-fajita-sauce', 12], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-mayo', 12]])
  fill('c10', [['ing-shawarma-hot', 220], ['ing-mozzarella', 50], ['ing-pickles', 10], ['ing-ranch', 20], ['ing-buffalo', 35], ['ing-lettuce', 20], ['ing-spices', 3]])

  // السوري — كل الأصناف الـ 11 من ملف الوصفات (سورى→سوري spelling)
  fill('s1', [['ing-crispy-potato', 120], ['ing-ketchup', 1]])
  fill('s2', [['ing-crispy-potato', 120], ['ing-mozzarella', 30], ['ing-ketchup', 1]])
  fill('s3', [['ing-zinger', 120], ['ing-lettuce', 20], ['ing-ranch', 12]])
  fill('s4', [['ing-baniye', 2], ['ing-lettuce', 20], ['ing-ketchup', 1]])
  fill('s5', [['ing-kofta', 90], ['ing-mayo', 12], ['ing-tomato', 10]])
  fill('s6', [['ing-fajita', 100], ['ing-pepper', 10], ['ing-mushroom', 20], ['ing-fajita-sauce', 12], ['ing-mayo', 12]])
  fill('s7', [['ing-shawarma-cold', 100], ['ing-pepper', 10], ['ing-onion', 10], ['ing-mayo-classic', 12]])
  fill('s8', [['ing-shish', 90], ['ing-tomato', 10], ['ing-onion', 10], ['ing-balsamic', 12]])
  fill('s9', [['ing-baniye', 1.5], ['ing-crispy-potato', 80], ['ing-lettuce', 20], ['ing-ketchup', 1]])
  fill('s10', [['ing-crispy-potato', 70], ['ing-zinger', 80], ['ing-lettuce', 20], ['ing-ranch', 12]])
  fill('s11', [['ing-shawarma-cold', 80], ['ing-crispy-potato', 70], ['ing-onion', 10], ['ing-pepper', 10], ['ing-mayo-classic', 12]])

  // الميكسات — نوع اللحوم والاستربس اختيارات عبر الموديفايرز (شوف تحت).
  // برلين←برين، ستوكهولم←استوكهولم. mx6/mx7 مش في ملف الوصفات — بيفضلوا
  // بوصفاتهم القديمة.
  fill('mx1', [['ing-burger', 100], ['ing-chicken-breast', 70], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-onion', 10], ['ing-ketchup', 1], ['ing-mayo', 12], ['ing-cheddar', 30], ['ing-lettuce', 20]])
  fill('mx2', [['ing-hotdog', 60], ['ing-shish', 70], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-onion', 10], ['ing-pepper', 10], ['ing-ranch', 12], ['ing-cheddar', 30], ['ing-lettuce', 20]])
  fill('mx3', [['ing-shish', 80], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-ranch', 12], ['ing-harissa', 12]])
  fill('mx4', [['ing-hotdog', 50], ['ing-cordon-blue', 46.7], ['ing-shish', 60], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-texas', 12], ['ing-cheddar', 30], ['ing-lettuce', 20]])
  fill('mx5', [['ing-cordon-blue', 70], ['ing-chicken-breast', 70], ['ing-mozzarella', 50], ['ing-rome-cheese', 5], ['ing-olives', 5], ['ing-chicken-cold', 12], ['ing-ranch', 12], ['ing-cheddar', 30]])
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

  // Crepe dough — every crepe product draws one dough
  // piece (247.5 g) from the shared عجينة الكريب
  // sub-recipe below. The bought كريب الصالة /
  // كريب تيكتاواي wrappers stay in inventory as
  // stock on hand.
  for (const pid of ['m1', 'm2', 'm3', 'm4', 'b1', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']) addSub(pid, 'sub-crepe-dough', 1)
  // Waffles — one purchased waffle per Sweet (the batter base
  // stays as the from-scratch model on top).
  for (const pid of sweetsIds) addRecipe(pid, 'ing-waffle', 1)

  // Packing — each product draws its packaging:
  // fries in boxes (plain علب بطاطس vs مركب cheese
  // boxes), crepes/wraps in sandwich paper, sweets
  // and treats on butter paper, and a production-date
  // sticker + label disc on every sold item.
  for (const pid of ['bk1', 'bk2', 'b1', 's1', 's9', 's10', 's11']) addRecipe(pid, 'ing-potato-box', 1)
  for (const pid of ['bk3', 'bk4', 's2']) addRecipe(pid, 'ing-potato-box-mix', 1)
  for (const pid of [...meatIds, ...breakfastIds, ...chickenIds, ...syrianIds]) addRecipe(pid, 'ing-sandwich-paper', 1)
  for (const pid of [...sweetsIds, ...treatIds]) addRecipe(pid, 'ing-butter-paper', 1)
  for (const c of CATALOG) {
    for (const it of c.items) {
      addRecipe(it.id, 'ing-prod-sticker', 1)
      addRecipe(it.id, 'ing-sticky-disc', 1)
    }
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
  // ─── عجينة الكريب sub-recipe ───────────────────
  // The recipe book's dough: 12 pieces make 2,970 g,
  // so one unit of the sub-recipe (one crepe's dough)
  // draws 1/12 of each bulk quantity below. Created
  // before the recipes insert — recipes reference it.
  db.prepare('INSERT OR IGNORE INTO sub_recipes (id, name, unit, active, created_at) VALUES (?, ?, ?, 1, ?)')
    .run('sub-crepe-dough', 'عجينة الكريب', 'حبة', now)
  const doughRows: [string, number][] = [
    ['ing-flour', 83.33], ['ing-water', 141.67], ['ing-milk-powder', 5.83],
    ['ing-egg-white-powder', 8.33], ['ing-sugar', 2.5], ['ing-oil', 8.33],
    ['ing-butter', 4.17], ['ing-baking-powder', 0.83], ['ing-vanilla', 0.83],
  ]
  const insertDoughIng = db.prepare('INSERT OR IGNORE INTO sub_recipe_ingredients (id, sub_recipe_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)')
  for (const [iid, qty] of doughRows) insertDoughIng.run(`sri-crepe-${iid}`, 'sub-crepe-dough', iid, qty)

  const insertRecipe = db.prepare('INSERT OR IGNORE INTO recipes (id, product_id, ingredient_id, quantity_per_unit, sub_recipe_id) VALUES (?, ?, ?, ?, ?)')
  for (const r of recipesData) insertRecipe.run(r[0], r[1], r[2], r[3], r[4])

  // ─── Addon consumption recipes ──────────────────────────────
  // Portions follow the recipe book: sauces 12ج (the «إضافة صوص» standard),
  // proteins = the same-named product's portion, cheeses 50/30ج; مشروم 50ج
  // and بسطرمة 30ج come from the add-on sheet.
  const addonIdOf = (name: string) => {
    const row = addonData.find(a => a.name === name)
    if (!row) throw new Error(`seed: addon "${name}" missing from addonData`)
    return row.id
  }
  const addonRecipeData: [string, string, number][] = [
    ['بافلو', 'ing-buffalo', 12],
    ['بانيه', 'ing-baniye', 2],
    ['برجر', 'ing-burger', 120],
    ['بطاطس زيادة', 'ing-crispy-potato', 120],
    ['تكساس', 'ing-texas', 12],
    ['ثاوزنلاند', 'ing-chicken-cold', 12],
    ['زنجرحار', 'ing-zinger', 120],
    ['سجق', 'ing-sausage', 150],
    ['شاورما', 'ing-shawarma-cold', 170],
    ['شيدر', 'ing-cheddar', 30],
    ['شيش', 'ing-shish', 120],
    ['فاهيتا', 'ing-fajita', 100],
    ['كاتشب', 'ing-ketchup', 1],
    ['كرانش', 'ing-crunchy-cold', 120],
    ['كرنش', 'ing-crunchy-hot', 120],
    ['كفته', 'ing-kofta', 120],
    ['كوردن بلو', 'ing-cordon-blue', 140],
    ['مايونيز', 'ing-mayo', 12],
    ['مشوي صدور', 'ing-breast-marinated', 240],
    ['موتزريلا', 'ing-mozzarella', 50],
    ['ناشفل', 'ing-shawarma-hot', 220],
    ['هالبينو', 'ing-jalapeno', 12],
    ['هوت دوج', 'ing-hotdog', 150],
    ['باربكيو', 'ing-bbq', 12],
    ['رانش', 'ing-ranch', 12],
    ['ترياكي', 'ing-teriyaki', 12],
    ['صوص فاهيتا', 'ing-fajita-sauce', 12],
    ['صوص بلسمك', 'ing-balsamic', 12],
    ['هريسه', 'ing-harissa', 12],
    ['تايجر', 'ing-tiger', 12],
    ['دبس رمان', 'ing-pomegranate', 12],
    ['حريقة', 'ing-hot-sauce', 12],
    ['مسطردة', 'ing-mustard', 12],
    ['مشروم', 'ing-mushroom', 50],
    ['بسطرمة', 'ing-basturma', 30],
  ]
  const insertAR = db.prepare('INSERT OR IGNORE INTO addon_recipes (id, addon_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)')
  let arN = 1
  for (const [addonName, iid, qty] of addonRecipeData) insertAR.run(`ar-${arN++}`, addonIdOf(addonName), iid, qty)

  // ─── Modifier groups — اختيارات «أو» في ملف الوصفات ─────────
  // single-select: بطاقة المنتج بتفتح نافذة الاختيار (أول خيار محدد تلقائيًا)
  // والكاشير يقدر يغيّره؛ كل خيار بيجيب مكوّنه بنفسه، فالمخزون بيتخصم من
  // الاختيار الفعلي — «بيف أو تركى» و«استربس حار أو بارد» كده مش بيتقسّموا.
  // الأرقام في اسم الجروب = الكمية في الوصفة (الميكسات متفاوتة 110/120ج).
  const modifierData: {
    id: string; name: string
    options: { id: string; name: string; ing: string; qty: number }[]
    products: string[]
  }[] = [
    { id: 'mg-meat-12', name: 'نوع اللحوم 12ج', products: ['c1', 'c2'], options: [
      { id: 'mg-meat-12-turkey', name: 'تركي', ing: 'ing-turkey', qty: 12 },
      { id: 'mg-meat-12-beef', name: 'بيف', ing: 'ing-beef', qty: 12 },
    ] },
    { id: 'mg-meat-18', name: 'نوع اللحوم 18ج', products: ['mx2', 'mx3', 'mx4', 'mx5'], options: [
      { id: 'mg-meat-18-beef', name: 'بيف', ing: 'ing-beef', qty: 18 },
      { id: 'mg-meat-18-turkey', name: 'تركي', ing: 'ing-turkey', qty: 18 },
    ] },
    { id: 'mg-strips-110', name: 'نوع الاستربس 110ج', products: ['mx3', 'mx4'], options: [
      { id: 'mg-strips-110-hot', name: 'حار', ing: 'ing-shawarma-hot', qty: 110 },
      { id: 'mg-strips-110-cold', name: 'بارد', ing: 'ing-shawarma-cold', qty: 110 },
    ] },
    { id: 'mg-strips-120', name: 'نوع الاستربس 120ج', products: ['mx1', 'mx2', 'mx5'], options: [
      { id: 'mg-strips-120-hot', name: 'حار', ing: 'ing-shawarma-hot', qty: 120 },
      { id: 'mg-strips-120-cold', name: 'بارد', ing: 'ing-shawarma-cold', qty: 120 },
    ] },
    { id: 'mg-strips-200', name: 'نوع الاستربس 200ج', products: ['c3', 'c4'], options: [
      { id: 'mg-strips-200-hot', name: 'حار', ing: 'ing-shawarma-hot', qty: 200 },
      { id: 'mg-strips-200-cold', name: 'بارد', ing: 'ing-shawarma-cold', qty: 200 },
    ] },
  ]
  const insertMG = db.prepare('INSERT OR IGNORE INTO modifier_groups (id, name, type, sort_order, active) VALUES (?, ?, ?, ?, 1)')
  const insertMod = db.prepare('INSERT OR IGNORE INTO modifiers (id, modifier_group_id, name, price_adjustment, sort_order, active) VALUES (?, ?, ?, 0, ?, 1)')
  const insertPMG = db.prepare('INSERT OR IGNORE INTO product_modifier_groups (product_id, modifier_group_id) VALUES (?, ?)')
  const insertMR = db.prepare('INSERT OR IGNORE INTO modifier_recipes (id, modifier_id, ingredient_id, quantity_per_unit) VALUES (?, ?, ?, ?)')
  let mrN = 1
  modifierData.forEach((g, gi) => {
    insertMG.run(g.id, g.name, 'single-select', gi)
    g.options.forEach((o, oi) => {
      insertMod.run(o.id, g.id, o.name, oi)
      insertMR.run(`mr-${mrN++}`, o.id, o.ing, o.qty)
    })
    for (const pid of g.products) insertPMG.run(pid, g.id)
  })

  // ─── Link addons to products ───
  // Every made-to-order department carries the full
  // topping/side list; drinks, sweets and treats stay addon-free.
  const insertPA = db.prepare('INSERT OR IGNORE INTO product_addons (product_id, addon_id) VALUES (?, ?)')
  for (const pid of [...crepeIds, ...bucketIds]) for (const a of addonData) insertPA.run(pid, a.id)
}
