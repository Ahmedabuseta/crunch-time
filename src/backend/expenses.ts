// Expenses.
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { uuid } from './shared'
import { requireAdmin } from './session'
import { hardDelete } from './shared'

const { expenses } = schema

export function listExpenses() {
  const db = getDb()
  return db.select().from(expenses).where(eq(expenses.active, true))
}

export function createExpense(data: any) {
  requireAdmin()
  const db = getDb()
  const id = uuid()
  db.insert(expenses).values({ id, ...data, active: true }).run()
  return { id }
}

export function updateExpense(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  db.update(expenses).set(data).where(eq(expenses.id, id)).run()
  return { ok: true }
}

export function deleteExpense(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  if (opts?.hard) return hardDelete('expenses', id)
  const row = db.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, id)).get()
  if (!row) return { ok: false, error: 'المصروف غير موجود' }
  db.update(expenses).set({ active: false }).where(eq(expenses.id, id)).run()
  return { ok: true }
}

export function totalMonthlyExpenses() {
  const db = getDb()
  const result = db.select({ total: sql`COALESCE(SUM(${expenses.amount}), 0)` })
    .from(expenses).where(and(eq(expenses.active, true), eq(expenses.type, 'monthly'))).get()
  return result?.total || 0
}
