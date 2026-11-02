// Aliases and near-matches: the two ways the assistant stops saying
// "مفيش صنف بالاسم ده".
//
// Runs against a real migrated + seeded database (same harness as
// ai-assistant.test.ts) because the behaviour under test is exactly the
// interaction between SQL, the Arabic normaliser and the resolver. Registry
// independent on purpose: ALIAS_TOOLS is imported directly, so this file keeps
// passing while the main registry is being wired up.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'ai-aliases-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { resolveProduct, resolveIngredient, resolveCategory } = await import('../ai/tools/resolve')
const {
  normalizeAlias,
  getAliasTarget,
  setAlias,
  listAliases,
  logUnresolved,
  listUnresolved,
  markUnresolvedResolved,
} = await import('../ai/tools/alias-store')
const { fuzzyScore, editDistance, withoutArticle } = await import('../ai/tools/fuzzy')
const { ALIAS_TOOLS } = await import('../ai/tools/aliases')
const { executeAction } = await import('../ai/actions')

const db = () => getSqlite()

const tool = (name: string) => {
  const found = ALIAS_TOOLS.find((entry) => entry.name === name)
  if (!found) throw new Error(`missing alias tool ${name}`)
  return found
}

const toolCtx = () => ({ turnId: 't', cards: [] as any[], now: new Date() })

function productByName(name: string): any {
  return db().prepare('SELECT * FROM products WHERE name = ? AND active = 1 LIMIT 1').get(name)
}

function insertFixtureProduct(id: string, name: string, active = 1): void {
  db()
    .prepare(`
      INSERT INTO products (id, name, price, cost_price, supports_rollback, category_id, emoji, description, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(id, name, 10, 0, 1, 'drinks', '🧪', 'fixture', active)
}

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('migration 012', () => {
  it('creates the alias and unresolved tables with the documented columns', () => {
    const columns = (table: string) =>
      (db().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name)

    expect(columns('ai_aliases')).toEqual(['id', 'entity', 'alias', 'target_id', 'created_at'])
    expect(columns('ai_unresolved')).toEqual(['id', 'entity', 'query', 'candidates', 'created_at', 'resolved'])

    const unresolved = db().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_unresolved'").get()
    expect(unresolved).toBeTruthy()
  })

  it('indexes created_at on the unresolved table', () => {
    const indexes = db().prepare('PRAGMA index_list(ai_unresolved)').all() as { name: string }[]
    const onCreated = indexes.some((index) =>
      (db().prepare(`PRAGMA index_info(${index.name})`).all() as { name: string }[]).some((column) => column.name === 'created_at'),
    )
    expect(onCreated).toBe(true)
  })

  it('enforces UNIQUE(entity, alias)', () => {
    const insert = db().prepare('INSERT INTO ai_aliases (id, entity, alias, target_id, created_at) VALUES (?, ?, ?, ?, ?)')
    insert.run('alias-unique-1', 'product', 'اسم مكرر', 'm6', new Date().toISOString())
    expect(() => insert.run('alias-unique-2', 'product', 'اسم مكرر', 'm6', new Date().toISOString())).toThrow()
    // The same alias under the other entity is a different row.
    expect(() => insert.run('alias-unique-3', 'ingredient', 'اسم مكرر', 'ing-sausage', new Date().toISOString())).not.toThrow()
    db().prepare("DELETE FROM ai_aliases WHERE id IN ('alias-unique-1', 'alias-unique-3')").run()
  })
})

describe('Arabic name resolution', () => {
  it('normalises away the definite article', () => {
    expect(withoutArticle('السجق')).toBe('سجق')
    expect(normalizeAlias('السجق')).toBe('سجق')
    expect(normalizeAlias('  السِجِق  ')).toBe('سجق')
    expect(getAliasTarget('product', 'السجق')).toBeNull()
  })

  it('resolves «السجق» to the seeded «سجق»', () => {
    const sausage = productByName('سجق')
    expect(sausage).toBeTruthy()

    const resolved = resolveProduct('السجق')
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.row.id).toBe(sausage.id)
  })

  it('resolves the ingredients with and without the article too', () => {
    const sausage = db().prepare("SELECT * FROM ingredients WHERE name = 'سجق' AND active = 1").get() as any
    expect(sausage).toBeTruthy()
    const resolved = resolveIngredient('السجق')
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.row.id).toBe(sausage.id)
  })
})

describe('fuzzy scoring', () => {
  it('orders exact, prefix and substring above near matches', () => {
    expect(fuzzyScore('سجق', 'سجق')).toBe(100)
    expect(fuzzyScore('سجق', 'سجق بلدي')).toBeGreaterThanOrEqual(85)
    expect(fuzzyScore('سجق', 'طبق سجق')).toBeGreaterThanOrEqual(70)
    expect(fuzzyScore('سجق', 'سجق')).toBeGreaterThan(fuzzyScore('سجك', 'سجق'))
  })

  it('scores a one-letter typo as a strong match and unrelated names as nothing', () => {
    expect(editDistance('سجك', 'سجق')).toBe(1)
    expect(editDistance('فرايدي', 'فرايداي')).toBe(1)
    expect(fuzzyScore('فرايدي', 'فرايداي')).toBeGreaterThanOrEqual(55)
    expect(fuzzyScore('سجق', 'مياه صغيرة')).toBe(0)
    expect(fuzzyScore('سجق', 'Waffle Strawberry')).toBe(0)
  })

  it('does not fuzz two letters into a match', () => {
    expect(fuzzyScore('سج', 'سجق')).toBeGreaterThanOrEqual(85) // prefix, not fuzzy
    expect(fuzzyScore('سج', 'شيش')).toBe(0)
  })
})

describe('fuzzy resolution through resolve.ts', () => {
  it('accepts a single strong near-match', () => {
    const product = productByName('فرايداي')
    expect(product).toBeTruthy()

    const resolved = resolveProduct('فرايدي')
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.row.id).toBe(product.id)
  })

  it('accepts a one-letter typo on a short name', () => {
    const sausage = productByName('سجق')
    const resolved = resolveProduct('سجك')
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.row.id).toBe(sausage.id)
  })

  it('refuses to choose between two equally close names', () => {
    insertFixtureProduct('fx-zaatar-a', 'زعتر جبل')
    insertFixtureProduct('fx-zaatar-b', 'زعتر جبم')
    try {
      const resolved = resolveProduct('زعتر جبك')
      expect(resolved.ok).toBe(false)
      if (!resolved.ok) {
        expect(resolved.error).toContain('أكتر من')
        expect(resolved.error).toContain('زعتر')
      }
    } finally {
      db().prepare("DELETE FROM products WHERE id IN ('fx-zaatar-a', 'fx-zaatar-b')").run()
    }
  })

  it('still says no clearly when nothing is close', () => {
    const resolved = resolveProduct('سلطعون فضائي مش موجود')
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) expect(resolved.error).toContain('جرّب اسم تاني')
  })
})

describe('alias store', () => {
  it('validates the target before storing anything', () => {
    expect(setAlias('product', 'اسم بديل', 'no-such-product').ok).toBe(false)
    expect(setAlias('product', '   ', 'm6').ok).toBe(false)
    expect(getAliasTarget('product', 'اسم بديل')).toBeNull()
  })

  it('maps an alias to an active product and back', () => {
    insertFixtureProduct('fx-alias-product', 'صنف تجربة الألياس')
    try {
      expect(setAlias('product', 'ساندوتش الشركة', 'fx-alias-product').ok).toBe(true)
      expect(getAliasTarget('product', 'ساندوتش الشركة')).toBe('fx-alias-product')
      // The alias key is normalised, so the article and diacritics do not matter.
      expect(getAliasTarget('product', 'الساندوتش الشركة')).toBe('fx-alias-product')

      const resolved = resolveProduct('ساندوتش الشركة')
      expect(resolved.ok).toBe(true)
      if (resolved.ok) expect(resolved.row.id).toBe('fx-alias-product')

      const aliases = listAliases('product')
      const stored = aliases.find((row) => row.targetId === 'fx-alias-product')
      expect(stored?.alias).toBe('ساندوتش الشركة')
      expect(stored?.targetName).toBe('صنف تجربة الألياس')
      expect(stored?.targetActive).toBe(true)
    } finally {
      db().prepare("DELETE FROM ai_aliases WHERE target_id = 'fx-alias-product'").run()
      db().prepare("DELETE FROM products WHERE id = 'fx-alias-product'").run()
    }
  })

  it('re-points an alias instead of duplicating it', () => {
    insertFixtureProduct('fx-repoint-a', 'صنف تجربة ألف')
    insertFixtureProduct('fx-repoint-b', 'صنف تجربة باء')
    try {
      expect(setAlias('product', 'الاسم المتحرك', 'fx-repoint-a').ok).toBe(true)
      expect(setAlias('product', 'الاسم المتحرك', 'fx-repoint-b').ok).toBe(true)
      expect(getAliasTarget('product', 'الاسم المتحرك')).toBe('fx-repoint-b')
      expect(listAliases('product').filter((row) => row.alias === 'الاسم المتحرك')).toHaveLength(1)

      const resolved = resolveProduct('الاسم المتحرك')
      expect(resolved.ok).toBe(true)
      if (resolved.ok) expect(resolved.row.id).toBe('fx-repoint-b')
    } finally {
      db().prepare("DELETE FROM ai_aliases WHERE target_id IN ('fx-repoint-a', 'fx-repoint-b')").run()
      db().prepare("DELETE FROM products WHERE id IN ('fx-repoint-a', 'fx-repoint-b')").run()
    }
  })

  it('refuses to alias an inactive row unless inactive rows are requested', () => {
    insertFixtureProduct('fx-hidden-product', 'صنف مخفي للألياس', 0)
    try {
      expect(setAlias('product', 'الاسم المخفي', 'fx-hidden-product').ok).toBe(true)

      const hidden = resolveProduct('الاسم المخفي')
      expect(hidden.ok).toBe(false)
      if (!hidden.ok) expect(hidden.error).toContain('مخفي')

      const withInactive = resolveProduct('الاسم المخفي', { includeInactive: true })
      expect(withInactive.ok).toBe(true)
      if (withInactive.ok) expect(withInactive.row.id).toBe('fx-hidden-product')
    } finally {
      db().prepare("DELETE FROM ai_aliases WHERE target_id = 'fx-hidden-product'").run()
      db().prepare("DELETE FROM products WHERE id = 'fx-hidden-product'").run()
    }
  })

  it('keeps product and ingredient aliases apart', () => {
    expect(setAlias('ingredient', 'اللحمة البلدي', 'ing-beef').ok).toBe(true)
    try {
      expect(getAliasTarget('ingredient', 'اللحمة البلدي')).toBe('ing-beef')
      expect(getAliasTarget('product', 'اللحمة البلدي')).toBeNull()

      const resolved = resolveIngredient('اللحمة البلدي')
      expect(resolved.ok).toBe(true)
      if (resolved.ok) expect(resolved.row.id).toBe('ing-beef')
    } finally {
      db().prepare("DELETE FROM ai_aliases WHERE entity = 'ingredient' AND target_id = 'ing-beef'").run()
    }
  })
})

describe('unresolved logging', () => {
  it('logs a catalogue name that could not be resolved', () => {
    const before = listUnresolved('product', 50).length
    const resolved = resolveProduct('سلطعون فضائي مش موجود')
    expect(resolved.ok).toBe(false)

    const rows = listUnresolved('product', 50)
    expect(rows.length).toBeGreaterThan(before)
    const logged = rows.find((row) => row.query === 'سلطعون فضائي مش موجود')
    expect(logged).toBeTruthy()
    expect(logged?.entity).toBe('product')
    expect(logged?.resolved).toBe(false)

    expect(markUnresolvedResolved(String(logged?.id))).toBe(true)
    const after = listUnresolved('product', 50).find((row) => row.id === logged?.id)
    expect(after?.resolved).toBe(true)
  })

  it('does not log categories, addons or modifier groups', () => {
    const before = listUnresolved(undefined, 100).length
    const category = resolveCategory('قسم مش موجود خالص')
    expect(category.ok).toBe(false)
    expect(listUnresolved(undefined, 100).length).toBe(before)
  })

  it('never throws when the log table is missing', () => {
    db().exec('ALTER TABLE ai_unresolved RENAME TO ai_unresolved_off')
    try {
      expect(() => logUnresolved('product', 'اسم خلال اختبار الفشل')).not.toThrow()
      expect(logUnresolved('product', 'اسم خلال اختبار الفشل')).toBeNull()

      // A read tool that fails to log still returns its normal "not found".
      let resolved: ReturnType<typeof resolveProduct> | undefined
      expect(() => {
        resolved = resolveProduct('اسم خلال اختبار الفشل')
      }).not.toThrow()
      expect(resolved?.ok).toBe(false)
    } finally {
      db().exec('ALTER TABLE ai_unresolved_off RENAME TO ai_unresolved')
    }
  })
})

describe('alias tools', () => {
  it('exposes two reads and one write with descriptions and schemas', () => {
    expect(ALIAS_TOOLS.map((entry) => entry.name).sort()).toEqual(['learn_alias', 'list_aliases', 'unresolved_queries'])
    for (const entry of ALIAS_TOOLS) {
      expect(entry.description.length).toBeGreaterThan(10)
      expect(entry.schema).toBeTruthy()
    }
    expect(tool('unresolved_queries').write).toBe(false)
    expect(tool('list_aliases').write).toBe(false)
    expect(tool('learn_alias').write).toBe(true)
  })

  it('shows the unresolved queries in a table card', async () => {
    db().prepare(`
      INSERT INTO ai_unresolved (id, entity, query, candidates, created_at, resolved)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run('unresolved-card-row', 'product', 'حاجة غريبة', JSON.stringify(['سجق', 'سوسيس']), new Date().toISOString())

    const result = await tool('unresolved_queries').run({ limit: 10 }, toolCtx())
    const data = result.data as any
    expect(Array.isArray(data.items)).toBe(true)
    const row = data.items.find((item: any) => item.id === 'unresolved-card-row')
    expect(row?.query).toBe('حاجة غريبة')
    expect(row?.candidates).toEqual(['سجق', 'سوسيس'])

    expect(result.cards[0]?.kind).toBe('table')
    if (result.cards[0]?.kind === 'table') {
      expect(result.cards[0].columns.length).toBeLessThanOrEqual(5)
      expect(result.cards[0].rows.length).toBeLessThanOrEqual(50)
    }
    expect(result.summary.length).toBeGreaterThan(5)
  })

  it('proposes learn_alias without writing, then applies it on confirm', async () => {
    const product = productByName('فرايداي')
    expect(product).toBeTruthy()
    const alias = 'سندوتش الجمعة'

    const ctx = toolCtx()
    const result = await tool('learn_alias').run({ entity: 'product', alias, target: product.name }, ctx)
    const data = result.data as any

    expect(data.actionId).toBeTruthy()
    expect(data.entity).toBe('product')
    expect(data.targetId).toBe(product.id)
    expect(ctx.cards[0]?.kind).toBe('action')
    if (ctx.cards[0]?.kind === 'action') {
      expect(ctx.cards[0].status).toBe('proposed')
      expect(ctx.cards[0].subject).toBe(product.name)
    }

    // Nothing written yet, and the name still resolves the way it did before.
    expect(getAliasTarget('product', alias)).toBeNull()

    const applied = executeAction(String(data.actionId))
    expect(applied.ok).toBe(true)
    expect(getAliasTarget('product', alias)).toBe(product.id)

    const resolved = resolveProduct(alias)
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.row.id).toBe(product.id)

    const aliases = await tool('list_aliases').run({ entity: 'product', limit: 10 }, toolCtx())
    const listed = (aliases.data as any).items.find((item: any) => item.targetId === product.id && item.alias === alias)
    expect(listed?.target).toBe(product.name)
    expect(aliases.cards[0]?.kind).toBe('table')
  })

  it('validates the alias and the target', async () => {
    const empty = await tool('learn_alias').run({ entity: 'product', alias: '   ', target: 'سجق' }, toolCtx())
    expect((empty.data as any).error).toBeTruthy()

    const missing = await tool('learn_alias').run({ entity: 'product', alias: 'اسم', target: 'مش موجود خالص' }, toolCtx())
    expect((missing.data as any).error).toBeTruthy()
  })
})
