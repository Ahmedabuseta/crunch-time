import { describe, it, expect, beforeEach } from 'vitest'
import { eq, and, sql } from 'drizzle-orm'
import { createTestDb, seedTestData, createUserWithPin } from './setup'
import { randomUUID } from 'crypto'
import * as schema from '../db/schema'

const {
  categories, products, addons, modifierGroups, modifiers, productModifierGroups,
  orders, orderItems, payments, users, shifts, cashMovements,
  ingredients, recipes, inventoryTransactions,
} = schema

function uuid() { return randomUUID() }
function now() { return new Date().toISOString() }

describe('FastFood POS — Use Case Tests', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let sqlite: ReturnType<typeof createTestDb>['sqlite']

  beforeEach(() => {
    const testDb = createTestDb()
    db = testDb.db
    sqlite = testDb.sqlite
    seedTestData(db)
  })

  // ═══════════════════════════════════════════════════════════
  // USE CASE 1: Catalog browsing
  // ═══════════════════════════════════════════════════════════
  describe('UC1: Catalog — categories, products, modifiers, addons', () => {
    it('should list active categories', () => {
      const cats = db.select().from(categories).where(eq(categories.active, true)).all()
      expect(cats).toHaveLength(3)
      expect(cats[0].name).toBe('برجر')
    })

    it('should list products by category', () => {
      const burgers = db.select().from(products)
        .where(and(eq(products.active, true), eq(products.categoryId, 'cat-burgers')))
        .all()
      expect(burgers).toHaveLength(2)
      expect(burgers.map(p => p.name)).toContain('برجر كلاسيك')
    })

    it('should get modifier groups for a product', () => {
      const groups = db.select({
        groupId: modifierGroups.id, groupName: modifierGroups.name, groupType: modifierGroups.type,
      }).from(modifierGroups)
        .innerJoin(productModifierGroups, eq(modifierGroups.id, productModifierGroups.modifierGroupId))
        .where(eq(productModifierGroups.productId, 'prod-burger'))
        .all()

      expect(groups).toHaveLength(1)
      expect(groups[0].groupName).toBe('الحجم')

      const mods = db.select().from(modifiers)
        .where(eq(modifiers.modifierGroupId, 'grp-size'))
        .all()
      expect(mods).toHaveLength(2)
      expect(mods.find(m => m.name === 'كبير')?.priceAdjustment).toBe(30)
    })

    it('should list all active addons', () => {
      const allAddons = db.select().from(addons).where(eq(addons.active, true)).all()
      expect(allAddons).toHaveLength(2)
      expect(allAddons.find(a => a.name === 'جبنة إضافية')?.price).toBe(5)
    })
  })

  // ═══════════════════════════════════════════════════════════
  // USE CASE 2: Full order lifecycle
  // ═══════════════════════════════════════════════════════════
  describe('UC2: Order lifecycle — DRAFT → PAID → PREPARING → READY → COMPLETED', () => {
    it('should create an order with items, record payment, and track status', () => {
      const orderId = '#100001'
      const ts = now()

      // Create order (DRAFT)
      db.insert(orders).values({
        id: orderId, status: 'DRAFT', orderType: 'dine-in', tableNumber: '5',
        subtotal: 200, tax: 28, deliveryFee: 0, total: 228,
        userId: 'user-admin', shiftId: null, createdAt: ts, updatedAt: ts,
      }).run()

      // Add items
      db.insert(orderItems).values({
        id: uuid(), orderId, productId: 'prod-burger', quantity: 1, unitPrice: 85,
        selectedModifiersJson: JSON.stringify([{ groupId: 'grp-size', modifierId: 'mod-large', name: 'كبير', priceAdjustment: 30 }]),
        selectedAddonsJson: JSON.stringify(['addon-cheese']),
      }).run()
      db.insert(orderItems).values({
        id: uuid(), orderId, productId: 'prod-cola', quantity: 2, unitPrice: 20,
      }).run()

      // Verify items
      const items = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all()
      expect(items).toHaveLength(2)

      // Transition to PAID
      db.update(orders).set({ status: 'PAID', updatedAt: now() }).where(eq(orders.id, orderId)).run()

      // Record payment (split: cash + card)
      db.insert(payments).values({ id: uuid(), orderId, method: 'cash', amount: 150, createdAt: now() }).run()
      db.insert(payments).values({ id: uuid(), orderId, method: 'card', amount: 78, createdAt: now() }).run()

      const totalPaid = db.select({ total: sql`COALESCE(SUM(${payments.amount}), 0)` })
        .from(payments).where(eq(payments.orderId, orderId)).get()
      expect(totalPaid?.total).toBe(228)

      // PREPARING → READY → COMPLETED
      for (const status of ['PREPARING', 'READY', 'COMPLETED']) {
        db.update(orders).set({ status, updatedAt: now() }).where(eq(orders.id, orderId)).run()
      }

      const final = db.select().from(orders).where(eq(orders.id, orderId)).get()
      expect(final?.status).toBe('COMPLETED')
    })

    it('should never hard-delete orders — only CANCELLED status', () => {
      const orderId = '#100002'
      db.insert(orders).values({
        id: orderId, status: 'PAID', orderType: 'dine-in',
        subtotal: 85, tax: 11.9, total: 96.9,
        createdAt: now(), updatedAt: now(),
      }).run()

      // Cancel instead of delete
      db.update(orders).set({ status: 'CANCELLED', updatedAt: now() }).where(eq(orders.id, orderId)).run()

      const order = db.select().from(orders).where(eq(orders.id, orderId)).get()
      expect(order).toBeDefined()
      expect(order?.status).toBe('CANCELLED')
    })
  })

  // ═══════════════════════════════════════════════════════════
  // USE CASE 3: Inventory — recipe-based deduction
  // ═══════════════════════════════════════════════════════════
  describe('UC3: Inventory — recipe-based stock deduction', () => {
    it('should deduct ingredients based on recipe when order is placed', () => {
      const beefBefore = db.select().from(ingredients).where(eq(ingredients.id, 'ing-beef')).get()
      const breadBefore = db.select().from(ingredients).where(eq(ingredients.id, 'ing-bread')).get()
      expect(beefBefore?.stockQuantity).toBe(5000)
      expect(breadBefore?.stockQuantity).toBe(100)

      // Create order with 2 burgers
      const orderId = '#200001'
      db.insert(orders).values({
        id: orderId, status: 'PAID', orderType: 'dine-in',
        subtotal: 170, tax: 23.8, total: 193.8,
        createdAt: now(), updatedAt: now(),
      }).run()
      db.insert(orderItems).values({
        id: uuid(), orderId, productId: 'prod-burger', quantity: 2, unitPrice: 85,
      }).run()

      // Deduct inventory (simulate what IPC handler does)
      const items = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all()
      expect(items).toHaveLength(1) // verify items exist
      for (const item of items) {
        const recipeItems = db.select().from(recipes).where(eq(recipes.productId, item.productId)).all()
        expect(recipeItems.length).toBeGreaterThan(0) // verify recipes exist
        for (const r of recipeItems) {
          const deduction = r.quantityPerUnit * item.quantity
          const updateResult = sqlite.prepare('UPDATE ingredients SET stock_quantity = stock_quantity - ? WHERE id = ?').run(deduction, r.ingredientId!)
          expect(updateResult.changes).toBe(1) // verify update happened
          db.insert(inventoryTransactions).values({
            id: uuid(), ingredientId: r.ingredientId!, type: 'CONSUMPTION',
            quantity: -deduction, referenceOrderId: orderId, note: `consumption for ${orderId}`, createdAt: now(),
          }).run()
        }
      }

      // Verify: 2 burgers × 150g beef = 300g deducted
      const beefAfter = sqlite.prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get('ing-beef') as any
      expect(beefAfter?.stock_quantity).toBe(4700) // 5000 - 300

      // Verify: 2 burgers × 1 bread = 2 deducted
      const breadAfter = sqlite.prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get('ing-bread') as any
      expect(breadAfter?.stock_quantity).toBe(98) // 100 - 2

      // Verify transactions recorded
      const txns = db.select().from(inventoryTransactions)
        .where(eq(inventoryTransactions.referenceOrderId, orderId)).all()
      expect(txns).toHaveLength(2) // beef + bread
    })

    it('should detect low-stock alerts', () => {
      // Set beef to below min_stock
      db.update(ingredients).set({ stockQuantity: 400 }).where(eq(ingredients.id, 'ing-beef')).run()

      const alerts = db.select().from(ingredients)
        .where(and(eq(ingredients.active, true), sql`${ingredients.stockQuantity} <= ${ingredients.minStock}`))
        .all()

      expect(alerts).toHaveLength(1)
      expect(alerts[0].name).toBe('لحم بقري')
      expect(alerts[0].stockQuantity).toBeLessThanOrEqual(alerts[0].minStock)
    })

    it('should restock ingredients', () => {
      db.update(ingredients).set({ stockQuantity: 100 }).where(eq(ingredients.id, 'ing-beef')).run()

      // Restock 5000g
      const restockQty = 5000
      sqlite.prepare('UPDATE ingredients SET stock_quantity = stock_quantity + ? WHERE id = ?').run(restockQty, 'ing-beef')
      db.insert(inventoryTransactions).values({
        id: uuid(), ingredientId: 'ing-beef', type: 'PURCHASE', quantity: restockQty,
        note: 'restock', createdAt: now(),
      }).run()

      const after = db.select().from(ingredients).where(eq(ingredients.id, 'ing-beef')).get()
      expect(after?.stockQuantity).toBe(5100)
    })
  })

  // ═══════════════════════════════════════════════════════════
  // USE CASE 4: Shifts + Cash drawer reconciliation
  // ═══════════════════════════════════════════════════════════
  describe('UC4: Shifts + Cash drawer — open, movements, reconcile, close', () => {
    it('should open a shift, record cash movements, and reconcile', () => {
      // Open shift with 1000 EGP
      const shiftId = uuid()
      db.insert(shifts).values({
        id: shiftId, userId: 'user-admin', startedAt: now(), openingCash: 1000, status: 'open',
      }).run()
      db.insert(cashMovements).values({
        id: uuid(), shiftId, type: 'OPENING', amount: 1000, note: 'فتح الوردية', createdAt: now(),
      }).run()

      // Simulate cash sales
      db.insert(cashMovements).values({ id: uuid(), shiftId, type: 'SALE', amount: 850, createdAt: now() }).run()
      db.insert(cashMovements).values({ id: uuid(), shiftId, type: 'SALE', amount: 420, createdAt: now() }).run()
      // Cash in from customer
      db.insert(cashMovements).values({ id: uuid(), shiftId, type: 'CASH_IN', amount: 200, createdAt: now() }).run()
      // Cash out (supplier payment)
      db.insert(cashMovements).values({ id: uuid(), shiftId, type: 'CASH_OUT', amount: 150, note: 'supplier', createdAt: now() }).run()
      // Refund
      db.insert(cashMovements).values({ id: uuid(), shiftId, type: 'REFUND', amount: 50, createdAt: now() }).run()

      // Reconcile
      const movs = db.select().from(cashMovements).where(eq(cashMovements.shiftId, shiftId)).all()
      const shift = db.select().from(shifts).where(eq(shifts.id, shiftId)).get()!

      let expected = shift.openingCash
      const breakdown: Record<string, number> = {}
      for (const m of movs) {
        if (m.type === 'OPENING' || m.type === 'CLOSING') continue
        const sign = ['SALE', 'CASH_IN'].includes(m.type) ? 1 : -1
        expected += m.amount * sign
        breakdown[m.type] = (breakdown[m.type] || 0) + m.amount * sign
      }

      // 1000 + 850 + 420 + 200 - 150 - 50 = 2270
      expect(expected).toBe(2270)
      expect(breakdown['SALE']).toBe(1270)
      expect(breakdown['CASH_IN']).toBe(200)
      expect(breakdown['CASH_OUT']).toBe(-150)
      expect(breakdown['REFUND']).toBe(-50)

      // Close shift with actual count
      const actualCash = 2200 // counted 2200, expected 2270 → difference -70
      db.update(shifts).set({ endedAt: now(), closingCash: actualCash, status: 'closed' })
        .where(eq(shifts.id, shiftId)).run()

      const closed = db.select().from(shifts).where(eq(shifts.id, shiftId)).get()
      expect(closed?.status).toBe('closed')
      expect(closed?.closingCash).toBe(2200)

      // Difference
      const difference = actualCash - expected
      expect(difference).toBe(-70) // 70 EGP short
    })
  })

  // ═══════════════════════════════════════════════════════════
  // USE CASE 5: Reports — aggregations
  // ═══════════════════════════════════════════════════════════
  describe('UC5: Reports — aggregations from orders', () => {
    beforeEach(() => {
      // Seed some orders for reporting
      const today = new Date().toISOString().slice(0, 10)
      const statuses = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'CANCELLED']
      const types = ['dine-in', 'dine-in', 'delivery', 'dine-in']
      const totals = [228, 95, 145, 85]

      for (let i = 0; i < 4; i++) {
        const orderId = `#30000${i}`
        db.insert(orders).values({
          id: orderId, status: statuses[i], orderType: types[i],
          tableNumber: types[i] === 'dine-in' ? `${i + 1}` : null,
          subtotal: totals[i] / 1.14, tax: totals[i] - totals[i] / 1.14, total: totals[i],
          createdAt: `${today}T${10 + i}:00:00Z`, updatedAt: now(),
        }).run()

        if (statuses[i] !== 'CANCELLED') {
          db.insert(orderItems).values({
            id: uuid(), orderId, productId: 'prod-burger', quantity: 1, unitPrice: 85,
          }).run()
          db.insert(payments).values({
            id: uuid(), orderId, method: i % 2 === 0 ? 'cash' : 'card', amount: totals[i], createdAt: now(),
          }).run()
        }
      }
    })

    it('should calculate daily summary', () => {
      const today = new Date().toISOString().slice(0, 10)
      const all = db.select().from(orders).all()
      const dayOrders = all.filter(o => o.createdAt.startsWith(today) && o.status !== 'CANCELLED')
      const cancelled = all.filter(o => o.createdAt.startsWith(today) && o.status === 'CANCELLED')
      const revenue = dayOrders.reduce((s, o) => s + o.total, 0)

      expect(dayOrders).toHaveLength(3)
      expect(cancelled).toHaveLength(1)
      expect(revenue).toBe(228 + 95 + 145)
    })

    it('should calculate order type split', () => {
      const all = db.select().from(orders).all().filter(o => o.status !== 'CANCELLED')
      const delivery = all.filter(o => o.orderType === 'delivery')
      const dineIn = all.filter(o => o.orderType === 'dine-in')

      expect(delivery).toHaveLength(1)
      expect(dineIn).toHaveLength(2)
    })

    it('should calculate payment method breakdown', () => {
      const allOrders = db.select().from(orders).all().filter(o => o.status !== 'CANCELLED')
      const validIds = new Set(allOrders.map(o => o.id))
      const allPayments = db.select().from(payments).all().filter(p => validIds.has(p.orderId))

      const methods: Record<string, number> = {}
      for (const p of allPayments) {
        methods[p.method] = (methods[p.method] || 0) + p.amount
      }

      expect(methods['cash']).toBe(228 + 145) // orders 0 and 2
      expect(methods['card']).toBe(95) // order 1
    })
  })

  // ═══════════════════════════════════════════════════════════
  // USE CASE 6: User PIN authentication
  // ═══════════════════════════════════════════════════════════
  describe('UC6: User PIN auth', () => {
    it('should verify correct PIN', async () => {
      await createUserWithPin(db, 'user-test', 'كاشير', '5678', 'cashier')

      const user = db.select().from(users).where(eq(users.id, 'user-test')).get()
      expect(user).toBeDefined()

      const argon2 = await import('argon2')
      const valid = await argon2.verify(user!.pinHash, '5678')
      expect(valid).toBe(true)
    })

    it('should reject incorrect PIN', async () => {
      await createUserWithPin(db, 'user-test2', 'كاشير2', '5678', 'cashier')

      const user = db.select().from(users).where(eq(users.id, 'user-test2')).get()
      const argon2 = await import('argon2')
      const valid = await argon2.verify(user!.pinHash, '9999')
      expect(valid).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════
  // USE CASE 7: Modifiers in order
  // ═══════════════════════════════════════════════════════════
  describe('UC7: Modifiers — price adjustments in orders', () => {
    it('should store modifier selection and calculate adjusted price', () => {
      const orderId = '#400001'
      // Burger (85) + Large modifier (+30) = 115
      const unitPrice = 85 + 30

      db.insert(orders).values({
        id: orderId, status: 'PAID', orderType: 'dine-in',
        subtotal: unitPrice, tax: unitPrice * 0.14, total: unitPrice * 1.14,
        createdAt: now(), updatedAt: now(),
      }).run()

      db.insert(orderItems).values({
        id: uuid(), orderId, productId: 'prod-burger', quantity: 1, unitPrice,
        selectedModifiersJson: JSON.stringify([
          { groupId: 'grp-size', modifierId: 'mod-large', name: 'كبير', priceAdjustment: 30 }
        ]),
      }).run()

      const item = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).get()
      expect(item?.unitPrice).toBe(115)

      const mods = JSON.parse(item?.selectedModifiersJson || '[]')
      expect(mods).toHaveLength(1)
      expect(mods[0].name).toBe('كبير')
      expect(mods[0].priceAdjustment).toBe(30)
    })
  })
})
