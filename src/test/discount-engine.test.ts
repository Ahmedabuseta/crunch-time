import { describe, it, expect } from 'vitest'
import { computeDiscount, describeDiscount, type DiscountLine, type DiscountRule } from '../lib/discount-engine'

const line = (
  lineId: string,
  productId: string,
  lineTotal: number,
  over: Partial<DiscountLine> = {},
): DiscountLine => ({
  lineId,
  productId,
  unitTotal: lineTotal,
  quantity: 1,
  lineTotal,
  ...over,
})

const rule = (over: Partial<DiscountRule>): DiscountRule => ({
  id: 'd1',
  code: 'X',
  type: 'percentage',
  value: 0,
  ...over,
})

describe('order-level discounts', () => {
  it('takes a percentage of the subtotal', () => {
    const result = computeDiscount(rule({ type: 'percentage', value: 10 }), [], 250)
    expect(result.total).toBe(25)
    expect(result.lineDiscounts).toEqual({})
  })

  it('takes a fixed amount and never discounts more than the goods', () => {
    expect(computeDiscount(rule({ type: 'fixed', value: 40 }), [], 250).total).toBe(40)
    expect(computeDiscount(rule({ type: 'fixed', value: 900 }), [], 250).total).toBe(250)
    expect(computeDiscount(rule({ type: 'percentage', value: 500 }), [], 250).total).toBe(250)
  })

  it('ignores a negative or missing rule', () => {
    expect(computeDiscount(null, [], 100).total).toBe(0)
    expect(computeDiscount(rule({ type: 'fixed', value: -50 }), [], 100).total).toBe(0)
  })
})

describe('scoped discounts', () => {
  it('applies a percentage only to the selected products', () => {
    const scoped = rule({ type: 'percentage', value: 50, scope: 'products', productIds: ['p1'] })
    const result = computeDiscount(scoped, [line('a', 'p1', 100), line('b', 'p2', 100)], 200)
    expect(result.total).toBe(50)
    expect(result.lineDiscounts).toEqual({ a: 50 })
  })

  it('applies a percentage only to the selected categories', () => {
    const scoped = rule({ type: 'percentage', value: 25, scope: 'categories', categoryIds: ['cat-a'] })
    const result = computeDiscount(
      scoped,
      [line('a', 'p1', 100, { categoryId: 'cat-a' }), line('b', 'p2', 100, { categoryId: 'cat-b' })],
      200,
    )
    expect(result.total).toBe(25)
    expect(result.lineDiscounts).toEqual({ a: 25 })
  })

  it('spreads a fixed amount over matching lines, last line absorbing the remainder', () => {
    const scoped = rule({ type: 'fixed', value: 100, scope: 'products', productIds: ['p1'] })
    const result = computeDiscount(scoped, [line('a', 'p1', 100), line('b', 'p1', 100), line('c', 'p1', 100)], 300)
    expect(result.total).toBe(100)
    expect(result.lineDiscounts).toEqual({ a: 33, b: 33, c: 34 })
    expect(Object.values(result.lineDiscounts).reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  it('caps a fixed amount at the matching lines only', () => {
    const scoped = rule({ type: 'fixed', value: 500, scope: 'products', productIds: ['p1'] })
    const result = computeDiscount(scoped, [line('a', 'p1', 120), line('b', 'p2', 300)], 420)
    expect(result.total).toBe(120)
    expect(result.lineDiscounts).toEqual({ a: 120 })
  })
})

describe('buy X get Y', () => {
  const bogo = rule({ type: 'bogo', buyQty: 2, getQty: 1, getPercent: 100 })

  it('makes the cheapest unit free', () => {
    const result = computeDiscount(bogo, [line('a', 'p1', 100), line('b', 'p2', 60), line('c', 'p3', 40)], 200)
    expect(result.total).toBe(40)
    expect(result.lineDiscounts).toEqual({ c: 40 })
  })

  it('repeats for every complete group, cheapest first', () => {
    const lines = [
      line('a', 'p1', 100),
      line('b', 'p2', 60),
      line('c', 'p3', 40),
      line('d', 'p4', 30),
      line('e', 'p5', 20),
      line('f', 'p6', 10),
    ]
    const result = computeDiscount(bogo, lines, 260)
    expect(result.total).toBe(30)
    expect(result.lineDiscounts).toEqual({ e: 20, f: 10 })
  })

  it('takes a percentage of the cheapest unit', () => {
    const half = rule({ type: 'bogo', buyQty: 2, getQty: 1, getPercent: 50 })
    expect(computeDiscount(half, [line('a', 'p1', 100), line('b', 'p2', 60), line('c', 'p3', 40)], 200).total).toBe(20)
  })

  it('needs a complete group', () => {
    expect(computeDiscount(bogo, [line('a', 'p1', 100), line('b', 'p2', 60)], 160).total).toBe(0)
  })

  it('counts quantity on one line as separate units', () => {
    const result = computeDiscount(
      bogo,
      [line('a', 'p1', 200, { unitTotal: 100, quantity: 2 }), line('b', 'p2', 40)],
      240,
    )
    expect(result.total).toBe(40)
    expect(result.lineDiscounts).toEqual({ b: 40 })
  })

  it('only draws units from the selected scope', () => {
    const scoped = rule({
      type: 'bogo',
      buyQty: 2,
      getQty: 1,
      getPercent: 100,
      scope: 'products',
      productIds: ['p1'],
    })
    expect(computeDiscount(scoped, [line('a', 'p1', 100), line('b', 'p2', 60), line('c', 'p3', 40)], 200).total).toBe(0)
  })
})

describe('minimum subtotal', () => {
  it('stops below the minimum and explains why', () => {
    const minimum = rule({ type: 'percentage', value: 10, minSubtotal: 300 })
    const result = computeDiscount(minimum, [line('a', 'p1', 200)], 200)
    expect(result.total).toBe(0)
    expect(result.reason).toContain('300')
  })
})

describe('describeDiscount', () => {
  it('names the percentage, the scope and the buy-X-get-Y offer', () => {
    expect(describeDiscount(rule({ type: 'percentage', value: 15 }))).toBe('خصم 15%')
    expect(
      describeDiscount(rule({ mode: 'daily', type: 'percentage', value: 50, productName: 'كريب فراخ' })),
    ).toBe('خصم 50% على كريب فراخ')
    expect(describeDiscount(rule({ type: 'bogo', buyQty: 2, getQty: 1, getPercent: 100 }))).toBe(
      'اشتري 2 واحصل على 1 مجاناً',
    )
    expect(describeDiscount(rule({ type: 'percentage', value: 20, scope: 'products' }))).toBe(
      'خصم 20% على أصناف محددة',
    )
  })

  it('formats a fixed amount as money', () => {
    expect(describeDiscount(rule({ type: 'fixed', value: 1200 }))).toBe('خصم 1,200 ج.م')
  })

  it('is empty without a rule', () => {
    expect(describeDiscount(null)).toBe('')
    expect(describeDiscount(undefined)).toBe('')
  })
})
