// The pure loop helpers: idempotent call signatures, dedupe, budgets and the
// deterministic fallback answer used when a turn runs out of steps.
import { describe, expect, it } from 'vitest'
import {
  MAX_STEPS,
  buildTurnState,
  callSignature,
  duplicateResult,
  fallbackAnswer,
  planCalls,
  toolFailed,
  type ToolCall,
  type ToolExchange,
} from '../ai/loop'

const call = (id: string, name: string, args: unknown): ToolCall => ({ id, name, args })

describe('callSignature', () => {
  it('ignores object key order', () => {
    expect(callSignature('x', { a: 1, b: 2 })).toBe(callSignature('x', { b: 2, a: 1 }))
  })

  it('distinguishes different arguments and names', () => {
    expect(callSignature('x', { a: 1 })).not.toBe(callSignature('x', { a: 2 }))
    expect(callSignature('x', { a: 1 })).not.toBe(callSignature('y', { a: 1 }))
  })

  it('ignores undefined values', () => {
    expect(callSignature('x', { a: 1, b: undefined })).toBe(callSignature('x', { a: 1 }))
  })
})

describe('planCalls', () => {
  it('skips a repeated identical call', () => {
    const seen = new Set([callSignature('product_price', { product: 'سجق' })])
    const { run, skipped } = planCalls(
      [call('1', 'product_price', { product: 'سجق' }), call('2', 'product_price', { product: 'كريب' })],
      seen,
      12,
    )
    expect(run).toHaveLength(1)
    expect(run[0].id).toBe('2')
    expect(skipped).toEqual([{ call: expect.objectContaining({ id: '1' }), reason: 'duplicate' }])
  })

  it('dedupes within the same step', () => {
    const { run, skipped } = planCalls(
      [call('1', 'product_price', { product: 'سجق' }), call('2', 'product_price', { product: 'سجق' })],
      new Set(),
      12,
    )
    expect(run).toHaveLength(1)
    expect(skipped).toHaveLength(1)
  })

  it('stops at the remaining budget', () => {
    const { run, skipped } = planCalls(
      [call('1', 'a', {}), call('2', 'b', {}), call('3', 'c', {})],
      new Set(),
      2,
    )
    expect(run.map((entry) => entry.name)).toEqual(['a', 'b'])
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toBe('budget')
  })
})

describe('duplicateResult', () => {
  it('reuses the earlier summary', () => {
    const previous: ToolExchange = { id: '1', name: 'x', args: {}, data: {}, summary: 'المبيعات 4200' }
    expect(duplicateResult(previous).summary).toContain('4200')
    expect(duplicateResult(previous).data).toEqual({ duplicate: true })
  })
})

describe('toolFailed', () => {
  it('reads a structured error', () => {
    expect(toolFailed({ data: { error: 'لا' } })).toBe(true)
    expect(toolFailed({ data: { rows: [] } })).toBe(false)
    expect(toolFailed(undefined)).toBe(false)
  })
})

describe('buildTurnState', () => {
  it('carries the last exchanges and caps cards at six', () => {
    const exchanges: ToolExchange[] = [
      { id: '1', name: 'a', args: {}, data: {}, summary: 'أ' },
      { id: '2', name: 'b', args: {}, data: {}, summary: 'ب' },
    ]
    const state = buildTurnState(2, MAX_STEPS, exchanges, ['1', '2', '3', '4', '5', '6', '7'])
    expect(state.step).toBe(2)
    expect(state.maxSteps).toBe(MAX_STEPS)
    expect(state.ran).toHaveLength(2)
    expect(state.cardIds).toHaveLength(6)
  })
})

describe('fallbackAnswer', () => {
  it('uses the last three summaries', () => {
    const exchanges: ToolExchange[] = [
      { id: '1', name: 'a', args: {}, data: {}, summary: 'واحد' },
      { id: '2', name: 'b', args: {}, data: {}, summary: 'اتنين' },
      { id: '3', name: 'c', args: {}, data: {}, summary: 'تلاتة' },
      { id: '4', name: 'd', args: {}, data: {}, summary: 'أربعة' },
    ]
    const text = fallbackAnswer(exchanges)
    expect(text).toContain('اتنين')
    expect(text).toContain('تلاتة')
    expect(text).toContain('أربعة')
    expect(text).not.toContain('واحد')
    expect(text.length).toBeLessThanOrEqual(780)
  })

  it('asks for context when nothing ran', () => {
    expect(fallbackAnswer([])).toContain('توضيح')
  })
})
