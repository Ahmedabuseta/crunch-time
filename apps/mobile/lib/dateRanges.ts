// Date-range helpers and presets, shared by the orders board and the report
// screens. Kept pure so the range maths is testable without a device.

export type DatePreset = '' | 'today' | 'month' | '7' | '30';

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: '', label: 'كل التواريخ' },
  { value: 'today', label: 'النهاردة' },
  { value: 'month', label: 'من بداية الشهر' },
  { value: '7', label: 'آخر 7 أيام' },
  { value: '30', label: 'آخر 30 يوم' },
];

/**
 * The from-only ranges the report screens use. Month-to-date is the default the
 * screens open on; every entry is "from X until now".
 */
export const REPORT_RANGES: { key: string; label: string; from: () => string }[] = [
  { key: 'today', label: 'اليوم', from: () => ymd(new Date()) },
  { key: 'month', label: 'من بداية الشهر', from: () => startOfMonth() },
  { key: 'week', label: 'آخر 7 أيام', from: () => ymd(daysBefore(6)) },
  { key: '30', label: 'آخر 30 يوم', from: () => ymd(daysBefore(29)) },
  { key: 'all', label: 'الكل', from: () => '' },
];

/** Local `YYYY-MM-DD`. The owner means their own calendar day, and the server
 * compares this against `created_at` as a string. */
export function ymd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The first day of `now`'s month — "من بداية الشهر". */
export function startOfMonth(now: Date = new Date()): string {
  return ymd(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function daysBefore(days: number, now: Date = new Date()): Date {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date;
}

/** The `from`/`to` the API wants for a preset. Both omitted for "all dates".
 * Ranges count back from `now`, so "7" means today plus the six days before it. */
export function dateRange(preset: DatePreset, now: Date = new Date()): { from?: string; to?: string } {
  if (!preset) return {};
  const to = ymd(now);
  if (preset === 'today') return { from: to, to };
  if (preset === 'month') return { from: startOfMonth(now), to };
  const from = new Date(now);
  from.setDate(from.getDate() - ((preset === '7' ? 7 : 30) - 1));
  return { from: ymd(from), to };
}
