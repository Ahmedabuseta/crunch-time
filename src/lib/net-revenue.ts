// Goods revenue after discount, allocated per line.
// Order totals already carry the discount (subtotal + tax + delivery − discount),
// but product/category reports read order_items, so they have to net the
// discount out themselves. Line-recorded discounts (daily/employee codes) stay
// on their own product line; the rest of the order discount is spread across
// the lines in proportion to their goods value, add-ons included.

export interface RevenueLine {
  /** Price × quantity before any discount. */
  productGross: number
  /** Add-on price × quantity before any discount. */
  addonGross?: number
  /** Discount recorded on this line (daily/employee codes). */
  itemDiscount?: number
}

export interface NetRevenueLine {
  productNet: number
  addonNet: number
  /** Net ÷ gross for the whole line (product + add-ons). */
  ratio: number
}

export function allocateNetRevenue(lines: RevenueLine[], orderDiscount = 0): NetRevenueLine[] {
  const gross = lines.map(l => Math.max(0, l.productGross) + Math.max(0, l.addonGross || 0))
  // A line discount can never exceed its own product value, and never double-counts.
  const lineDiscount = lines.map(l => Math.min(Math.max(0, l.itemDiscount || 0), Math.max(0, l.productGross)))
  let remaining = Math.max(0, Math.max(0, orderDiscount) - lineDiscount.reduce((s, d) => s + d, 0))
  let baseLeft = gross.reduce((s, g) => s + g, 0)

  return lines.map((l, i) => {
    const capacity = Math.max(0, gross[i] - lineDiscount[i])
    // The last line absorbs the rounding remainder, so allocated discounts
    // always add up to the order's discount exactly.
    const allocated = i === lines.length - 1
      ? Math.min(remaining, capacity)
      : Math.min(Math.round(remaining * (baseLeft > 0 ? gross[i] / baseLeft : 0)), capacity, remaining)
    remaining -= allocated
    baseLeft -= gross[i]

    const net = Math.max(0, capacity - allocated)
    const ratio = gross[i] > 0 ? net / gross[i] : 0
    return {
      productNet: Math.max(0, l.productGross) * ratio,
      addonNet: Math.max(0, l.addonGross || 0) * ratio,
      ratio,
    }
  })
}
