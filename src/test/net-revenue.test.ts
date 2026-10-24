import { describe, it, expect } from 'vitest'
import { allocateNetRevenue } from '../lib/net-revenue'

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)

describe('allocateNetRevenue', () => {
  it('leaves goods revenue untouched when there is no discount', () => {
    const [a, b] = allocateNetRevenue([{ productGross: 100 }, { productGross: 50 }], 0)
    expect(a.productNet).toBe(100)
    expect(b.productNet).toBe(50)
  })

  it('spreads an order discount proportionally over products and add-ons', () => {
    const [a, b] = allocateNetRevenue([
      { productGross: 100, addonGross: 50 },
      { productGross: 50 },
    ], 60)
    // 200 gross, 60 off → 30% off every pound of goods.
    expect(a.productNet).toBeCloseTo(70)
    expect(a.addonNet).toBeCloseTo(35)
    expect(b.productNet).toBeCloseTo(35)
    expect(a.productNet + a.addonNet + b.productNet).toBeCloseTo(140)
  })

  it('keeps a line discount on that line instead of spreading it', () => {
    const [a, b] = allocateNetRevenue([
      { productGross: 100, itemDiscount: 40 },
      { productGross: 100 },
    ], 40)
    expect(a.productNet).toBe(60)
    expect(b.productNet).toBe(100)
  })

  it('never discounts a line below zero', () => {
    const [a] = allocateNetRevenue([{ productGross: 100 }], 300)
    expect(a.productNet).toBe(0)
  })

  it('allocates the full discount exactly despite rounding', () => {
    const lines = allocateNetRevenue([
      { productGross: 100 },
      { productGross: 1 },
    ], 1)
    expect(sum(lines.map(l => l.productNet))).toBeCloseTo(100)
    expect(lines[0].productNet).toBeCloseTo(99)
    expect(lines[1].productNet).toBeCloseTo(1)
  })
})
