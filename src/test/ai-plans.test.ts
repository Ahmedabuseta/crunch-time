// Action sequences: a plan is a pending action that groups other pending
// actions. These tests cover ordering, stop-on-error, idempotency, cancel and
// the turn-ownership check that stops a plan from grabbing someone else's ids.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'ai-plans-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { createAction, executeAction, cancelAction, expireAction, getAction } = await import('../ai/actions')
const { WRITE_TOOLS } = await import('../ai/tools/write')

const products = () =>
  getSqlite().prepare('SELECT * FROM products WHERE active = 1 ORDER BY name LIMIT 3').all() as any[]

const priceOf = (id: string) =>
  Number((getSqlite().prepare('SELECT price FROM products WHERE id = ?').get(id) as any).price)

const preview = (subject: string) => ({
  title: 'تغيير سعر',
  subject,
  rows: [],
  result: 'ok',
})

const priceAction = (product: any, price: number) =>
  createAction('set_product_price', { productId: product.id, price }, preview(product.name))

const planAction = (ids: string[]) =>
  createAction('plan', { actionIds: ids }, {
    title: 'خطة تجريبية',
    subject: `${ids.length} خطوات`,
    rows: [],
    result: 'هيتنفّذوا بالترتيب',
  })

beforeAll(async () => {
  runMigrations()
  await seedDatabase()
})

afterAll(() => {
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('propose_actions tool', () => {
  it('groups two actions into one card and one plan', async () => {
    const [a, b] = products()
    const first = priceAction(a, Number(a.price) + 1)
    const second = priceAction(b, Number(b.price) + 1)
    const tool = WRITE_TOOLS.find((entry) => entry.name === 'propose_actions')!

    const ctx = { turnId: 't', cards: [] as any[], turnActionIds: [first.id, second.id], now: new Date() }
    const out = await tool.run({ title: 'تعديل سعرين', action_ids: [first.id, second.id] }, ctx)

    expect((out.data as any).planId).toBeTruthy()
    expect((out.data as any).steps).toBe(2)
    expect(ctx.cards).toHaveLength(1)
    expect(ctx.cards[0].kind).toBe('action')
    if (ctx.cards[0].kind === 'action') expect(ctx.cards[0].rows).toHaveLength(2)
  })

  it('refuses an id that was not proposed in this turn', async () => {
    const [a, b] = products()
    const first = priceAction(a, Number(a.price) + 2)
    const second = priceAction(b, Number(b.price) + 2)
    const tool = WRITE_TOOLS.find((entry) => entry.name === 'propose_actions')!

    const ctx = { turnId: 't', cards: [] as any[], turnActionIds: [], now: new Date() }
    const out = await tool.run({ title: 'تعديل سعرين', action_ids: [first.id, second.id] }, ctx)

    expect((out.data as any).error).toBeTruthy()
    expect(ctx.cards).toHaveLength(0)
  })
})

describe('plan execution', () => {
  it('applies every step in order', () => {
    const [a, b] = products()
    const firstTarget = priceOf(a.id) + 3
    const secondTarget = priceOf(b.id) + 4
    const first = priceAction(a, firstTarget)
    const second = priceAction(b, secondTarget)
    const plan = planAction([first.id, second.id])

    const result = executeAction(plan.id)

    expect(result.ok).toBe(true)
    expect(result.status).toBe('executed')
    expect(priceOf(a.id)).toBe(firstTarget)
    expect(priceOf(b.id)).toBe(secondTarget)
    expect(getAction(first.id)?.status).toBe('executed')
    expect(getAction(second.id)?.status).toBe('executed')
    expect(getAction(plan.id)?.status).toBe('executed')
  })

  it('applies at most once on a double confirm', () => {
    const [a] = products()
    const target = priceOf(a.id) + 5
    const first = priceAction(a, target)
    const other = priceAction(a, target + 1)
    const plan = planAction([first.id, other.id])

    expect(executeAction(plan.id).ok).toBe(true)
    const afterFirst = priceOf(a.id)
    expect(executeAction(plan.id).ok).toBe(true)
    expect(priceOf(a.id)).toBe(afterFirst)
  })

  it('stops at the first failing step and applies nothing after it', () => {
    const [productA, , productC] = products()
    const ingredients = getSqlite()
      .prepare('SELECT id FROM ingredients WHERE active = 1 LIMIT 2')
      .all() as { id: string }[]

    const beforeC = priceOf(productC.id)
    const stepA = priceAction(productA, priceOf(productA.id) + 6)
    const stepB = createAction('exchange_brand', {
      fromIngredientId: ingredients[0].id,
      fromPackages: 99_999,
      toIngredientId: ingredients[1].id,
      toPackages: 1,
    }, preview('مبادلة مستحيلة'))
    const stepC = priceAction(productC, beforeC + 7)
    const plan = planAction([stepA.id, stepB.id, stepC.id])

    const result = executeAction(plan.id)

    expect(result.ok).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('خطوة 2')
    expect(getAction(plan.id)?.status).toBe('failed')
    expect(getAction(stepA.id)?.status).toBe('executed')
    expect(priceOf(productC.id)).toBe(beforeC)
    expect(getAction(stepC.id)?.status).toBe('proposed')
  })

  it('cancels its children when the plan is cancelled', () => {
    const [a, b] = products()
    const first = priceAction(a, priceOf(a.id) + 8)
    const second = priceAction(b, priceOf(b.id) + 8)
    const plan = planAction([first.id, second.id])

    expect(cancelAction(plan.id).status).toBe('cancelled')
    expect(getAction(first.id)?.status).toBe('cancelled')
    expect(getAction(second.id)?.status).toBe('cancelled')
    expect(getAction(plan.id)?.status).toBe('cancelled')
  })

  it('expires its children when the plan expires', () => {
    const [a, b] = products()
    const first = priceAction(a, priceOf(a.id) + 9)
    const second = priceAction(b, priceOf(b.id) + 9)
    const plan = planAction([first.id, second.id])

    expect(expireAction(plan.id).status).toBe('expired')
    expect(getAction(first.id)?.status).toBe('expired')
    expect(getAction(second.id)?.status).toBe('expired')
  })

  it('refuses a plan whose first step already expired', () => {
    const [a, b] = products()
    const beforeA = priceOf(a.id)
    const first = priceAction(a, beforeA + 10)
    const second = priceAction(b, priceOf(b.id) + 10)
    expireAction(first.id)
    const plan = planAction([first.id, second.id])

    const result = executeAction(plan.id)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('خطوة 1')
    expect(priceOf(a.id)).toBe(beforeA)
  })
})
