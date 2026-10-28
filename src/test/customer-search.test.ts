// Delivery autocomplete: typing the mobile number finds saved customers and,
// when they have a previous delivery, fills the zone and driver too.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'customer-search-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
}))

const { runMigrations } = await import('../db/migrate')
const { getSqlite, closeSqlite } = await import('../db/client')
const { searchCustomers } = await import('../backend/customers')

beforeAll(() => {
  runMigrations()
  const s = getSqlite()
  s.prepare("INSERT INTO delivery_zones (id, name, fee, sort_order, active) VALUES ('dz-1', 'قريب', 25, 0, 1)").run()
  s.prepare("INSERT INTO delivery_profiles (id, name, phone, active) VALUES ('dp-1', 'أحمد', '0100', 1)").run()
  s.prepare(
    `INSERT INTO customers (id, phone, name, address, order_count, last_order_at, created_at)
     VALUES ('c1', '01001234567', 'محمد', 'شارع 1', 2, '2026-01-02T10:00:00.000Z', '2026-01-01T10:00:00.000Z')`,
  ).run()
  // The order stores the phone as the cashier typed it (with spaces) — the
  // search must still match the normalized customer phone.
  s.prepare(
    `INSERT INTO orders (id, status, order_type, customer_phone, customer_name, customer_address,
                         delivery_zone_id, delivery_zone_name, delivery_profile_id, delivery_profile_name,
                         subtotal, tax, total, created_at, updated_at)
     VALUES ('o1', 'COMPLETED', 'delivery', '0100 123 4567', 'محمد', 'شارع 1',
             'dz-1', 'قريب', 'dp-1', 'أحمد', 0, 0, 0, '2026-01-02T10:00:00.000Z', '2026-01-02T10:00:00.000Z')`,
  ).run()
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('delivery customer search', () => {
  it('finds a saved mobile number with its last delivery details', () => {
    const rows = searchCustomers('0100')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      phone: '01001234567',
      name: 'محمد',
      address: 'شارع 1',
      orderCount: 2,
      lastZoneId: 'dz-1',
      lastZoneName: 'قريب',
      lastProfileId: 'dp-1',
      lastProfileName: 'أحمد',
    })
  })

  it('ignores searches shorter than three digits', () => {
    expect(searchCustomers('01')).toEqual([])
    expect(searchCustomers('')).toEqual([])
  })
})
