// Users.
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import * as schema from '../db/schema'
import { hashPin, verifyPin as verifyPinHash } from '../lib/auth'
import { now, uuid } from './shared'
import { getUser, requireAdmin } from './session'
import { hardDelete } from './shared'

const { users } = schema

/**
 * The public shape of a user. Deliberately a projection, not `select()`: the
 * row also holds the pin hash, and that must never leave the server — the
 * desktop's IPC and the phone's HTTP both read users through these functions.
 */
const USER_COLUMNS = {
  id: users.id,
  name: users.name,
  role: users.role,
  active: users.active,
  createdAt: users.createdAt,
  hourlyRate: users.hourlyRate,
  commissionRate: users.commissionRate,
}

export function listUsers() {
  const db = getDb()
  return db.select(USER_COLUMNS).from(users).where(eq(users.active, true))
}

/** Sortable user fields. */
export const USER_SORTS = {
  name: users.name,
  createdAt: users.createdAt,
  role: users.role,
} as const

export type UserSortKey = keyof typeof USER_SORTS

export function listUsersPaged(options: {
  search?: string
  role?: string
  limit: number
  offset: number
  sort?: UserSortKey
  dir?: 'asc' | 'desc'
}) {
  const db = getDb()
  const conditions = [eq(users.active, true)]
  if (options.role) conditions.push(eq(users.role, options.role))
  if (options.search) {
    conditions.push(sql`LOWER(${users.name}) LIKE ${`%${options.search.toLowerCase()}%`}`)
  }
  const where = and(...conditions)

  const total = Number(
    db.select({ count: sql<number>`COUNT(*)` }).from(users).where(where).get()?.count ?? 0
  )
  const column = USER_SORTS[options.sort ?? 'name']
  const items = db.select(USER_COLUMNS).from(users).where(where)
    // Tiebroken by id, so two people with the same name cannot make page 2
    // repeat a row from page 1.
    .orderBy(options.dir === 'desc' ? desc(column) : asc(column), asc(users.id))
    .limit(options.limit)
    .offset(options.offset)
    .all() as any[]

  return { items, total }
}

/** One user, for the edit form — which otherwise had to download the whole list
 * and search it, and would miss the record once the list pages. */
export function getUserById(id: string) {
  const db = getDb()
  return db.select(USER_COLUMNS).from(users).where(eq(users.id, id)).get() ?? null
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
