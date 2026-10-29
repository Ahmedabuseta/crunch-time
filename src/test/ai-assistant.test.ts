// The assistant's database half: settings and the encrypted provider key,
// Arabic name resolution, one read tool end to end, and the promise that a
// confirmed write can only ever be applied once.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'ai-assistant-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { getSavedReply } = await import('../ai/guard/replies')
const { getUsageToday, recordUsage, withinBudget, todayKey } = await import('../ai/guard/budget')
const { getAiConfig, getProviderKey, updateAiConfig } = await import('../ai/config')
const { createAction, executeAction, expireAction, cancelAction, getAction } = await import('../ai/actions')
const { resolveProduct, resolveIngredient } = await import('../ai/tools/resolve')
const { READ_TOOLS } = await import('../ai/tools/read')
const { ALL_TOOLS, TOOLS, redact } = await import('../ai/tools')
const { getSettings } = await import('../backend/settings')

const readTool = (name: string) => {
  const tool = READ_TOOLS.find((entry) => entry.name === name)
  if (!tool) throw new Error(`missing read tool ${name}`)
  return tool
}

const firstProduct = () =>
  getSqlite().prepare('SELECT * FROM products WHERE active = 1 ORDER BY name LIMIT 1').get() as any

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('migration 011', () => {
  it('creates every assistant table', () => {
    const tables = getSqlite()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ai_%'")
      .all() as { name: string }[]
    const names = tables.map((t) => t.name).sort()
    expect(names).toEqual(['ai_actions', 'ai_messages', 'ai_replies', 'ai_threads', 'ai_usage'])
  })

  it('seeds the saved replies', () => {
    for (const key of ['off_topic', 'disabled', 'no_key', 'budget', 'greeting'] as const) {
      expect(getSavedReply(key).length).toBeGreaterThan(10)
    }
  })
})

describe('assistant config', () => {
  it('stores a key encrypted and can read it back', () => {
    expect(updateAiConfig({ apiKey: 'sk-test-0123456789abcdef' })).toEqual({ ok: true })

    const stored = getSqlite().prepare('SELECT ai_api_key_enc FROM settings WHERE id = ?')
      .get('settings') as { ai_api_key_enc: string }
    expect(stored.ai_api_key_enc).toBeTruthy()
    expect(stored.ai_api_key_enc).not.toContain('sk-test')

    expect(getAiConfig().hasKey).toBe(true)
    expect(getProviderKey()).toBe('sk-test-0123456789abcdef')
  })

  it('never leaks the key through getSettings', () => {
    const settings = getSettings() as Record<string, unknown>
    expect(settings.aiApiKeyEnc).toBeUndefined()
    expect(settings.aiKeyCipher).toBeUndefined()
    expect(settings.aiHasKey).toBe(true)
    expect(JSON.stringify(settings)).not.toContain('sk-test')
  })

  it('refuses to enable without a key', () => {
    updateAiConfig({ apiKey: '' })
    expect(getAiConfig().hasKey).toBe(false)
    const result = updateAiConfig({ enabled: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('مفتاح')
  })

  it('validates the base url and the model name', () => {
    expect(updateAiConfig({ baseUrl: 'not-a-url' }).ok).toBe(false)
    expect(updateAiConfig({ baseUrl: 'https://api.groq.com/openai/v1' }).ok).toBe(true)
    expect(updateAiConfig({ model: 'bad model!' }).ok).toBe(false)
    expect(updateAiConfig({ model: 'llama-3.3-70b-versatile' }).ok).toBe(true)
  })

  it('offers a masked hint but never the key', () => {
    updateAiConfig({ apiKey: 'sk-live-abcdefghijklmnop' })
    const config = getAiConfig()
    expect(JSON.stringify(config)).not.toContain('sk-live')
  })
})

describe('name resolution', () => {
  it('finds a product by its Arabic name', () => {
    const product = firstProduct()
    const resolved = resolveProduct(String(product.name))
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.row.id).toBe(product.id)
  })

  it('finds a product from a prefix', () => {
    const product = firstProduct()
    const prefix = String(product.name).slice(0, 4)
    const resolved = resolveProduct(prefix)
    expect(resolved.ok).toBe(true)
  })

  it('explains itself instead of guessing', () => {
    const resolved = resolveProduct('صنف مش موجود خالص')
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) expect(resolved.error.length).toBeGreaterThan(5)
  })

  it('resolves ingredients too', () => {
    const ingredient = getSqlite().prepare('SELECT name FROM ingredients WHERE active = 1 LIMIT 1').get() as any
    const resolved = resolveIngredient(String(ingredient.name))
    expect(resolved.ok).toBe(true)
  })
})

describe('read tools', () => {
  it('returns a metrics table for item margins', async () => {
    const result = await readTool('item_margins').run({ limit: 5 }, { turnId: 't', cards: [], now: new Date() })
    expect(result.summary.length).toBeGreaterThan(0)
    expect(Array.isArray((result.data as any).items)).toBe(true)
    expect(result.cards.length).toBeGreaterThan(0)
    expect(result.cards[0].kind).toBe('table')
  })

  it('suggests packages for short stock', async () => {
    const result = await readTool('inventory_status').run({}, { turnId: 't', cards: [], now: new Date() })
    const data = result.data as any
    expect(data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Array.isArray(data.toOrder)).toBe(true)
    for (const row of data.toOrder) {
      expect(row.suggestedPackages).toBeGreaterThan(0)
      expect(row.estimatedCost).toBeGreaterThanOrEqual(0)
    }
  })

  it('never emits a full phone number', async () => {
    const result = await readTool('orders_search').run({ limit: 5 }, { turnId: 't', cards: [], now: new Date() })
    for (const order of (result.data as any).orders) {
      if (order.phone) expect(order.phone).toMatch(/^••••\d{0,4}$/)
    }
  })
})

describe('tool registry', () => {
  it('registers eight reads and five writes', () => {
    expect(READ_TOOLS).toHaveLength(8)
    expect(ALL_TOOLS.filter((tool) => tool.write)).toHaveLength(5)
    expect(TOOLS.size).toBe(13)
  })

  it('gives every tool a description and a schema', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.schema).toBeTruthy()
    }
  })

  it('redacts a tool payload before it reaches a model', () => {
    const out = redact({ apiKey: 'sk-1', customerPhone: '01012345678' }) as any
    expect(out).toEqual({ customerPhone: '••••5678' })
  })
})

describe('pending actions', () => {
  it('proposes without writing', () => {
    const product = firstProduct()
    const before = Number(product.price)
    const action = createAction('set_product_price', { productId: product.id, price: before + 5 }, {
      title: 'تغيير سعر', subject: product.name, rows: [], result: 'ok',
    })
    const after = getSqlite().prepare('SELECT price FROM products WHERE id = ?').get(product.id) as any
    expect(Number(after.price)).toBe(before)
    expect(getAction(action.id)?.status).toBe('proposed')
  })

  it('applies exactly once, even when confirmed twice', () => {
    const product = firstProduct()
    const target = Number(product.price) + 7
    const action = createAction('set_product_price', { productId: product.id, price: target }, {
      title: 'تغيير سعر', subject: product.name, rows: [], result: 'ok',
    })

    const first = executeAction(action.id)
    expect(first.ok).toBe(true)
    expect(first.status).toBe('executed')

    const price = getSqlite().prepare('SELECT price FROM products WHERE id = ?').get(product.id) as any
    expect(Number(price.price)).toBe(target)

    // A retried activity or a double tap must not apply the delta again.
    const second = executeAction(action.id)
    expect(second.ok).toBe(true)
    const again = getSqlite().prepare('SELECT price FROM products WHERE id = ?').get(product.id) as any
    expect(Number(again.price)).toBe(target)
  })

  it('writes one audit row per applied action', () => {
    const count = () => (getSqlite().prepare("SELECT COUNT(*) AS c FROM audit_log WHERE action LIKE 'assistant.%'").get() as { c: number }).c
    const before = count()
    const product = firstProduct()
    const action = createAction('set_product_price', { productId: product.id, price: Number(product.price) + 3 }, {
      title: 't', subject: product.name, rows: [], result: 'ok',
    })
    executeAction(action.id)
    executeAction(action.id)
    expect(count()).toBe(before + 1)
  })

  it('refuses an expired action', () => {
    const product = firstProduct()
    const action = createAction('set_product_price', { productId: product.id, price: 1 }, {
      title: 't', subject: product.name, rows: [], result: 'ok',
    })
    expireAction(action.id)
    const result = executeAction(action.id)
    expect(result.ok).toBe(false)
    expect(result.status).toBe('expired')
  })

  it('refuses a cancelled action', () => {
    const product = firstProduct()
    const action = createAction('set_product_price', { productId: product.id, price: 2 }, {
      title: 't', subject: product.name, rows: [], result: 'ok',
    })
    cancelAction(action.id)
    const result = executeAction(action.id)
    expect(result.ok).toBe(false)
    expect(result.status).toBe('cancelled')
  })

  it('keeps a backend refusal proposed and records why', () => {
    // `exchange` is the one write that refuses up front: it will not return
    // more of the old brand than is on hand.
    const from = getSqlite().prepare('SELECT * FROM ingredients WHERE active = 1 LIMIT 1').get() as any
    const to = getSqlite().prepare('SELECT * FROM ingredients WHERE active = 1 AND id <> ? LIMIT 1').get(from.id) as any
    const action = createAction('exchange_brand', {
      fromIngredientId: from.id,
      fromPackages: 99_999,
      toIngredientId: to.id,
      toPackages: 1,
    }, { title: 't', subject: from.name, rows: [], result: 'ok' })

    const result = executeAction(action.id)
    expect(result.ok).toBe(false)
    expect(getAction(action.id)?.status).toBe('proposed')
    expect(getAction(action.id)?.error).toBeTruthy()
  })
})

describe('usage accounting', () => {
  it('accumulates and bounds a day', () => {
    const day = '2031-01-01'
    recordUsage({ promptTokens: 100, completionTokens: 50 }, day)
    recordUsage({ promptTokens: 25, completionTokens: 25 }, day)
    const usage = getUsageToday(day)
    expect(usage.promptTokens).toBe(125)
    expect(usage.completionTokens).toBe(75)
    expect(usage.total).toBe(200)
    expect(withinBudget(200, day)).toBe(true)
    expect(withinBudget(199, day)).toBe(false)
    expect(withinBudget(0, day)).toBe(true)
  })

  it('uses a local date key', () => {
    expect(todayKey(new Date('2031-05-06T10:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
