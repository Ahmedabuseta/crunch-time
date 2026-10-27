// Ingredient activation: deactivated ingredients stay in the database (and
// keep their history) but drop out of the default list and the low-stock
// alerts; the inventory screen asks for them explicitly to offer a filter.
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'ingredient-active-test-'))
const handlers = new Map<string, (e: any, ...args: any[]) => any>()

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) },
  BrowserWindow: class MockWindow {},
}))

const { registerIpcHandlers } = await import('../ipc/main')
const { runMigrations } = await import('../db/migrate')
const { getSqlite, closeSqlite } = await import('../db/client')

const call = async (channel: string, ...args: any[]) => {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`no handler: ${channel}`)
  return fn({}, ...args)
}

const hasId = (rows: any[], id: string) => rows.some((row) => row.id === id)

beforeAll(async () => {
  runMigrations()
  registerIpcHandlers()
  await call('session:setUser', { id: 'u-admin', role: 'admin' })
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('ingredient activation', () => {
  it('hides a deactivated ingredient and brings it back on reactivation', async () => {
    const { id } = await call('inventory:createIngredient', {
      name: 'مادة اختبار التفعيل',
      unit: 'g',
      stockQuantity: 5,
      minStock: 10,
    })

    expect(hasId(await call('inventory:listIngredients'), id)).toBe(true)
    expect(hasId(await call('inventory:getAlerts'), id)).toBe(true)

    const off = await call('inventory:setIngredientActive', id, false)
    expect(off.ok).toBe(true)

    expect(hasId(await call('inventory:listIngredients'), id)).toBe(false)
    const all = await call('inventory:listIngredients', { includeInactive: true })
    const row = all.find((item: any) => item.id === id)
    expect(row).toBeTruthy()
    expect(Boolean(row.active)).toBe(false)
    expect(hasId(await call('inventory:getAlerts'), id)).toBe(false)

    const on = await call('inventory:setIngredientActive', id, true)
    expect(on.ok).toBe(true)
    expect(hasId(await call('inventory:listIngredients'), id)).toBe(true)
    expect(hasId(await call('inventory:getAlerts'), id)).toBe(true)
  })

  it('refuses to toggle a missing ingredient', async () => {
    const res = await call('inventory:setIngredientActive', 'missing-ingredient', false)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('غير موجودة')
  })

  it('lists the products linked to an ingredient with how they are linked', async () => {
    const sqlite = getSqlite()
    sqlite.prepare("INSERT INTO categories (id, name, emoji, color) VALUES ('cat-link', 'قسم', '🍔', '#fff')").run()
    sqlite.prepare(
      "INSERT INTO products (id, name, price, category_id, emoji, description, active) VALUES ('prod-link', 'منتج مرتبط', 10, 'cat-link', '🍔', '', 1)",
    ).run()

    const { id } = await call('inventory:createIngredient', {
      name: 'مادة مرتبطة',
      unit: 'g',
      stockQuantity: 0,
      minStock: 0,
    })
    sqlite.prepare(
      "INSERT INTO recipes (id, product_id, ingredient_id, sub_recipe_id, quantity_per_unit) VALUES ('rec-link', 'prod-link', ?, NULL, 5)",
    ).run(id)

    const rows = await call('inventory:listIngredientProducts', id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'prod-link', name: 'منتج مرتبط', active: true })
    expect(rows[0].links).toContain('وصفة مباشرة')

    const listed = (await call('inventory:listIngredients')).find((item: any) => item.id === id)
    expect(listed.productCount).toBe(1)
  })
})
