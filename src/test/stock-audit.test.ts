// Stock audit: the derived last count, the movements after it, loss signals,
// and the two assistant tools built on top of it.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'stock-audit-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { asOwner } = await import('../ai/privileges')
const inventory = await import('../backend/inventory')
const { runTool } = await import('../ai/activities')
const { executeAction } = await import('../ai/actions')

let ingredient: any

const currentStock = () =>
  Number((getSqlite().prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(ingredient.id) as any).stock_quantity)

function auditIngredient(ingredientId: string) {
  const audit = inventory.stockAudit({ ingredientId })
  if (audit.scope !== 'ingredient') throw new Error('expected an ingredient audit')
  return audit
}

function auditOverview() {
  const audit = inventory.stockAudit({})
  if (audit.scope !== 'overview') throw new Error('expected an overview audit')
  return audit
}

beforeAll(async () => {
  runMigrations()
  await seedDatabase()

  ingredient = getSqlite().prepare('SELECT * FROM ingredients WHERE active = 1 ORDER BY name LIMIT 1').get()
  asOwner(() => inventory.restock(ingredient.id, 10, 'اختبار', { byQuantity: true }))
  asOwner(() => inventory.adjust(ingredient.id, -2, 'جرد — عجز اختبار'))
  asOwner(() => inventory.restock(ingredient.id, 5, 'شراء بعد الجرد', { byQuantity: true }))

  // A sale-style consumption row after the count. The audit only reads the
  // ledger and the balance, so a direct insert is enough and avoids building an
  // order just to test the analysis.
  const later = new Date(Date.now() + 1000).toISOString()
  getSqlite().prepare(`
    INSERT INTO inventory_transactions (id, ingredient_id, type, quantity, unit_cost, note, created_at)
    VALUES (?, ?, 'CONSUMPTION', ?, ?, ?, ?)
  `).run('audit-consumption', ingredient.id, -3, ingredient.cost_per_unit, 'بيع اختبار', later)
  getSqlite().prepare('UPDATE ingredients SET stock_quantity = stock_quantity - 3 WHERE id = ?').run(ingredient.id)
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('stock audit', () => {
  it('finds the labeled count and the movements after it', () => {
    const audit = auditIngredient(ingredient.id)

    expect(audit.scope).toBe('ingredient')
    expect(audit.lastCount?.labeled).toBe(true)
    expect(audit.lastCount?.delta).toBe(-2)
    expect(audit.sinceCount?.movements.PURCHASE?.qty).toBe(5)
    expect(audit.sinceCount?.movements.CONSUMPTION?.qty).toBe(-3)
    expect(audit.window.consumed).toBe(3)
    expect(audit.history[0].delta).toBe(-2)
    expect(audit.signals.join(' ')).toContain('عجز')
  })

  it('flags a recurring loss', () => {
    asOwner(() => inventory.adjust(ingredient.id, -1, 'جرد — عجز تاني'))

    const audit = auditIngredient(ingredient.id)
    expect(audit.flags.recurringLoss).toBe(true)
    expect(audit.signals.join(' ')).toContain('اتكرر')
  })

  it('reports the store-wide last count', () => {
    const audit = auditOverview()
    expect(audit.scope).toBe('overview')
    expect(audit.lastCount).toBeTruthy()
    expect(audit.overview.countedItems).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(audit.overview.stale)).toBe(true)
    expect(Array.isArray(audit.overview.losses)).toBe(true)
  })

  it('returns metrics and a movement table from the tool', async () => {
    const out = await runTool({
      turnId: 't',
      name: 'stock_audit',
      args: { ingredient: ingredient.name },
    })

    expect((out.data as any).scope).toBe('ingredient')
    expect(out.cards).toHaveLength(2)
    expect(out.cards[0].kind).toBe('metrics')
    expect(out.cards[1].kind).toBe('table')
    expect(out.summary).toContain('جرد')
  })

  it('records a physical count as a labeled adjustment', async () => {
    const counted = Math.max(0, currentStock() - 1.5)

    const out = await runTool({
      turnId: 't',
      name: 'record_stocktake',
      args: { ingredient: ingredient.name, counted_quantity: counted, note: 'اختبار' },
    })

    const actionId = (out.data as any).actionId as string
    expect(actionId).toBeTruthy()
    expect(out.cards[0].kind).toBe('action')

    const applied = executeAction(actionId)
    expect(applied.ok).toBe(true)
    expect(currentStock()).toBeCloseTo(counted, 2)

    const row = getSqlite().prepare(
      "SELECT note FROM inventory_transactions WHERE ingredient_id = ? AND type = 'ADJUSTMENT' ORDER BY rowid DESC LIMIT 1",
    ).get(ingredient.id) as any
    expect(row.note).toContain('جرد')
  })
})
