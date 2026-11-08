// The prompt's own contract: only exposed tools are named, the live step state
// is present, and the whole thing stays small enough for an 8k-TPM provider.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { buildSystemPrompt, PROMPT_VERSION, type TurnFacts } from '../ai/prompt'
import type { ToolDef } from '../ai/tools/types'

const facts: TurnFacts = {
  restaurantName: 'كرنش تايم',
  currencyLabel: 'ج.م',
  today: '2026-11-03',
  weekday: 'الثلاثاء',
  conversationSummary: null,
  taxPercent: 14,
  deliveryFee: 25,
  storePhone: '01000000000',
}

const tool = (name: string, write = false): ToolDef => ({
  name,
  description: `وصف ${name}`,
  schema: z.object({}),
  write,
  run: async () => ({ data: {}, summary: '', cards: [] }),
})

const state = (overrides: Partial<Parameters<typeof buildSystemPrompt>[0]['state']> = {}) => ({
  step: 1,
  maxSteps: 8,
  ran: [
    { name: 'query_metrics', summary: 'إجمالي المبيعات 4,200' },
    { name: 'top_items', summary: 'أعلى صنف: سجق' },
  ],
  failed: [],
  cardIds: ['card-0'],
  ...overrides,
})

describe('system prompt', () => {
  it('has a version string for the turn trace', () => {
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('names only the tools exposed on this step', () => {
    const system = buildSystemPrompt({
      facts,
      state: state(),
      tools: [tool('product_price'), tool('set_product_price', true)],
      followupAllowed: true,
    })

    expect(system).toContain('product_price')
    expect(system).toContain('set_product_price')
    expect(system).not.toContain('record_waste')
    expect(system).toContain('فاضل 7')
    expect(system).toContain('query_metrics → إجمالي المبيعات 4,200')
  })

  it('adds the wrap-up nudge near the end', () => {
    const system = buildSystemPrompt({
      facts,
      state: state({ step: 7 }),
      tools: [tool('product_price')],
      followupAllowed: true,
    })
    expect(system).toContain('آخر خطوة')
  })

  it('includes the repair note when numbers were invented', () => {
    const system = buildSystemPrompt({
      facts,
      state: state(),
      tools: [tool('product_price')],
      followupAllowed: true,
      repair: ['9999'],
    })
    expect(system).toContain('9999')
    expect(system).toContain('تصحيح مطلوب')
  })

  it('renders the stored summary as context', () => {
    const system = buildSystemPrompt({
      facts: { ...facts, conversationSummary: 'سأل عن أسعار السجق' },
      state: state(),
      tools: [],
      followupAllowed: false,
    })
    expect(system).toContain('سأل عن أسعار السجق')
  })

  it('names the turn dead ends so the model stops re-trying them', () => {
    const system = buildSystemPrompt({
      facts,
      state: state({
        failed: [{ name: 'product_price', summary: 'الصنف مش موجود' }],
      }),
      tools: [tool('product_price')],
      followupAllowed: true,
    })
    expect(system).toContain('طرق مسدودة')
    expect(system).toContain('product_price فشلت')
  })

  it('omits the dead-end section when every call succeeded', () => {
    const system = buildSystemPrompt({
      facts,
      state: state(),
      tools: [tool('product_price')],
      followupAllowed: true,
    })
    expect(system).not.toContain('طرق مسدودة')
  })

  it('stays under a small-model budget with twelve tools', () => {
    const tools = Array.from({ length: 12 }, (_, index) => tool(`tool_${index}`))
    const system = buildSystemPrompt({ facts, state: state(), tools, followupAllowed: true })
    expect(system.length).toBeLessThan(12_000)
  })

  it('mentions the batch rule only when propose_actions is exposed', () => {
    const without = buildSystemPrompt({ facts, state: state(), tools: [tool('product_price')], followupAllowed: true })
    const withPlan = buildSystemPrompt({
      facts,
      state: state(),
      tools: [tool('product_price'), tool('propose_actions', true)],
      followupAllowed: true,
    })
    expect(without).not.toContain('## التعديلات المتسلسلة')
    expect(withPlan).toContain('## التعديلات المتسلسلة')
  })

  it('renders the schema only when SQL is callable', () => {
    const digest = '- orders: id, status, total'
    const withSql = buildSystemPrompt({
      facts,
      state: state(),
      tools: [tool('query_database')],
      followupAllowed: true,
      schema: digest,
    })
    const withoutSql = buildSystemPrompt({
      facts,
      state: state(),
      tools: [tool('product_price')],
      followupAllowed: true,
      schema: digest,
    })
    expect(withSql).toContain('## مخطط قاعدة البيانات')
    expect(withSql).toContain('orders: id, status, total')
    // Every other turn must not pay the tokens for a digest it cannot use.
    expect(withoutSql).not.toContain('## مخطط قاعدة البيانات')
  })

  it('renders the reviewer note last, only when given', () => {
    const steered = buildSystemPrompt({
      facts,
      state: state(),
      tools: [tool('product_price')],
      followupAllowed: true,
      steer: 'متجربش تاني — جاوب من اللي عندك',
    })
    expect(steered).toContain('## ملاحظة المراجع')
    expect(steered).toContain('متجربش تاني')
    // Last: the freshest instruction a small model will read.
    expect(steered.trimEnd().endsWith('جاوب من اللي عندك')).toBe(true)

    const plain = buildSystemPrompt({ facts, state: state(), tools: [tool('product_price')], followupAllowed: true })
    expect(plain).not.toContain('## ملاحظة المراجع')
  })

  it('stays under a small-model budget with twelve tools, schema and a steer', () => {
    const tools = Array.from({ length: 12 }, (_, index) => tool(`tool_${index}`))
    const system = buildSystemPrompt({
      facts,
      state: state(),
      tools: [...tools, tool('query_database')],
      followupAllowed: true,
      schema: '- orders: id, status, total\n- products: id, name, price',
      steer: 'جاوب من اللي عندك',
    })
    expect(system.length).toBeLessThan(13_500)
  })
})
