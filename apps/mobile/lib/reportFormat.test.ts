import { describe, expect, it } from 'vitest';
import { formatReport, formatValue, humanise, labelFor } from './reportFormat';

describe('formatValue', () => {
  it('formats whole numbers without decimals and trims the rest', () => {
    expect(formatValue(1234)).toBe('1,234');
    expect(formatValue(12.5)).toBe('12.5');
    expect(formatValue(0)).toBe('0');
  });

  it('handles the empty and non-finite cases without printing NaN', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue(NaN)).toBe('—');
    expect(formatValue(true)).toBe('نعم');
  });
});

describe('labels', () => {
  it('prefers a translation and falls back to spaced words', () => {
    expect(labelFor('totalRevenue')).toBe('إجمالي المبيعات');
    expect(labelFor('somethingOddHere')).toBe('Something Odd Here');
    expect(humanise('order_type')).toBe('Order type');
  });
});

describe('formatReport', () => {
  it('buffers a run of scalars into one ordered block', () => {
    const nodes = formatReport({ totalRevenue: 500, orderCount: 12, date: '2026-01-01' });
    expect(nodes).toEqual([
      { kind: 'metric', label: 'إجمالي المبيعات', value: '500' },
      { kind: 'metric', label: 'عدد الطلبات', value: '12' },
      { kind: 'metric', label: 'التاريخ', value: '2026-01-01' },
    ]);
  });

  it('skips nulls and empty arrays rather than rendering blank cards', () => {
    expect(formatReport({ a: null, b: [], c: undefined })).toEqual([]);
  });

  it('renders an array of label/value pairs as a chart', () => {
    const nodes = formatReport({
      topItems: [
        { name: 'كريب', qty: 9 },
        { name: 'بيتزا', qty: 4 },
      ],
    });
    expect(nodes).toEqual([
      {
        kind: 'bars',
        title: 'الأكثر مبيعاً',
        items: [
          { label: 'كريب', value: 9 },
          { label: 'بيتزا', value: 4 },
        ],
      },
    ]);
    expect(labelFor('topItems')).toBe('الأكثر مبيعاً');
  });

  it('renders an array of objects as a table with translated headers', () => {
    const nodes = formatReport({
      shifts: [
        { id: 's1', userName: 'أحمد', orderCount: 4, revenue: 200 },
        { id: 's2', userName: 'منى', orderCount: 2, revenue: 90 },
      ],
    });
    expect(nodes[0]).toMatchObject({
      kind: 'table',
      title: 'الورديات',
      columns: ['Id', 'الموظف', 'عدد الطلبات', 'المبيعات'],
      rows: [
        ['s1', 'أحمد', '4', '200'],
        ['s2', 'منى', '2', '90'],
      ],
    });
  });

  it('treats a numeric series as a table, not a chart, when there is no label column', () => {
    const nodes = formatReport({ hourly: [{ hour: 9, orderCount: 3, revenue: 120 }] });
    expect(nodes[0]).toMatchObject({ kind: 'table', title: 'المبيعات بالساعة' });
  });

  it('reads a nested object as its own block', () => {
    const nodes = formatReport({ totals: { cashTotal: 100, visaTotal: 50 } });
    expect(nodes).toEqual([
      {
        kind: 'table',
        title: 'الإجمالي',
        columns: ['البند', 'القيمة'],
        rows: [
          ['كاش', '100'],
          ['فيزا', '50'],
        ],
      },
    ]);
  });

  it('table-ises a plain list of scalars instead of dropping it', () => {
    const nodes = formatReport({ tags: ['a', 'b'] });
    expect(nodes[0]).toMatchObject({
      kind: 'table',
      rows: [
        ['1', 'a'],
        ['2', 'b'],
      ],
    });
  });

  it('returns nothing for a non-object', () => {
    expect(formatReport(null)).toEqual([]);
    expect(formatReport('nope')).toEqual([]);
    expect(formatReport([1, 2, 3])).toEqual([]);
  });
});
