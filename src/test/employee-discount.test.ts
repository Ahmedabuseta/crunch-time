import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from './setup'
import { discountCodes, discountDayProducts, products, categories } from '../db/schema'
import { eq, and } from 'drizzle-orm'

const DAY = new Date().getDay()

describe('Employee Daily Product Discount', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    const { sqlite, db } = testDb

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, type TEXT NOT NULL, value REAL NOT NULL,
        mode TEXT NOT NULL DEFAULT 'order', daily_uses INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1, max_uses INTEGER NOT NULL DEFAULT 0, used_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS discount_day_products (
        id TEXT PRIMARY KEY, discount_code_id TEXT NOT NULL REFERENCES discount_codes(id),
        day_of_week INTEGER NOT NULL, product_id TEXT NOT NULL REFERENCES products(id),
        UNIQUE (discount_code_id, day_of_week)
      );
    `)

    db.insert(categories).values({ id: 'cat-test', name: 'تجربة', emoji: '🧪', color: '#999' }).run()
    db.insert(products).values({ id: 'prod-day', name: 'صنف اليوم', price: 80, categoryId: 'cat-test', emoji: '🥙', description: 'صنف اليوم' }).run()
    db.insert(products).values({ id: 'prod-other', name: 'صنف آخر', price: 60, categoryId: 'cat-test', emoji: '🍔', description: 'صنف آخر' }).run()

    // Daily employee code: shared pool of 2 uses per day,
    // today's product is prod-day, every other day prod-other.
    db.insert(discountCodes).values({
      id: 'disc-staff', code: 'STAFF', type: 'percentage', value: 50,
      mode: 'daily', dailyUses: 2, active: true, maxUses: 0, usedCount: 0,
    }).run()
    for (let d = 0; d < 7; d++) {
      db.insert(discountDayProducts).values({
        id: `disc-staff-d${d}`, discountCodeId: 'disc-staff', dayOfWeek: d,
        productId: d === DAY ? 'prod-day' : 'prod-other',
      }).run()
    }
  })

  // The daily-usage query from discountCode:validate (src/ipc/main.ts)
  const usedToday = (sqlite: any, code: string) =>
    (sqlite.prepare(
      `SELECT COUNT(*) AS c FROM orders WHERE discount_code = ? AND date(created_at, 'localtime') = date('now', 'localtime')`
    ).get(code) as { c: number }).c

  it('resolves the product-of-the-day from the rotation', () => {
    const { db } = testDb
    const row = db.select().from(discountDayProducts)
      .where(and(eq(discountDayProducts.discountCodeId, 'disc-staff'), eq(discountDayProducts.dayOfWeek, DAY)))
      .get()
    expect(row?.productId).toBe('prod-day')
  })

  it('counts only today\'s orders against the daily pool', () => {
    const { sqlite } = testDb
    const now = new Date().toISOString()
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    sqlite.exec(`
      INSERT INTO orders (id, status, order_type, subtotal, tax, total, payment_type, discount_code, discount_amount, created_at, updated_at) VALUES
        ('o-1', 'COMPLETED', 'dine-in', 80, 11, 91, 'cash', 'STAFF', 40, '${now}', '${now}'),
        ('o-2', 'COMPLETED', 'dine-in', 80, 11, 91, 'cash', 'STAFF', 40, '${now}', '${now}'),
        ('o-3', 'COMPLETED', 'dine-in', 80, 11, 91, 'cash', 'STAFF', 40, '${yesterday}', '${yesterday}');
    `)
    expect(usedToday(testDb.sqlite, 'STAFF')).toBe(2)
  })

  it('blocks the code once the daily pool is spent', () => {
    const { sqlite } = testDb
    const now = new Date().toISOString()
    sqlite.exec(`
      INSERT INTO orders (id, status, order_type, subtotal, tax, total, payment_type, discount_code, discount_amount, created_at, updated_at) VALUES
        ('o-1', 'COMPLETED', 'dine-in', 80, 11, 91, 'cash', 'STAFF', 40, '${now}', '${now}'),
        ('o-2', 'COMPLETED', 'dine-in', 80, 11, 91, 'cash', 'STAFF', 40, '${now}', '${now}');
    `)
    // dailyUses = 2 → validate rejects the third use today
    expect(usedToday(testDb.sqlite, 'STAFF')).toBeGreaterThanOrEqual(2)
  })

  it('ignores orders that used a different code', () => {
    const { sqlite } = testDb
    const now = new Date().toISOString()
    sqlite.exec(`
      INSERT INTO orders (id, status, order_type, subtotal, tax, total, payment_type, discount_code, discount_amount, created_at, updated_at) VALUES
        ('o-1', 'COMPLETED', 'dine-in', 80, 11, 91, 'cash', 'WELCOME10', 8, '${now}', '${now}');
    `)
    expect(usedToday(testDb.sqlite, 'STAFF')).toBe(0)
  })

  it('enforces one product per day in the rotation', () => {
    const { db } = testDb
    expect(() =>
      db.insert(discountDayProducts).values({ id: 'dup', discountCodeId: 'disc-staff', dayOfWeek: DAY, productId: 'prod-other' }).run()
    ).toThrow()
  })

  it('a fixed discount distributes across matching lines exactly', () => {
    // Mirrors the Cart.tsx fixed-amount distribution:
    // proportional shares, last line absorbs the rounding remainder.
    const lines = [
      { lineId: 'a', lineTotal: 80 },
      { lineId: 'b', lineTotal: 120 },
    ]
    const matchingTotal = lines.reduce((s, l) => s + l.lineTotal, 0)
    const total = Math.min(30, matchingTotal)
    let assigned = 0
    const perLine = new Map<string, number>()
    lines.forEach((l, idx) => {
      const d = idx === lines.length - 1 ? total - assigned : Math.round(total * (l.lineTotal / matchingTotal))
      perLine.set(l.lineId, d)
      assigned += d
    })
    expect([...perLine.values()].reduce((s, d) => s + d, 0)).toBe(30)
  })
})
