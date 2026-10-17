import { describe, expect, it } from 'vitest';
import { computeDiscount, describeDiscount, type DiscountLine, type DiscountRule } from './discount';

const line = (lineId: string, productId: string, lineTotal: number): DiscountLine => ({
  lineId,
  productId,
  lineTotal,
});

const rule = (over: Partial<DiscountRule>): DiscountRule => ({
  id: 'd1',
  code: 'X',
  type: 'percentage',
  value: 0,
  ...over,
});

describe('order-level codes', () => {
  it('takes a percentage of the subtotal', () => {
    const result = computeDiscount(rule({ type: 'percentage', value: 10 }), [], 250);
    expect(result.total).toBe(25);
    expect(result.lineDiscounts).toEqual({});
  });

  it('takes a fixed amount', () => {
    expect(computeDiscount(rule({ type: 'fixed', value: 40 }), [], 250).total).toBe(40);
  });

  it('never discounts more than the goods', () => {
    expect(computeDiscount(rule({ type: 'fixed', value: 900 }), [], 250).total).toBe(250);
    expect(computeDiscount(rule({ type: 'percentage', value: 500 }), [], 250).total).toBe(250);
  });

  it('ignores a negative or missing code', () => {
    expect(computeDiscount(null, [], 100).total).toBe(0);
    expect(computeDiscount(rule({ type: 'fixed', value: -50 }), [], 100).total).toBe(0);
  });
});

describe('daily codes (product of the day)', () => {
  const daily = rule({ mode: 'daily', productId: 'p1', type: 'percentage', value: 50 });

  it('discounts only the matching product, per line', () => {
    const lines = [line('a', 'p1', 200), line('b', 'p2', 90)];
    const result = computeDiscount(daily, lines, 290);
    expect(result.total).toBe(100);
    expect(result.lineDiscounts).toEqual({ a: 100 });
  });

  it('is zero when the basket has none of the product', () => {
    const result = computeDiscount(daily, [line('b', 'p2', 90)], 90);
    expect(result.total).toBe(0);
    expect(result.lineDiscounts).toEqual({});
  });

  it('caps each line at its own total', () => {
    const almost = rule({ mode: 'daily', productId: 'p1', type: 'percentage', value: 300 });
    const result = computeDiscount(almost, [line('a', 'p1', 60)], 60);
    expect(result.total).toBe(60);
    expect(result.lineDiscounts.a).toBe(60);
  });

  it('spreads a fixed amount and the last line absorbs the remainder', () => {
    const fixed = rule({ mode: 'daily', productId: 'p1', type: 'fixed', value: 100 });
    const lines = [line('a', 'p1', 100), line('b', 'p1', 100), line('c', 'p1', 100)];
    const result = computeDiscount(fixed, lines, 300);
    expect(result.total).toBe(100);
    // 33 + 33 + 34 — the parts must sum to the whole, not 99.
    expect(result.lineDiscounts).toEqual({ a: 33, b: 33, c: 34 });
    const sum = Object.values(result.lineDiscounts).reduce((s, v) => s + v, 0);
    expect(sum).toBe(result.total);
  });

  it('caps a fixed amount at the matching lines only, ignoring the rest of the basket', () => {
    const fixed = rule({ mode: 'daily', productId: 'p1', type: 'fixed', value: 500 });
    const lines = [line('a', 'p1', 120), line('b', 'p2', 300)];
    const result = computeDiscount(fixed, lines, 420);
    expect(result.total).toBe(120);
    expect(result.lineDiscounts).toEqual({ a: 120 });
  });
});

describe('describeDiscount', () => {
  it('names the percentage and the scope', () => {
    expect(describeDiscount(rule({ type: 'percentage', value: 15 }))).toBe('خصم 15%');
    expect(
      describeDiscount(
        rule({ mode: 'daily', type: 'percentage', value: 50, productName: 'كريب فراخ' })
      )
    ).toBe('خصم 50% على كريب فراخ');
  });

  it('formats a fixed amount as money', () => {
    expect(describeDiscount(rule({ type: 'fixed', value: 1200 }))).toBe('خصم 1,200 ج.م');
  });

  it('is empty without a rule', () => {
    expect(describeDiscount(null)).toBe('');
    expect(describeDiscount(undefined)).toBe('');
  });
});
