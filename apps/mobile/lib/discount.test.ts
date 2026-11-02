import { describe, expect, it } from 'vitest';
import {
  computeDiscount,
  describeDiscount,
  isScheduleActive,
  type DiscountLine,
  type DiscountRule,
} from './discount';

const line = (
  lineId: string,
  productId: string,
  lineTotal: number,
  over: Partial<DiscountLine> = {}
): DiscountLine => ({
  lineId,
  productId,
  unitTotal: lineTotal,
  quantity: 1,
  lineTotal,
  ...over,
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

describe('buy X get Y', () => {
  const bogo = rule({ type: 'bogo', buyQty: 2, getQty: 1, getPercent: 100 });

  it('makes the cheapest unit free', () => {
    const lines = [line('a', 'p1', 100), line('b', 'p2', 60), line('c', 'p3', 40)];
    const result = computeDiscount(bogo, lines, 200);
    expect(result.total).toBe(40);
    expect(result.lineDiscounts).toEqual({ c: 40 });
  });

  it('repeats for every complete group, cheapest first', () => {
    const lines = [
      line('a', 'p1', 100),
      line('b', 'p2', 60),
      line('c', 'p3', 40),
      line('d', 'p4', 30),
      line('e', 'p5', 20),
      line('f', 'p6', 10),
    ];
    const result = computeDiscount(bogo, lines, 260);
    // 6 units = two 2+1 groups -> the two cheapest (10 and 20) are free.
    expect(result.total).toBe(30);
    expect(result.lineDiscounts).toEqual({ e: 20, f: 10 });
  });

  it('takes a percentage of the cheapest unit', () => {
    const half = rule({ type: 'bogo', buyQty: 2, getQty: 1, getPercent: 50 });
    const lines = [line('a', 'p1', 100), line('b', 'p2', 60), line('c', 'p3', 40)];
    expect(computeDiscount(half, lines, 200).total).toBe(20);
  });

  it('needs a complete group', () => {
    expect(computeDiscount(bogo, [line('a', 'p1', 100), line('b', 'p2', 60)], 160).total).toBe(0);
  });

  it('counts quantity on a single line', () => {
    const lines = [line('a', 'p1', 200, { unitTotal: 100, quantity: 2 }), line('b', 'p2', 40)];
    const result = computeDiscount(bogo, lines, 240);
    expect(result.total).toBe(40);
    expect(result.lineDiscounts).toEqual({ b: 40 });
  });

  it('only counts units inside the selected products', () => {
    const scoped = rule({
      type: 'bogo',
      buyQty: 2,
      getQty: 1,
      getPercent: 100,
      scope: 'products',
      productIds: ['p1'],
    });
    const lines = [line('a', 'p1', 100), line('b', 'p2', 60), line('c', 'p3', 40)];
    expect(computeDiscount(scoped, lines, 200).total).toBe(0);
  });
});

describe('scope and minimum', () => {
  it('applies a percentage only to selected products', () => {
    const scoped = rule({ type: 'percentage', value: 50, scope: 'products', productIds: ['p1'] });
    const lines = [line('a', 'p1', 100), line('b', 'p2', 100)];
    const result = computeDiscount(scoped, lines, 200);
    expect(result.total).toBe(50);
    expect(result.lineDiscounts).toEqual({ a: 50 });
  });

  it('applies a percentage only to selected categories', () => {
    const scoped = rule({ type: 'percentage', value: 25, scope: 'categories', categoryIds: ['cat-a'] });
    const lines = [
      line('a', 'p1', 100, { categoryId: 'cat-a' }),
      line('b', 'p2', 100, { categoryId: 'cat-b' }),
    ];
    expect(computeDiscount(scoped, lines, 200).total).toBe(25);
  });

  it('stops below the minimum subtotal and explains why', () => {
    const minimum = rule({ type: 'percentage', value: 10, minSubtotal: 300 });
    const result = computeDiscount(minimum, [line('a', 'p1', 200)], 200);
    expect(result.total).toBe(0);
    expect(result.reason).toContain('300');
  });
});

describe('schedule', () => {
  const at = (iso: string) => new Date(iso);

  it('is always active without limits', () => {
    expect(isScheduleActive({}, at('2026-11-02T12:00:00')).active).toBe(true);
  });

  it('treats the start and end dates as inclusive', () => {
    const schedule = { startsAt: '2026-11-01', endsAt: '2026-11-30' };
    expect(isScheduleActive(schedule, at('2026-11-01T00:01:00')).active).toBe(true);
    expect(isScheduleActive(schedule, at('2026-11-30T23:59:00')).active).toBe(true);
    expect(isScheduleActive(schedule, at('2026-10-31T23:59:00')).active).toBe(false);
    expect(isScheduleActive(schedule, at('2026-12-01T00:00:00')).active).toBe(false);
  });

  it('filters by weekday', () => {
    // 2026-11-02 is a Monday (getDay() === 1).
    const schedule = { daysOfWeek: [1] };
    expect(isScheduleActive(schedule, at('2026-11-02T12:00:00')).active).toBe(true);
    expect(isScheduleActive(schedule, at('2026-11-03T12:00:00')).active).toBe(false);
  });

  it('filters by time window', () => {
    const schedule = { startTime: '15:00', endTime: '18:00' };
    expect(isScheduleActive(schedule, at('2026-11-02T14:59:00')).active).toBe(false);
    expect(isScheduleActive(schedule, at('2026-11-02T15:00:00')).active).toBe(true);
    expect(isScheduleActive(schedule, at('2026-11-02T17:59:00')).active).toBe(true);
    expect(isScheduleActive(schedule, at('2026-11-02T18:00:00')).active).toBe(false);
  });

  it('supports a window that crosses midnight', () => {
    const schedule = { startTime: '22:00', endTime: '02:00' };
    expect(isScheduleActive(schedule, at('2026-11-02T23:00:00')).active).toBe(true);
    expect(isScheduleActive(schedule, at('2026-11-03T01:00:00')).active).toBe(true);
    expect(isScheduleActive(schedule, at('2026-11-03T12:00:00')).active).toBe(false);
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
