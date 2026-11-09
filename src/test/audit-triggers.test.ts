// Auditing every table, through triggers.
//
// The audit log used to be written by six backend modules, so catalogue,
// inventory and recipe changes left no trace at all. These are SQLite triggers
// now, generated per table from its own schema.
//
// The tests below cover the three things that make that approach safe rather
// than merely present: it sees writes made by any path, it does not record the
// demo seed, and it names the acting user.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'audit-triggers-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { suspendAudit, resumeAudit, auditedTables, removeAuditTriggers } = await import('../db/audit-triggers')
const { setAuditActor } = await import('../backend/audit')
const { setUser } = await import('../backend/session')

const rows = (sql: string, ...args: unknown[]) => getSqlite().prepare(sql).all(...args) as any[]
const count = () => (rows('SELECT COUNT(*) AS c FROM audit_log')[0] as any).c

beforeAll(async () => {
  runMigrations()
  suspendAudit(getSqlite())
  try {
    await seedDatabase()
  } finally {
    resumeAudit(getSqlite())
  }
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('what is audited', () => {
  it('covers the business tables and skips the log itself', () => {
    const tables = auditedTables(getSqlite())
    for (const expected of ['products', 'ingredients', 'orders', 'recipes', 'categories', 'settings']) {
      expect(tables).toContain(expected)
    }
    // A trigger on audit_log would write a row for every audit row.
    expect(tables).not.toContain('audit_log')
    expect(tables).not.toContain('schema_migrations')
    // The assistant's transcript is high-volume and restores from nothing.
    expect(tables).not.toContain('ai_messages')
  })

  it('creates two triggers per audited table', () => {
    const triggers = rows("SELECT name FROM sqlite_master WHERE type = 'trigger'")
    const tables = auditedTables(getSqlite())
    expect(triggers.length).toBe(tables.length * 2)
  })

  it('does not record the demo seed', () => {
    // Seeding writes ~2,500 rows. Auditing it would open the owner's log on
    // data nobody entered.
    expect(count()).toBe(0)
  })
})

describe('a real write is recorded', () => {
  it('captures an update with before and after', () => {
    const before = count()
    const product = rows('SELECT id, name, price FROM products LIMIT 1')[0]
    getSqlite().prepare('UPDATE products SET price = ? WHERE id = ?').run(Number(product.price) + 7, product.id)

    expect(count()).toBe(before + 1)
    const entry = rows("SELECT action, entity, entity_id, before, after FROM audit_log WHERE entity = 'products' ORDER BY created_at DESC LIMIT 1")[0]
    expect(entry.action).toBe('update')
    expect(entry.entity_id).toBe(product.id)

    const from = JSON.parse(entry.before)
    const to = JSON.parse(entry.after)
    expect(from.price).toBe(Number(product.price))
    expect(to.price).toBe(Number(product.price) + 7)
    // The whole row is snapshotted, not just the changed column, so a later
    // reader can see what the record looked like.
    expect(to.name).toBe(product.name)
  })

  it('captures a create with no before', () => {
    const before = count()
    getSqlite().prepare(
      "INSERT INTO categories (id, name, emoji, color, sort_order, active) VALUES ('cat-audit', 'قسم', '🍔', '#fff', 9, 1)",
    ).run()

    expect(count()).toBe(before + 1)
    const entry = rows("SELECT action, before, after FROM audit_log WHERE entity = 'categories' ORDER BY created_at DESC LIMIT 1")[0]
    expect(entry.action).toBe('create')
    expect(entry.before).toBeNull()
    expect(JSON.parse(entry.after).name).toBe('قسم')
  })

  it('sees a write made by raw SQL, not just the backend', () => {
    // This is the point of triggers: a path nobody remembered to instrument
    // cannot skip the trail.
    const before = count()
    getSqlite().prepare("UPDATE ingredients SET stock_quantity = stock_quantity + 1 WHERE id = (SELECT id FROM ingredients LIMIT 1)").run()
    expect(count()).toBe(before + 1)
  })

  it('handles a table with no id column', () => {
    // product_addons is a join table: identity is the rowid.
    const before = count()
    getSqlite().prepare('UPDATE product_addons SET product_id = product_id WHERE rowid = (SELECT rowid FROM product_addons LIMIT 1)').run()
    expect(count()).toBe(before + 1)
    const entry = rows("SELECT entity, entity_id FROM audit_log WHERE entity = 'product_addons' ORDER BY created_at DESC LIMIT 1")[0]
    expect(entry.entity).toBe('product_addons')
    expect(entry.entity_id).toBeTruthy()
  })
})

describe('the acting user', () => {
  it('records whoever the session says', () => {
    setUser({ id: 'cashier-1', role: 'admin' } as never)
    setAuditActor('cashier-1')
    try {
      getSqlite().prepare("UPDATE settings SET restaurant_name = restaurant_name WHERE id = 'settings'").run()
      const entry = rows("SELECT user_id FROM audit_log WHERE entity = 'settings' ORDER BY created_at DESC LIMIT 1")[0]
      expect(entry.user_id).toBe('cashier-1')
    } finally {
      setAuditActor(null)
      setUser(null)
    }
  })

  it('records no user when nobody is signed in', () => {
    setAuditActor(null)
    getSqlite().prepare("UPDATE settings SET restaurant_name = restaurant_name WHERE id = 'settings'").run()
    const entry = rows("SELECT user_id FROM audit_log WHERE entity = 'settings' ORDER BY created_at DESC LIMIT 1")[0]
    expect(entry.user_id).toBeNull()
  })
})

describe('suspension', () => {
  it('records nothing while suspended and resumes after', () => {
    const before = count()
    suspendAudit(getSqlite())
    try {
      getSqlite().prepare("UPDATE settings SET restaurant_name = restaurant_name WHERE id = 'settings'").run()
      expect(count()).toBe(before)
    } finally {
      resumeAudit(getSqlite())
    }
    getSqlite().prepare("UPDATE settings SET restaurant_name = restaurant_name WHERE id = 'settings'").run()
    expect(count()).toBe(before + 1)
  })

  it('can remove the triggers, which a schema change needs', () => {
    // A trigger names every column, so ALTER TABLE DROP COLUMN would fail while
    // one exists — this is why removeAuditTriggers exists.
    removeAuditTriggers(getSqlite())
    const left = rows("SELECT name FROM sqlite_master WHERE type = 'trigger'")
    expect(left).toHaveLength(0)
    // Restored for anything that runs after this file.
    runMigrations()
    expect(rows("SELECT name FROM sqlite_master WHERE type = 'trigger'").length).toBeGreaterThan(0)
  })
})
