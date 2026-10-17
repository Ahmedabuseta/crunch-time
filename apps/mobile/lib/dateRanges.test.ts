import { describe, expect, it } from 'vitest';
import { dateRange, daysBefore, REPORT_RANGES, startOfMonth, ymd } from './dateRanges';

describe('dateRanges', () => {
  // 14 Oct 2026, local.
  const now = new Date(2026, 9, 14, 15, 30);

  it('formats a local YYYY-MM-DD', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('omits both ends for "all dates"', () => {
    expect(dateRange('', now)).toEqual({});
  });

  it('is a single day for "today"', () => {
    expect(dateRange('today', now)).toEqual({ from: '2026-10-14', to: '2026-10-14' });
  });

  it('runs from the 1st of the month for "month"', () => {
    expect(startOfMonth(now)).toBe('2026-10-01');
    expect(dateRange('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-14' });
  });

  it('counts back inclusively for "7"', () => {
    expect(dateRange('7', now)).toEqual({ from: '2026-10-08', to: '2026-10-14' });
  });

  it('crosses the month boundary for "30"', () => {
    expect(dateRange('30', now)).toEqual({ from: '2026-09-15', to: '2026-10-14' });
  });

  it('steps back a whole number of days', () => {
    expect(ymd(daysBefore(6, now))).toBe('2026-10-08');
  });

  it('exposes the report ranges with month-to-date among them', () => {
    const keys = REPORT_RANGES.map((range) => range.key);
    expect(keys).toContain('month');
    // Empty string means "no lower bound" — the "all" entry.
    expect(REPORT_RANGES.find((range) => range.key === 'all')?.from()).toBe('');
  });
});
