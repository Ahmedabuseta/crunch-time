// Discount maths, mirroring the till (src/components/Cart.tsx) so a receipt
// printed from the phone adds up to the same total as one printed on the PC.
// Money is whole pounds: round the subtotal once, then derive everything else.

export interface DiscountRule {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  /** `daily` codes are the employee's product-of-the-day: they discount only
   * the matching lines, and the discount rides on those lines. */
  mode?: 'daily';
  productId?: string;
  productName?: string;
  remaining?: number | null;
}

export interface DiscountLine {
  lineId: string;
  productId: string;
  /** The line's total in whole pounds, modifiers included, times quantity. */
  lineTotal: number;
}

export interface DiscountResult {
  total: number;
  /** Per-line amounts, for `order_items.item_discount`. Empty for order-level
   * codes, which the server spreads itself. */
  lineDiscounts: Record<string, number>;
}

const NONE: DiscountResult = { total: 0, lineDiscounts: {} };

export function computeDiscount(
  rule: DiscountRule | null | undefined,
  lines: DiscountLine[],
  subtotal: number
): DiscountResult {
  if (!rule) return NONE;

  if (rule.mode === 'daily') {
    const matching = lines.filter((line) => line.productId === rule.productId);
    if (matching.length === 0) return NONE;

    const lineDiscounts: Record<string, number> = {};

    if (rule.type === 'percentage') {
      let total = 0;
      for (const line of matching) {
        const amount = Math.min(Math.round(line.lineTotal * (rule.value / 100)), line.lineTotal);
        lineDiscounts[line.lineId] = amount;
        total += amount;
      }
      return { total, lineDiscounts };
    }

    // Fixed amount: spread across the matching lines, the last line absorbing
    // the rounding remainder so the parts sum to the whole exactly.
    const matchingTotal = matching.reduce((sum, line) => sum + line.lineTotal, 0);
    const total = Math.min(Math.round(Number(rule.value) || 0), matchingTotal);
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

  const raw =
    rule.type === 'percentage'
      ? Math.round(subtotal * (rule.value / 100))
      : Math.round(Number(rule.value) || 0);

  // Never discount more than the goods themselves.
  return { total: Math.min(Math.max(raw, 0), subtotal), lineDiscounts: {} };
}

/** One line an owner can read, describing what an accepted code does. */
export function describeDiscount(rule?: DiscountRule | null): string {
  if (!rule) return '';
  const amount =
    rule.type === 'percentage'
      ? `${rule.value}%`
      : `${Number(rule.value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} ج.م`;
  const scope = rule.mode === 'daily' ? ` على ${rule.productName ?? 'صنف اليوم'}` : '';
  return `خصم ${amount}${scope}`;
}
