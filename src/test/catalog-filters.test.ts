// The admin list filters: retired rows, status, category/storage, and the two
// restock modes the mobile stock sheet relies on.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'catalog-filters-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { asOwner } = await import('../ai/privileges')
const catalog = await import('../backend/catalog')
const inventory = await import('../backend/inventory')

let inactiveProductId = ''
let categoryId = ''
let inactiveIngredientId = ''

beforeAll(async () => {
  runMigrations()
  await seedDatabase()

  categoryId = (getSqlite().prepare('SELECT id FROM categories WHERE active = 1 LIMIT 1').get() as any).id
  const product = asOwner(() =>
    catalog.createProduct({
      name: 'منتج مخفي اختبار',
      price: 10,
      categoryId,
      active: false,
    }),
  ) as { id: string }
  inactiveProductId = product.id

  const ingredient = asOwner(() =>
    inventory.createIngredient({
      name: 'مادة تغليف اختبار',
      unit: 'pcs',
      category: 'packaging',
      storage: 'dry',
      stockQuantity: 0,
      minStock: 0,
      costPerUnit: 1,
      purchaseQty: 1,
    }),
  ) as { id: string }
  inactiveIngredientId = ingredient.id
  asOwner(() => inventory.updateIngredient(inactiveIngredientId, { active: false }))
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('product list filters', () => {
  it('hides retired products by default and includes them on request', () => {
    const activeOnly = catalog.listProductsPaged({ limit: 200, offset: 0 })
    expect(activeOnly.items.some((product) => product.id === inactiveProductId)).toBe(false)

    const all = catalog.listProductsPaged({ limit: 200, offset: 0, includeInactive: true })
    expect(all.items.some((product) => product.id === inactiveProductId)).toBe(true)

    const retired = catalog.listProductsPaged({ limit: 200, offset: 0, active: false })
    expect(retired.items.every((product) => !product.active)).toBe(true)
    expect(retired.items.some((product) => product.id === inactiveProductId)).toBe(true)
  })

  it('filters by category without leaking the retired row', () => {
    const byCategory = catalog.listProductsPaged({ limit: 200, offset: 0, categoryId })
    expect(byCategory.items.every((product) => product.categoryId === categoryId)).toBe(true)
    expect(byCategory.items.some((product) => product.id === inactiveProductId)).toBe(false)
  })
})

describe('ingredient list filters', () => {
  it('filters by category and storage, and can include retired rows', () => {
    const packaging = inventory.listIngredientsPaged({
      limit: 200,
      offset: 0,
      category: 'packaging',
      includeInactive: true,
    })
    expect(packaging.items.every((ingredient) => ingredient.category === 'packaging')).toBe(true)
    expect(packaging.items.some((ingredient) => ingredient.id === inactiveIngredientId)).toBe(true)

    const dry = inventory.listIngredientsPaged({
      limit: 200,
      offset: 0,
      storage: 'dry',
      includeInactive: true,
    })
    expect(dry.items.every((ingredient) => ingredient.storage === 'dry')).toBe(true)
  })

  it('filters by status', () => {
    const retired = inventory.listIngredientsPaged({
      limit: 200,
      offset: 0,
      active: false,
    })
    expect(retired.items.every((ingredient) => !ingredient.active)).toBe(true)
    expect(retired.items.some((ingredient) => ingredient.id === inactiveIngredientId)).toBe(true)
  })
})

describe('restock modes', () => {
  it('adds the raw quantity in byQuantity mode and the pack size otherwise', () => {
    const row = getSqlite()
      .prepare('SELECT id, purchase_qty, stock_quantity FROM ingredients WHERE active = 1 AND purchase_qty > 1 LIMIT 1')
      .get() as any
    const pack = Number(row.purchase_qty)

    const before = Number(row.stock_quantity)
    asOwner(() => inventory.restock(row.id, 2, 'اختبار كمية', { byQuantity: true }))
    expect(Number((getSqlite().prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(row.id) as any).stock_quantity)).toBe(before + 2)

    const beforePack = before + 2
    asOwner(() => inventory.restock(row.id, 1, 'اختبار عبوة'))
    expect(Number((getSqlite().prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(row.id) as any).stock_quantity)).toBe(beforePack + pack)
  })
})
