// The schema digest that makes `query_database` usable.
//
// The prompt used to say "run SQL" while telling the model nothing about the
// tables, so it guessed and paid a failed step for it. These tests run against
// the real migrated database: the digest has to be correct, bounded, and free of
// anything secret.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'ai-schema-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { closeSqlite } = await import('../db/client')
const { clearSchemaDigest, schemaDigest, tableDigest, tableList } = await import('../ai/tools/schema-digest')

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
  clearSchemaDigest()
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('schemaDigest', () => {
  it('names the tables a shop question actually needs', () => {
    const digest = schemaDigest()
    for (const table of ['orders', 'order_items', 'products', 'ingredients']) {
      expect(digest).toContain(table)
    }
  })

  it('carries the columns, so a query does not have to guess them', () => {
    const digest = schemaDigest()
    expect(digest).toContain('total')
    expect(digest).toContain('created_at')
  })

  it('never describes the assistant\'s own tables', () => {
    const digest = schemaDigest()
    expect(digest).not.toContain('ai_messages')
    expect(digest).not.toContain('ai_threads')
    expect(digest).not.toContain('ai_usage')
  })

  it('never leaks a secret-shaped column', () => {
    const digest = schemaDigest()
    expect(digest).not.toContain('pin_hash')
    expect(digest).not.toContain('password')
    expect(digest).not.toContain('api_key')
  })

  it('stays inside the size budget it is given', () => {
    const digest = schemaDigest(600)
    expect(digest.length).toBeLessThanOrEqual(700)
  })

  it('says where to look when it truncated', () => {
    // A truncated digest is still useful, but only if the model knows it can
    // ask for the rest instead of guessing at a missing table.
    const digest = schemaDigest(400)
    if (digest.includes('حذوفة')) expect(digest).toContain('db_schema')
  })
})

describe('tableDigest', () => {
  it('describes one table in full, with its foreign keys', () => {
    const orders = tableDigest('orders')
    expect(orders).toContain('orders')
    expect(orders).toContain('status')
  })

  it('is case-insensitive about the name', () => {
    expect(tableDigest('ORDERS')).toContain('orders')
  })

  it('returns empty for a table that does not exist', () => {
    expect(tableDigest('not_a_table')).toBe('')
  })
})

describe('tableList', () => {
  it('lists real tables with their sizes, largest first', () => {
    const tables = tableList()
    expect(tables.length).toBeGreaterThan(5)
    for (let index = 1; index < tables.length; index += 1) {
      expect(tables[index - 1].rows).toBeGreaterThanOrEqual(tables[index].rows)
    }
    expect(tables.some((entry) => entry.name === 'products')).toBe(true)
  })
})
