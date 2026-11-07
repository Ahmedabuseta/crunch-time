// The deterministic half of the step reviewer.
//
// These checks decide, without a model call, whether a step has gone wrong. That
// makes them both the cheapest part of the loop and the part that must never be
// wrong: a false positive steals a step from a turn that was doing fine, and a
// false negative lets a write about the wrong record reach a confirm button.
import { describe, expect, it } from 'vitest'
import {
  MAX_TOTAL_FAILURES,
  allCallsFailed,
  deterministicReview,
  failedExchanges,
  reviewWorthCalling,
  shouldBrake,
  wrongSubjectWrite,
  type ToolCall,
  type ToolExchange,
} from '../ai/loop'

const call = (name: string, args: unknown = {}): ToolCall => ({ id: `id-${name}`, name, args })

const exchange = (name: string, data: unknown, args: unknown = {}): ToolExchange => ({
  id: `id-${name}`,
  name,
  args,
  data,
  summary: '',
})

describe('allCallsFailed', () => {
  it('is true only when every call failed', () => {
    expect(allCallsFailed([{ data: { error: 'لا' } }, { data: { error: 'برضه لا' } }])).toBe(true)
  })

  it('is false when one call worked', () => {
    expect(allCallsFailed([{ data: { error: 'لا' } }, { data: { rows: [] } }])).toBe(false)
  })

  it('is false for a step with no calls', () => {
    // An empty step is the answer step, not a failed one.
    expect(allCallsFailed([])).toBe(false)
  })
})

describe('wrongSubjectWrite', () => {
  it('flags a write about something the owner never said', () => {
    const result = wrongSubjectWrite('عدّل سعر الكريب', [
      { name: 'set_product_price', data: { actionId: 'a1', subject: 'السجق', from: 90, to: 95 } },
    ])
    expect(result).toBe('السجق')
  })

  it('accepts a subject the owner named', () => {
    const result = wrongSubjectWrite('عدّل سعر السجق', [
      { name: 'set_product_price', data: { actionId: 'a1', subject: 'السجق', from: 90, to: 95 } },
    ])
    expect(result).toBeNull()
  })

  it('matches through Arabic spelling differences', () => {
    // "الكريب" vs "كريب", and a ta marbuta written as a heh.
    const result = wrongSubjectWrite('عدل سعر الكريب', [
      { name: 'set_product_price', data: { actionId: 'a1', subject: 'كريب' } },
    ])
    expect(result).toBeNull()
  })

  it('matches a multi-word subject on any of its words', () => {
    const result = wrongSubjectWrite('عدّل سعر الفراخ', [
      { name: 'set_product_price', data: { actionId: 'a1', subject: 'فراخ مشوية' } },
    ])
    expect(result).toBeNull()
  })

  it('ignores read tools, which carry no action', () => {
    const result = wrongSubjectWrite('كام السجق', [
      { name: 'product_price', data: { product: 'كريب', price: 90 } },
    ])
    expect(result).toBeNull()
  })

  it('says nothing when the owner gave no words to compare', () => {
    expect(wrongSubjectWrite('؟', [{ name: 'set_product_price', data: { actionId: 'a1', subject: 'السجق' } }])).toBeNull()
  })
})

describe('deterministicReview', () => {
  it('blocks a write about the wrong subject before anything is shown', () => {
    const review = deterministicReview({
      message: 'عدّل سعر الكريب',
      stepCalls: [call('set_product_price')],
      stepResults: [{ name: 'set_product_price', data: { actionId: 'a1', subject: 'السجق' } }],
      failedThisTurn: [],
    })
    expect(review?.verdict).toBe('block')
    expect(review?.verdict === 'block' && review.note).toContain('السجق')
  })

  it('blocks a step where everything failed', () => {
    const review = deterministicReview({
      message: 'كام السجق',
      stepCalls: [call('product_price'), call('product_list')],
      stepResults: [
        { name: 'product_price', data: { error: 'مش موجود' } },
        { name: 'product_list', data: { error: 'فشل' } },
      ],
      failedThisTurn: [],
    })
    expect(review?.verdict).toBe('block')
  })

  it('steers when the step repeats a dead end', () => {
    const review = deterministicReview({
      message: 'كام السجق',
      stepCalls: [call('product_price', { product: 'سجق' })],
      stepResults: [{ name: 'product_price', data: { rows: [] } }],
      failedThisTurn: [exchange('product_price', { error: 'مش موجود' }, { product: 'سجق' })],
    })
    expect(review?.verdict).toBe('steer')
  })

  it('passes an ordinary step', () => {
    const review = deterministicReview({
      message: 'كام السجق',
      stepCalls: [call('product_price', { product: 'سجق' })],
      stepResults: [{ name: 'product_price', data: { product: 'سجق', price: 95 } }],
      failedThisTurn: [],
    })
    expect(review).toBeNull()
  })
})

describe('reviewWorthCalling', () => {
  it('never spends a call on a step that ran no tools', () => {
    expect(reviewWorthCalling({ stepResults: 0, remaining: 10_000, limit: 100_000 })).toBe(false)
  })

  it('skips the review when the budget is nearly gone', () => {
    expect(reviewWorthCalling({ stepResults: 1, remaining: 5_000, limit: 100_000 })).toBe(false)
  })

  it('reviews while there is room', () => {
    expect(reviewWorthCalling({ stepResults: 1, remaining: 50_000, limit: 100_000 })).toBe(true)
  })

  it('reviews when the owner set no cap', () => {
    expect(reviewWorthCalling({ stepResults: 1, remaining: null, limit: 0 })).toBe(true)
  })
})

describe('block and the failure brake', () => {
  it('a block is a different brake from the failure count', () => {
    // One failed call does not trip the counter, but the reviewer can still
    // block the step — the two signals are independent on purpose.
    const failed = [exchange('product_price', { error: 'مش موجود' })]
    expect(shouldBrake(1, 1)).toBe(false)
    expect(failedExchanges(failed)).toHaveLength(1)
    expect(shouldBrake(MAX_TOTAL_FAILURES, MAX_TOTAL_FAILURES)).toBe(true)
  })
})
