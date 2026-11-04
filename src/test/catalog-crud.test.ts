import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'catalog-crud-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { setUser } = await import('../backend/session')
const addons = await import('../backend/addons')
const modifiers = await import('../backend/modifiers')
const catalog = await import('../backend/catalog')

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  setUser({ id: 'test-admin', role: 'admin' })
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

const firstProductId = () => (getSqlite().prepare('SELECT id FROM products LIMIT 1').get() as { id: string }).id
const recipeCount = (productId: string) =>
  (getSqlite().prepare('SELECT COUNT(*) AS n FROM recipes WHERE product_id = ?').get(productId) as { n: number }).n

describe('catalog CRUD', () => {
  it('shows hidden addons to admins and keeps them out of the sales list', () => {
    const addon = addons.createAddon({ name: 'اختبار إضافة', price: 5, emoji: '🧪' })

    expect(addons.listAddons(false).some((entry) => entry.id === addon.id)).toBe(true)
    expect(addons.listAddons(true).find((entry) => entry.id === addon.id)?.productCount).toBe(0)

    addons.deleteAddon(addon.id)

    expect(addons.listAddons(false).some((entry) => entry.id === addon.id)).toBe(false)
    expect(addons.listAddons(true).find((entry) => entry.id === addon.id)?.active).toBe(false)
  })

  it('links products to an addon from the addon side', () => {
    const addon = addons.createAddon({ name: 'ربط إضافة', price: 1, emoji: '🔗' })
    const productId = firstProductId()

    addons.setAddonProducts(addon.id, [productId, productId])

    expect(addons.listAddonProducts(addon.id).map((product) => product.id)).toEqual([productId])
    expect(addons.listAddons(true).find((entry) => entry.id === addon.id)?.productCount).toBe(1)

    addons.setAddonProducts(addon.id, [])
    expect(addons.listAddonProducts(addon.id)).toHaveLength(0)
  })

  it('shows hidden groups and modifiers to admins', () => {
    const group = modifiers.createModifierGroup({ name: 'مجموعة اختبار', type: 'single-select' })
    const modifier = modifiers.createModifier({ modifierGroupId: group.id, name: 'خيار اختبار', priceAdjustment: 2 })

    expect(modifiers.listModifierGroups(false).some((entry) => entry.id === group.id)).toBe(true)

    modifiers.updateModifierGroup(group.id, { active: false })
    expect(modifiers.listModifierGroups(false).some((entry) => entry.id === group.id)).toBe(false)
    expect(modifiers.listModifierGroups(true).find((entry) => entry.id === group.id)?.active).toBe(false)

    modifiers.updateModifierGroup(group.id, { active: true })
    modifiers.updateModifier(modifier.id, { active: false })
    expect(modifiers.listModifiersByGroup(group.id, false).some((entry) => entry.id === modifier.id)).toBe(false)
    expect(modifiers.listModifiersByGroup(group.id, true).some((entry) => entry.id === modifier.id)).toBe(true)
  })

  it('reorders groups and modifiers', () => {
    const first = modifiers.createModifierGroup({ name: 'ترتيب أول', type: 'single-select' })
    const second = modifiers.createModifierGroup({ name: 'ترتيب ثاني', type: 'single-select' })
    const firstModifier = modifiers.createModifier({ modifierGroupId: first.id, name: 'أ' })
    const secondModifier = modifiers.createModifier({ modifierGroupId: first.id, name: 'ب' })

    modifiers.reorderModifierGroups([second.id, first.id])
    expect(
      modifiers.listModifierGroups(true)
        .map((entry) => entry.id)
        .filter((id) => id === first.id || id === second.id),
    ).toEqual([second.id, first.id])

    modifiers.reorderModifiers([secondModifier.id, firstModifier.id])
    expect(modifiers.listModifiersByGroup(first.id, true).slice(0, 2).map((entry) => entry.id))
      .toEqual([secondModifier.id, firstModifier.id])
  })

  it('links products to a modifier group from the group side', () => {
    const group = modifiers.createModifierGroup({ name: 'ربط مجموعة', type: 'multi-select' })
    const productId = firstProductId()

    modifiers.setModifierGroupProducts(group.id, [productId])
    expect(modifiers.listModifierGroupProducts(group.id).map((product) => product.id)).toEqual([productId])

    modifiers.setModifierGroupProducts(group.id, [])
    expect(modifiers.listModifierGroupProducts(group.id)).toHaveLength(0)
  })

  it('duplicates a product with its options and recipe, hidden by default', () => {
    const productId = firstProductId()
    const addon = addons.createAddon({ name: 'نسخ إضافة', price: 1, emoji: '📦' })
    const group = modifiers.createModifierGroup({ name: 'نسخ مجموعة', type: 'single-select' })
    addons.setAddonProducts(addon.id, [productId])
    modifiers.setModifierGroupProducts(group.id, [productId])

    const copy = catalog.duplicateProduct(productId)
    const copied = catalog.getProductById(copy.id)

    expect(copied?.name).toContain('(نسخة)')
    expect(copied?.active).toBe(false)
    expect(addons.listAddonProducts(addon.id).map((product) => product.id)).toContain(copy.id)
    expect(modifiers.listModifierGroupProducts(group.id).map((product) => product.id)).toContain(copy.id)
    expect(recipeCount(copy.id)).toBe(recipeCount(productId))
  })

  it('rejects invalid input before writing', () => {
    expect(() => addons.createAddon({ name: '  ', price: 1, emoji: '' })).toThrow(/اسم/)
    expect(() => addons.createAddon({ name: 'صالح', price: -1, emoji: '' })).toThrow(/سعر/)
    expect(() => modifiers.createModifierGroup({ name: '', type: 'single-select' })).toThrow(/اسم/)
    expect(() => modifiers.createModifierGroup({ name: 'صالح', type: 'invalid' })).toThrow(/نوع/)
    expect(() => catalog.createProduct({ name: '', price: 1, categoryId: firstProductId(), emoji: '', description: '' })).toThrow(/اسم/)
  })
})
