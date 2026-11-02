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
const { MANAGE_READ_TOOLS } = await import('../ai/tools/manage-read')
const { MANAGE_WRITE_TOOLS } = await import('../ai/tools/manage-write')
const { ANALYTICS_TOOLS } = await import('../ai/tools/analytics')
const { ALIAS_TOOLS } = await import('../ai/tools/aliases')
const { ALL_TOOLS, TOOLS, redact } = await import('../ai/tools')
const { runTool } = await import('../ai/activities')
const { getSettings } = await import('../backend/settings')

const readTool = (name: string) => {
  const tool = READ_TOOLS.find((entry) => entry.name === name)
  if (!tool) throw new Error(`missing read tool ${name}`)
  return tool
}

const manageReadTool = (name: string) => {
  const tool = MANAGE_READ_TOOLS.find((entry) => entry.name === name)
  if (!tool) throw new Error(`missing manage read tool ${name}`)
  return tool
}

const manageWriteTool = (name: string) => {
  const tool = MANAGE_WRITE_TOOLS.find((entry) => entry.name === name)
  if (!tool) throw new Error(`missing manage write tool ${name}`)
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
    expect(names).toEqual(['ai_actions', 'ai_aliases', 'ai_messages', 'ai_replies', 'ai_threads', 'ai_unresolved', 'ai_usage'])
  })

  it('seeds the saved replies', () => {
    for (const key of ['disabled', 'no_key', 'budget', 'greeting'] as const) {
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
    expect(updateAiConfig({ model: 'openai/gpt-oss-120b' }).ok).toBe(true)
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

  it('resolves a product written with the Arabic definite article', () => {
    const sausage = getSqlite().prepare("SELECT name FROM products WHERE active = 1 AND name = 'سجق'").get() as any
    if (!sausage) return
    const resolved = resolveProduct('السجق')
    expect(resolved.ok).toBe(true)
    if (resolved.ok) expect(resolved.row.name).toBe('سجق')
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
  it('registers every report, analytics, catalog and alias tool', () => {
    expect(READ_TOOLS).toHaveLength(8)
    expect(MANAGE_READ_TOOLS).toHaveLength(10)
    expect(ANALYTICS_TOOLS).toHaveLength(1)
    expect(MANAGE_WRITE_TOOLS).toHaveLength(17)
    expect(ALIAS_TOOLS).toHaveLength(3)
    expect(ALL_TOOLS.filter((tool) => tool.write)).toHaveLength(23)
    expect(TOOLS.size).toBe(44)
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

describe('catalog tools', () => {
  const toolCtx = () => ({ turnId: 't', cards: [] as any[], now: new Date() })

  it('answers a single product price without the margin table', async () => {
    const product = firstProduct()
    const result = await manageReadTool('product_price').run({ product: product.name }, toolCtx())
    expect((result.data as any).price).toBe(Number(product.price))
    expect(result.cards[0]?.kind).toBe('metrics')
    expect(result.summary).toContain(product.name)
  })

  it('lists products under a price ceiling with their cost', async () => {
    const result = await manageReadTool('product_list').run({ max_price: 100, limit: 50 }, toolCtx())
    const items = (result.data as any).items as any[]
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.price).toBeLessThanOrEqual(100)
      expect(typeof item.costPrice).toBe('number')
    }
    expect(result.summary).toContain('100')
  })

  it('runs query_metrics through the activity boundary', async () => {
    const result = await runTool({
      turnId: 't',
      name: 'query_metrics',
      args: { metric: 'revenue', dimension: 'product', from: '2000-01-01', to: '2100-01-01', limit: 5 },
    })
    expect(result.summary.length).toBeGreaterThan(5)
    expect(Array.isArray((result.data as any).rows)).toBe(true)
  })

  it('returns invalid tool arguments to the model instead of killing the turn', async () => {
    const result = await runTool({
      turnId: 't',
      name: 'product_price',
      args: { product: 123 },
    })
    expect((result.data as any).error).toBeTruthy()
  })

  it('reads full product and ingredient records', async () => {
    const product = firstProduct()
    const productResult = await manageReadTool('product_details').run({ product: product.name }, toolCtx())
    const productData = productResult.data as any
    expect(productData.product.id).toBe(product.id)
    expect(Array.isArray(productData.recipe)).toBe(true)
    expect(Array.isArray(productData.addons)).toBe(true)
    expect(Array.isArray(productData.modifierGroups)).toBe(true)

    const ingredient = getSqlite().prepare('SELECT * FROM ingredients WHERE active = 1 ORDER BY name LIMIT 1').get() as any
    const ingredientResult = await manageReadTool('ingredient_details').run({ ingredient: ingredient.name }, toolCtx())
    const ingredientData = ingredientResult.data as any
    expect(ingredientData.ingredient.id).toBe(ingredient.id)
    expect(Array.isArray(ingredientData.products)).toBe(true)

    const categories = await manageReadTool('category_list').run({}, toolCtx())
    expect((categories.data as any).categories.length).toBeGreaterThan(0)
  })

  it('proposes a new product, then applies it only on confirmation', async () => {
    const category = getSqlite().prepare('SELECT name FROM categories WHERE active = 1 ORDER BY name LIMIT 1').get() as any
    const name = `AI Test Product ${Date.now()}`
    const ctx = toolCtx()
    const result = await manageWriteTool('create_product').run({
      name,
      price: 77,
      category: category.name,
      description: 'منتج اختبار',
    }, ctx)

    const actionId = (result.data as any).actionId as string
    expect(actionId).toBeTruthy()
    expect(ctx.cards[0].kind).toBe('action')
    expect(getSqlite().prepare('SELECT id FROM products WHERE name = ?').get(name)).toBeUndefined()

    const applied = executeAction(actionId)
    expect(applied.ok).toBe(true)
    const row = getSqlite().prepare('SELECT * FROM products WHERE name = ?').get(name) as any
    expect(row.price).toBe(77)
    expect(Boolean(row.active)).toBe(true)
  })

  it('edits an ingredient through a pending action', async () => {
    const ingredient = getSqlite().prepare('SELECT * FROM ingredients WHERE active = 1 ORDER BY name LIMIT 1').get() as any
    const nextMin = Number(ingredient.min_stock) + 2
    const ctx = toolCtx()
    const result = await manageWriteTool('update_ingredient').run({
      ingredient: ingredient.name,
      min_stock: nextMin,
    }, ctx)
    const actionId = (result.data as any).actionId as string
    expect(ctx.cards[0].kind).toBe('action')

    const applied = executeAction(actionId)
    expect(applied.ok).toBe(true)
    const row = getSqlite().prepare('SELECT min_stock FROM ingredients WHERE id = ?').get(ingredient.id) as any
    expect(Number(row.min_stock)).toBe(nextMin)
  })

  it('adds, updates and removes recipe lines', async () => {
    const product = firstProduct()
    const ingredient = getSqlite().prepare('SELECT name FROM ingredients WHERE active = 1 ORDER BY name LIMIT 1').get() as any
    const before = (getSqlite().prepare('SELECT COUNT(*) AS c FROM recipes WHERE product_id = ?').get(product.id) as any).c

    const addCtx = toolCtx()
    const addResult = await manageWriteTool('add_recipe_line').run({
      product: product.name,
      ingredient: ingredient.name,
      quantity: 2,
    }, addCtx)
    const addAction = (addResult.data as any).actionId as string
    expect(addCtx.cards[0].kind).toBe('action')
    expect(executeAction(addAction).ok).toBe(true)
    expect((getSqlite().prepare('SELECT COUNT(*) AS c FROM recipes WHERE product_id = ?').get(product.id) as any).c).toBe(before + 1)

    const line = getSqlite().prepare('SELECT id, quantity_per_unit FROM recipes WHERE product_id = ? ORDER BY rowid DESC LIMIT 1').get(product.id) as any
    const updateCtx = toolCtx()
    const updateResult = await manageWriteTool('update_recipe_line').run({ line_id: line.id, quantity: 5 }, updateCtx)
    const updateAction = (updateResult.data as any).actionId as string
    expect(executeAction(updateAction).ok).toBe(true)
    expect(Number((getSqlite().prepare('SELECT quantity_per_unit FROM recipes WHERE id = ?').get(line.id) as any).quantity_per_unit)).toBe(5)

    const removeCtx = toolCtx()
    const removeResult = await manageWriteTool('remove_recipe_line').run({ line_id: line.id }, removeCtx)
    const removeAction = (removeResult.data as any).actionId as string
    expect(executeAction(removeAction).ok).toBe(true)
    expect((getSqlite().prepare('SELECT COUNT(*) AS c FROM recipes WHERE product_id = ?').get(product.id) as any).c).toBe(before)
  })

  it('returns the pending action card from a write tool', async () => {
    const category = getSqlite().prepare('SELECT name FROM categories WHERE active = 1 ORDER BY name LIMIT 1').get() as any
    const result = await runTool({
      turnId: 't',
      name: 'create_product',
      args: {
        name: `AI Card Product ${Date.now()}`,
        price: 66,
        category: category.name,
      },
    })
    expect(result.cards[0]?.kind).toBe('action')
    if (result.cards[0]?.kind === 'action') {
      expect(result.cards[0].status).toBe('proposed')
    }
  })

  it('creates a sub-recipe and a sub-recipe ingredient', async () => {
    const name = `AI Test Sub ${Date.now()}`
    const ctx = toolCtx()
    const created = await manageWriteTool('create_subrecipe').run({ name, unit: 'كجم' }, ctx)
    const createActionId = (created.data as any).actionId as string
    expect(executeAction(createActionId).ok).toBe(true)

    const sub = getSqlite().prepare('SELECT id FROM sub_recipes WHERE name = ?').get(name) as any
    const ingredient = getSqlite().prepare('SELECT name FROM ingredients WHERE active = 1 ORDER BY name LIMIT 1').get() as any
    const addCtx = toolCtx()
    const added = await manageWriteTool('add_subrecipe_ingredient').run({
      subrecipe: name,
      ingredient: ingredient.name,
      quantity: 1,
    }, addCtx)
    const addActionId = (added.data as any).actionId as string
    expect(executeAction(addActionId).ok).toBe(true)
    const lines = getSqlite().prepare('SELECT COUNT(*) AS c FROM sub_recipe_ingredients WHERE sub_recipe_id = ?').get(sub.id) as any
    expect(lines.c).toBe(1)
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
