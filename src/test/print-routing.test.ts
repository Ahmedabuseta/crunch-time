// Shared-department print routing — drives the REAL IPC handlers
// (src/ipc/main.ts) through a mocked ipcMain against a throwaway database.
//
// A department may be assigned to several stations, so several printers can
// serve it; every owning station gets the item, stations with nothing to cook
// stay silent, and one physical printer still can't be claimed twice.
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'print-routing-test-'))
const handlers = new Map<string, (e: any, ...args: any[]) => any>()

const PRINTERS = [
  { name: 'Printer A' },
  { name: 'Printer B' },
  { name: 'Printer C' },
]

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) },
  BrowserWindow: class MockWindow {},
}))

const { registerIpcHandlers } = await import('../ipc/main')
const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite } = await import('../db/client')
const { collectKitchenItems, markKitchenTicketItems } = await import('../lib/print')

// Station handlers ask the sender for the live printer list before saving.
const call = async (channel: string, ...args: any[]) => {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler: ${channel}`)
  return fn({ sender: { getPrintersAsync: async () => PRINTERS } }, ...args)
}

let stationA = ''
let stationB = ''
let stationC = ''
let orderId = ''

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  registerIpcHandlers()
  await call('session:setUser', { id: 'user-admin', role: 'admin' })
})

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('station routing with shared departments', () => {
  it('assigns the same department to two stations with two printers', async () => {
    // Regression: this used to throw «القسم مرتبط بالفعل بمحطة…».
    const a = await call('station:create', {
      name: 'مطبخ أ', printerName: 'Printer A', paperWidth: '80mm', categoryIds: ['meat_crepe'],
    })
    const b = await call('station:create', {
      name: 'مطبخ ب', printerName: 'Printer B', paperWidth: '80mm', categoryIds: ['meat_crepe'],
    })
    expect(a.id).toBeTruthy()
    expect(b.id).toBeTruthy()
    stationA = a.id
    stationB = b.id
  })

  it('still refuses one physical printer on two stations', async () => {
    await expect(call('station:create', {
      name: 'مطبخ ج', printerName: 'Printer A', categoryIds: ['drinks'],
    })).rejects.toThrow('محطة')
  })

  it('still refuses the same department twice inside one station', async () => {
    await expect(call('station:create', {
      name: 'تكرار', printerName: 'Printer C', categoryIds: ['drinks', 'drinks'],
    })).rejects.toThrow('تكرار')
  })

  it('routes a one-item order to both sharing stations and skips empty ones', async () => {
    const c = await call('station:create', {
      name: 'مشروبات', printerName: 'Printer C', paperWidth: '80mm', categoryIds: ['drinks'],
    })
    stationC = c.id

    const user = getSqlite().prepare('SELECT id FROM users LIMIT 1').get() as { id: string }
    await call('shift:open', { userId: user.id, openingCash: 0 })
    // Seeded prices live at 0 (the owner sets them), so use fixed amounts —
    // order:create doesn't validate unit prices against the menu.
    const prod = getSqlite().prepare(
      "SELECT id FROM products WHERE category_id = 'meat_crepe' LIMIT 1",
    ).get() as { id: string }

    const order = await call('order:create', {
      orderType: 'dine-in',
      subtotal: 100,
      tax: 0,
      deliveryFee: 0,
      total: 100,
      paymentType: 'cash',
      items: [{ productId: prod.id, quantity: 1, unitPrice: 100 }],
    })
    orderId = order.id

    const routed = await call('station:routeOrder', orderId)
    expect(routed.routes.map((r: any) => r.station.id).sort()).toEqual([stationA, stationB].sort())
    for (const r of routed.routes) {
      expect(r.items).toHaveLength(1)
      expect(r.items[0].productId).toBe(prod.id)
    }
    // The drinks station owns no item of this order → it prints nothing.
    expect(routed.routes.find((r: any) => r.station.id === stationC)).toBeUndefined()
    expect(routed.unrouted).toHaveLength(0)
  })

  it('lists a shared item once per ticket and highlights it at both stations', async () => {
    const routed = await call('station:routeOrder', orderId)
    const items = collectKitchenItems(routed.routes, routed.unrouted)
    expect(items).toHaveLength(1)

    for (const r of routed.routes) {
      const marked = markKitchenTicketItems(items, r.items)
      expect(marked).toHaveLength(1)
      expect(marked[0].kitchenHighlight).toBe(true)
    }
  })
})
