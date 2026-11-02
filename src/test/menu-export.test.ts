// Menu → Word export: data collection, recipe expansion and the saved .docx.
// Runs against a real migrated + seeded database, with the save dialog injected.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'menu-export-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier', relaunch: () => {}, exit: () => {} },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { setElectron } = await import('../backend/electron')
const { setUser } = await import('../backend/session')
const { collectMenuExportData, buildMenuDocx, exportMenuWord } = await import('../backend/menu-export')
const { listRecipeRows } = await import('../backend/shared')
const { listCategories } = await import('../backend/catalog')

const allItems = (data: ReturnType<typeof collectMenuExportData>) =>
  data.categories.flatMap((c) => c.products)

beforeAll(async () => {
  setElectron({
    print: async () => ({ ok: true }),
    listPrinters: async () => [],
    dialogs: {
      showSaveDialog: async () => ({ canceled: false, filePath: (globalThis as any).__savePath }),
      showOpenDialog: async () => ({ canceled: true }),
    },
    app: { getPath: () => tempDir, relaunch: () => {}, exit: () => {} },
  })
  runMigrations()
  await seedDatabase()
  setUser({ id: 'test-admin', role: 'admin' })
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('collectMenuExportData', () => {
  it('groups every product under its category, in the catalog order', () => {
    const data = collectMenuExportData({})
    const expectedOrder = (listCategories().all() as any[]).map((c) => c.name)

    expect(data.totals.products).toBeGreaterThan(0)
    expect(data.categories.length).toBeGreaterThan(0)
    expect(data.categories.map((c) => c.name)).toEqual(expectedOrder)
    expect(data.restaurant).toBeTruthy()
    expect(data.currency).toBeTruthy()
  })

  it('expands each product recipe (ingredients and sub-recipes)', () => {
    const data = collectMenuExportData({})
    const item = allItems(data).find((p) => p.recipe.length > 0)
    expect(item).toBeTruthy()

    const rows = listRecipeRows('recipes', 'product_id', item!.id)
    expect(item!.recipe).toHaveLength(rows.length)
    expect(item!.recipe.map((r) => r.name)).toEqual(rows.map((r: any) => r.ingredientName ?? r.subRecipeName))
    expect(item!.recipe.every((r) => r.quantity > 0 && r.unit)).toBe(true)
    expect(data.totals.withRecipe).toBeGreaterThan(0)
  })

  it('honours the product selection', () => {
    const all = allItems(collectMenuExportData({}))
    const picked = all[0]
    const data = collectMenuExportData({ productIds: [picked.id] })

    expect(data.totals.products).toBe(1)
    expect(allItems(data).map((p) => p.id)).toEqual([picked.id])
  })

  it('drops recipes when includeRecipes is false', () => {
    const data = collectMenuExportData({ includeRecipes: false })
    expect(allItems(data).every((p) => p.recipe.length === 0)).toBe(true)
    expect(data.totals.withRecipe).toBe(0)
  })

  it('includes hidden products only when asked', () => {
    const product = allItems(collectMenuExportData({}))[0]
    getSqlite().prepare('UPDATE products SET active = 0 WHERE id = ?').run(product.id)
    try {
      expect(allItems(collectMenuExportData({})).some((p) => p.id === product.id)).toBe(false)
      const withHidden = allItems(collectMenuExportData({ includeInactive: true }))
      expect(withHidden.find((p) => p.id === product.id)?.active).toBe(false)
    } finally {
      getSqlite().prepare('UPDATE products SET active = 1 WHERE id = ?').run(product.id)
    }
  })
})

describe('buildMenuDocx', () => {
  it('renders a real docx package', async () => {
    const data = collectMenuExportData({})
    const buffer = await buildMenuDocx(data)

    expect(buffer.subarray(0, 2).toString()).toBe('PK')
    expect(buffer.length).toBeGreaterThan(5_000)
    expect(buffer.includes(Buffer.from('word/document.xml'))).toBe(true)
  })

  it('embeds the store logo when one is configured', async () => {
    const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    getSqlite().prepare("UPDATE settings SET store_logo = ? WHERE id = 'settings'").run(logo)
    try {
      const data = collectMenuExportData({})
      expect(data.logo).toBe(logo)

      const buffer = await buildMenuDocx(data)
      expect(buffer.includes(Buffer.from('word/media/'))).toBe(true)
    } finally {
      getSqlite().prepare("UPDATE settings SET store_logo = NULL WHERE id = 'settings'").run()
    }
  })
})

describe('exportMenuWord', () => {
  it('writes the picked file and reports its path', async () => {
    const target = path.join(tempDir, 'menu.docx')
    ;(globalThis as any).__savePath = target

    const res = await exportMenuWord({ includeRecipes: true })

    expect(res.ok).toBe(true)
    expect(res.path).toBe(target)
    expect(existsSync(target)).toBe(true)
    expect(readFileSync(target).subarray(0, 2).toString()).toBe('PK')
  })

  it('refuses cashiers', async () => {
    setUser({ id: 'cashier-1', role: 'cashier' })
    try {
      const res = await exportMenuWord({})
      expect(res.ok).toBe(false)
      expect(res.error).toContain('admin')
    } finally {
      setUser({ id: 'test-admin', role: 'admin' })
    }
  })
})
