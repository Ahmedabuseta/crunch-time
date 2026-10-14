// Users.
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { hashPin, verifyPin as verifyPinHash } from '../lib/auth'
import { now, uuid } from './shared'
import { getUser, requireAdmin } from './session'
import { hardDelete } from './shared'

const { users } = schema

export function listUsers() {
  const db = getDb()
  return db.select({ id: users.id, name: users.name, role: users.role, active: users.active, createdAt: users.createdAt, hourlyRate: users.hourlyRate, commissionRate: users.commissionRate })
    .from(users).where(eq(users.active, true))
}

// Admin passwords must be complex — 8+ characters,
// not digits only. Cashiers keep their quick 4-digit PINs.
function weakAdminPin(pin: string, role: string): string | null {
  if (role !== 'admin') return null
  if (pin.length < 8) return 'كلمة سر المدير لازم تكون 8 حروف أو أكثر'
  if (/^\d+$/.test(pin)) return 'كلمة سر المدير لازم تحتوي حروف، مش أرقام بس'
  return null
}

export async function createUser(data: any) {
  requireAdmin()
  const db = getDb()
  const weak = weakAdminPin(data.pin, data.role || 'cashier')
  if (weak) return { ok: false, error: weak }
  const id = uuid()
  const pinHash = await hashPin(data.pin)
  db.insert(users).values({ id, name: data.name, pinHash, role: data.role || 'cashier', active: true, createdAt: now(), hourlyRate: data.hourlyRate || 0, commissionRate: data.commissionRate || 0 }).run()
  return { id }
}

export async function updateUser(id: string, data: any) {
  requireAdmin()
  const db = getDb()
  const update: any = { name: data.name, role: data.role }
  if (data.pin) {
    const weak = weakAdminPin(data.pin, data.role)
    if (weak) return { ok: false, error: weak }
    update.pinHash = await hashPin(data.pin)
  }
  if (data.hourlyRate !== undefined) update.hourlyRate = Number(data.hourlyRate) || 0
  if (data.commissionRate !== undefined) update.commissionRate = Number(data.commissionRate) || 0
  db.update(users).set(update).where(eq(users.id, id)).run()
  return { ok: true }
}

export function deleteUser(id: string, opts?: { hard?: boolean }) {
  requireAdmin()
  const db = getDb()
  const user = db.select({ id: users.id, role: users.role, active: users.active }).from(users).where(eq(users.id, id)).get()
  if (!user) return { ok: false, error: 'المستخدم غير موجود' }
  if (!user.active) return { ok: false, error: 'المستخدم معطل بالفعل' }
  if (getUser()?.id === id) return { ok: false, error: 'لا يمكن حذف المستخدم الحالي أثناء الجلسة' }
  if (user.role === 'admin') {
    const activeAdmins = db.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.active, true))).all()
    if (activeAdmins.length <= 1) {
      return { ok: false, error: 'لا يمكن حذف آخر مدير في النظام' }
    }
  }
  if (opts?.hard) {
    return hardDelete('users', id, [
      { countSql: 'SELECT COUNT(*) FROM orders WHERE user_id = ?', label: 'طلبات سابقة' },
      { countSql: 'SELECT COUNT(*) FROM shifts WHERE user_id = ?', label: 'ورديات' },
    ])
  }
  db.update(users).set({ active: false }).where(eq(users.id, id)).run()
  return { ok: true }
}

export async function verifyPin(id: string, pin: string) {
  const db = getDb()
  const user = db.select().from(users).where(eq(users.id, id)).get()
  if (!user) return { ok: false, error: 'المستخدم غير موجود' }
  const valid = await verifyPinHash(user.pinHash, pin)
  if (!valid) return { ok: false, error: 'الرقم السري غلط' }
  return { ok: true, user: { id: user.id, name: user.name, role: user.role } }
}
