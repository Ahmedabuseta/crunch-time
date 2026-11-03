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
})
