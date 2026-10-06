import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from './setup'
import { discountCodes, expenses } from '../db/schema'
import { eq } from 'drizzle-orm'

describe('Discount Codes & Expenses Management', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    const { sqlite } = testDb

    // Create tables for test
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        max_uses INTEGER NOT NULL DEFAULT 0,
        used_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL DEFAULT 'monthly',
        active INTEGER NOT NULL DEFAULT 1
      );
    `)

    sqlite.exec(`
      INSERT INTO discount_codes (id, code, type, value, active, max_uses, used_count)
      VALUES
        ('disc-1', 'WELCOME10', 'percentage', 10, 1, 100, 0),
        ('disc-2', 'SAVE20', 'fixed', 20, 1, 50, 2),
        ('disc-3', 'FIVE', 'fixed', 5, 1, 0, 0);

      INSERT INTO expenses (id, name, category, amount, type, active)
      VALUES
        ('exp-1', 'كهرباء', 'مرافق', 2000, 'monthly', 1),
        ('exp-2', 'غاز', 'مرافق', 500, 'monthly', 1),
        ('exp-3', 'رواتب الموظفين', 'رواتب', 15000, 'monthly', 1);
    `)
  })

  it('should update discount code details', () => {
    const { db } = testDb

    db.update(discountCodes)
      .set({ code: 'WELCOME15', value: 15, maxUses: 200 })
      .where(eq(discountCodes.id, 'disc-1'))
      .run()

    const updated = db.select().from(discountCodes).where(eq(discountCodes.id, 'disc-1')).get()
    expect(updated?.code).toBe('WELCOME15')
    expect(updated?.value).toBe(15)
    expect(updated?.maxUses).toBe(200)
  })

  it('should toggle discount code active status', () => {
    const { db } = testDb

    // Deactivate
    db.update(discountCodes)
      .set({ active: false })
      .where(eq(discountCodes.id, 'disc-1'))
      .run()

    let row = db.select().from(discountCodes).where(eq(discountCodes.id, 'disc-1')).get()
    expect(row?.active).toBe(false)

    // Re-activate
    db.update(discountCodes)
      .set({ active: true })
      .where(eq(discountCodes.id, 'disc-1'))
      .run()

    row = db.select().from(discountCodes).where(eq(discountCodes.id, 'disc-1')).get()
    expect(row?.active).toBe(true)
  })

  it('should update expense details', () => {
    const { db } = testDb

    db.update(expenses)
      .set({ name: 'فاتورة الكهرباء المعدلة', amount: 2500, category: 'مرافق' })
      .where(eq(expenses.id, 'exp-1'))
      .run()

    const updated = db.select().from(expenses).where(eq(expenses.id, 'exp-1')).get()
    expect(updated?.name).toBe('فاتورة الكهرباء المعدلة')
    expect(updated?.amount).toBe(2500)
  })
})
