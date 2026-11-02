// Discount maths, mirroring the till (src/lib/discount-engine.ts) so a receipt
// printed from the phone adds up to the same total as one printed on the PC.
// Money is whole pounds: round the subtotal once, then derive everything else.

export type DiscountType = 'percentage' | 'fixed' | 'bogo';
export type DiscountScope = 'order' | 'products' | 'categories';

export interface DiscountRule {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  /** `daily` codes are the employee's product-of-the-day: they discount only
   * the matching lines, and the discount rides on those lines. */
  mode?: 'order' | 'daily';
  productId?: string;
  productName?: string;
  scope?: DiscountScope;
  productIds?: string[];
  categoryIds?: string[];
  minSubtotal?: number;
  buyQty?: number;
  getQty?: number;
  getPercent?: number;
  autoApply?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  daysOfWeek?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  remaining?: number | null;
}

export interface DiscountLine {
  lineId: string;
  productId: string;
  categoryId?: string;
  /** Product + modifiers + addons, per unit. */
  unitTotal: number;
  quantity: number;
  /** round(unitTotal × quantity). */
  lineTotal: number;
}

export interface DiscountResult {
  total: number;
  /** Per-line amounts, for `order_items.item_discount`. Empty for order-level
   * codes, which the server spreads itself. */
  lineDiscounts: Record<string, number>;
  reason?: string;
}

const NONE: DiscountResult = { total: 0, lineDiscounts: {} };

function matchingLines(rule: DiscountRule, lines: DiscountLine[]): DiscountLine[] {
  if (rule.scope === 'products') {
    const ids = new Set(rule.productIds ?? []);
    return lines.filter((line) => ids.has(line.productId));
  }
  if (rule.scope === 'categories') {
    const ids = new Set(rule.categoryIds ?? []);
    return lines.filter((line) => !!line.categoryId && ids.has(line.categoryId));
  }
  return lines;
}

function lineDiscountsFor(rule: DiscountRule, matching: DiscountLine[]): DiscountResult {
  if (matching.length === 0) return NONE;

  if (rule.type === 'percentage') {
    const lineDiscounts: Record<string, number> = {};
    let total = 0;
    for (const line of matching) {
      const amount = Math.min(Math.round(line.lineTotal * (rule.value / 100)), line.lineTotal);
      if (amount > 0) lineDiscounts[line.lineId] = amount;
      total += amount;
    }
    return { total, lineDiscounts };
  }

  const matchingTotal = matching.reduce((sum, line) => sum + line.lineTotal, 0);
  if (matchingTotal <= 0) return NONE;

  const total = Math.min(Math.round(Number(rule.value) || 0), matchingTotal);
  if (total <= 0) return NONE;

  const lineDiscounts: Record<string, number> = {};
  let assigned = 0;
  matching.forEach((line, index) => {
    const amount =
      index === matching.length - 1
        ? total - assigned
        : Math.round(total * (line.lineTotal / matchingTotal));
    lineDiscounts[line.lineId] = amount;
    assigned += amount;
  });
  return { total, lineDiscounts };
}

function computeDaily(rule: DiscountRule, lines: DiscountLine[]): DiscountResult {
  return lineDiscountsFor(rule, lines.filter((line) => line.productId === rule.productId));
}

function computeBogo(rule: DiscountRule, lines: DiscountLine[]): DiscountResult {
  const buy = Math.max(1, Math.floor(Number(rule.buyQty) || 0));
  const get = Math.max(1, Math.floor(Number(rule.getQty) || 0));
  const percent = Math.min(100, Math.max(0, Number(rule.getPercent ?? 100)));
  if (percent <= 0) return NONE;

  const matching = matchingLines(rule, lines);
  const units: { lineId: string; price: number }[] = [];
  for (const line of matching) {
    const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
    if (quantity === 0) continue;
    const unit = Number(line.unitTotal) || line.lineTotal / quantity;
    for (let index = 0; index < quantity; index++) units.push({ lineId: line.lineId, price: unit });
  }

  const groups = Math.floor(units.length / (buy + get));
  if (groups === 0) return NONE;

  units.sort((a, b) => a.price - b.price);
  const perLine: Record<string, number> = {};
  const discountCount = groups * get;
  for (let index = 0; index < discountCount; index++) {
    const unit = units[index];
    perLine[unit.lineId] = (perLine[unit.lineId] ?? 0) + Math.round(unit.price * (percent / 100));
  }

  const lineDiscounts: Record<string, number> = {};
  let total = 0;
  for (const line of matching) {
    const amount = Math.min(perLine[line.lineId] ?? 0, line.lineTotal);
    if (amount > 0) lineDiscounts[line.lineId] = amount;
    total += amount;
  }
  return { total, lineDiscounts };
}

export function computeDiscount(
  rule: DiscountRule | null | undefined,
  lines: DiscountLine[],
  subtotal: number
): DiscountResult {
  if (!rule) return NONE;

  const minSubtotal = Number(rule.minSubtotal) || 0;
  if (minSubtotal > 0 && subtotal < minSubtotal) {
    return { total: 0, lineDiscounts: {}, reason: `الحد الأدنى للطلب ${minSubtotal} ج.م` };
  }

  if (rule.mode === 'daily') return computeDaily(rule, lines);
  if (rule.type === 'bogo') return computeBogo(rule, lines);

  const scoped = rule.scope === 'products' || rule.scope === 'categories';
  if (!scoped) {
    const raw =
      rule.type === 'percentage'
        ? Math.round(subtotal * (rule.value / 100))
        : Math.round(Number(rule.value) || 0);
    return { total: Math.min(Math.max(raw, 0), subtotal), lineDiscounts: {} };
  }

  return lineDiscountsFor(rule, matchingLines(rule, lines));
}

/** One line an owner can read, describing what an accepted code does. */
export function describeDiscount(rule?: DiscountRule | null): string {
  if (!rule) return '';

  let text: string;
  if (rule.mode === 'daily') {
    const amount =
      rule.type === 'percentage'
        ? `${rule.value}%`
        : `${Number(rule.value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م`;
    return `خصم ${amount} على ${rule.productName ?? 'صنف اليوم'}`;
  }

  if (rule.type === 'bogo') {
    const percent = Number(rule.getPercent ?? 100);
    text = `اشتري ${rule.buyQty ?? 0} واحصل على ${rule.getQty ?? 0} ${
      percent >= 100 ? 'مجاناً' : `بخصم ${percent}%`
    }`;
  } else if (rule.type === 'percentage') {
    text = `خصم ${rule.value}%`;
  } else {
    text = `خصم ${Number(rule.value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م`;
  }

  if (rule.scope === 'products') text += ' على أصناف محددة';
  else if (rule.scope === 'categories') text += ' على أقسام محددة';

  return text;
}

// ─── Schedule (mirrors src/lib/discount-schedule.ts) ─────────────

export interface DiscountSchedule {
  startsAt?: string | null;
  endsAt?: string | null;
  daysOfWeek?: number[] | string | null;
  startTime?: string | null;
  endTime?: string | null;
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const pad = (n: number) => String(n).padStart(2, '0');
const localDateString = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localTimeString = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);

export function parseDaysOfWeek(value: number[] | string | null | undefined): number[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const days = raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

export function isScheduleActive(
  schedule: DiscountSchedule,
  now: Date = new Date()
): { active: boolean; reason?: string } {
  const today = localDateString(now);
  if (isDate(schedule.startsAt) && today < schedule.startsAt) {
    return { active: false, reason: 'الخصم لم يبدأ بعد' };
  }
  if (isDate(schedule.endsAt) && today > schedule.endsAt) {
    return { active: false, reason: 'انتهت صلاحية الخصم' };
  }

  const days = parseDaysOfWeek(schedule.daysOfWeek);
  if (days.length > 0 && days.length < 7 && !days.includes(now.getDay())) {
    return { active: false, reason: 'الخصم غير متاح في هذا اليوم' };
  }

  const current = localTimeString(now);
  const start = isTime(schedule.startTime) ? schedule.startTime : null;
  const end = isTime(schedule.endTime) ? schedule.endTime : null;
  if (start && end) {
    const inWindow = start <= end ? current >= start && current < end : current >= start || current < end;
    if (!inWindow) return { active: false, reason: 'الخصم غير متاح في هذا الوقت' };
  } else if (start && current < start) {
    return { active: false, reason: 'الخصم غير متاح في هذا الوقت' };
  } else if (end && current >= end) {
    return { active: false, reason: 'الخصم غير متاح في هذا الوقت' };
  }

  return { active: true };
}

function formatDate(value: string): string {
  if (!isDate(value)) return value;
  const [, month, day] = value.split('-').map(Number);
  return `${day} ${MONTHS[month - 1] ?? ''}`.trim();
}

export function describeSchedule(schedule: DiscountSchedule): string {
  const parts: string[] = [];
  const starts = isDate(schedule.startsAt) ? schedule.startsAt : null;
  const ends = isDate(schedule.endsAt) ? schedule.endsAt : null;
  if (starts && ends) parts.push(`${formatDate(starts)} – ${formatDate(ends)}`);
  else if (starts) parts.push(`من ${formatDate(starts)}`);
  else if (ends) parts.push(`حتى ${formatDate(ends)}`);

  const days = parseDaysOfWeek(schedule.daysOfWeek);
  if (days.length > 0 && days.length < 7) parts.push(days.map((d) => WEEKDAYS[d]).join('، '));

  const start = isTime(schedule.startTime) ? schedule.startTime : null;
  const end = isTime(schedule.endTime) ? schedule.endTime : null;
  if (start && end) parts.push(`${start}–${end}`);
  else if (start) parts.push(`من ${start}`);
  else if (end) parts.push(`حتى ${end}`);

  return parts.join(' · ');
}
