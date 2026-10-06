// Regression test for the hard-delete FK crash.
// Drives the REAL IPC handlers (src/ipc/main.ts) through a mocked
// ipcMain against a throwaway database, so a delete that hits a
// foreign key must return { ok: false } — never throw.
import { describe, it, expect, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'hard-delete-test-'))

const handlers = new Map<string, (e: any, ...args: any[]) => any>()

// client.ts reads the database path from Electron's userData.
vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn) },
  BrowserWindow: class MockWindow {},
}))

const { registerIpcHandlers } = await import('../ipc/main')
const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite } = await import('../db/client')

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('hard delete never crashes on foreign keys', () => {
  it('refuses FK-linked rows and cascades join rows', async () => {
    runMigrations()
    await seedDatabase()
    registerIpcHandlers()

    const call = async (channel: string, ...args: any[]) => {
      const fn = handlers.get(channel)
      if (!fn) throw new Error(`no handler: ${channel}`)
      return fn({}, ...args)
    }
    await call('session:setUser', { id: 'u-admin', role: 'admin' })

    const sqlite = getSqlite()

    // The seed no longer creates modifiers, so build a
    // small modifier tree to exercise the delete paths.
    sqlite.exec(`
      INSERT INTO modifier_groups (id, name, type, sort_order, active) VALUES ('grp-test', 'اختبار', 'single-select', 1, 1);
      INSERT INTO modifiers (id, modifier_group_id, name, price_adjustment, sort_order, active)
      VALUES ('mod-dirty', 'grp-test', 'وسخ', 0, 1, 1), ('mod-clean', 'grp-test', 'نظيف', 0, 2, 1);
      INSERT INTO modifier_recipes (id, modifier_id, ingredient_id, quantity_per_unit)
      VALUES ('mr-test', 'mod-dirty', 'ing-mozzarella', 20);
      INSERT INTO product_modifier_groups (product_id, modifier_group_id)
      SELECT id, 'grp-test' FROM products WHERE active = 1 LIMIT 1;
    `)

    // Pick real rows: a product with order history, one without.
    const withOrders = sqlite.prepare(
      'SELECT DISTINCT product_id FROM order_items LIMIT 1',
    ).get() as { product_id: string }
    const cleanProduct = sqlite.prepare(`
      SELECT id FROM products
      WHERE id NOT IN (SELECT product_id FROM order_items)
      LIMIT 1
    `).get() as { id: string }
    const linkedModifier = { modifier_id: 'mod-dirty' }
    const cleanModifier = { id: 'mod-clean' }
    const linkedGroup = { modifier_group_id: 'grp-test' }

    // 1. The original crash: deleting a modifier that has recipes.
    const refused = await call('modifier:deleteModifier', linkedModifier.modifier_id, { hard: true })
    expect(refused.ok).toBe(false)
    expect(refused.error).toBeTruthy()

    // 2. A modifier group whose member options carry recipes.
    const groupRefused = await call('modifier:deleteGroup', linkedGroup.modifier_group_id, { hard: true })
    expect(groupRefused.ok).toBe(false)

    // 3. A product with order history must be refused, not deleted.
    const productRefused = await call('product:delete', withOrders.product_id, { hard: true })
    expect(productRefused.ok).toBe(false)
    const stillThere = sqlite.prepare('SELECT 1 FROM products WHERE id = ?').get(withOrders.product_id)
    expect(stillThere).toBeTruthy()

    // 4. A clean product deletes and cascades its join rows.
    const addonCount = (sqlite.prepare(
      'SELECT COUNT(*) AS c FROM product_addons WHERE product_id = ?',
    ).get(cleanProduct.id) as { c: number }).c
    const removed = await call('product:delete', cleanProduct.id, { hard: true })
    expect(removed.ok).toBe(true)
    expect(sqlite.prepare('SELECT 1 FROM products WHERE id = ?').get(cleanProduct.id)).toBeUndefined()
    if (addonCount > 0) {
      expect(sqlite.prepare('SELECT 1 FROM product_addons WHERE product_id = ?').get(cleanProduct.id)).toBeUndefined()
    }

    // 5. A clean modifier deletes fine (validates the FK discovery
    //    does not misclassify handled tables as dependencies).
    // First prove the discovery itself: a table with an FK the
    // handler knows nothing about must still block the delete.
    sqlite.exec(`CREATE TABLE future_link (id TEXT PRIMARY KEY, modifier_id TEXT REFERENCES modifiers(id))`)
    sqlite.prepare('INSERT INTO future_link (id, modifier_id) VALUES (?, ?)').run('fl-1', cleanModifier.id)
    const discovered = await call('modifier:deleteModifier', cleanModifier.id, { hard: true })
    expect(discovered.ok).toBe(false)
    expect(discovered.error).toContain('future_link')
    sqlite.prepare('DELETE FROM future_link WHERE id = ?').run('fl-1')

    const modifierRemoved = await call('modifier:deleteModifier', cleanModifier.id, { hard: true })
    expect(modifierRemoved.ok).toBe(true)
    expect(sqlite.prepare('SELECT 1 FROM modifiers WHERE id = ?').get(cleanModifier.id)).toBeUndefined()
  })
})