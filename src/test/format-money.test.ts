import { describe, expect, it } from 'vitest'
import { fmtMoney, roundMoney } from '../lib/format'

describe('money formatting', () => {
  it('never shows more than two decimals', () => {
    expect(fmtMoney(0.14333333333333334)).toBe('0.14')
    expect(fmtMoney(143.33333333333334)).toBe('143.33')
    expect(fmtMoney(1.005)).toBe('1.01')
    expect(fmtMoney(0.1 + 0.2)).toBe('0.3')
    expect(fmtMoney(-1.005)).toBe('-1.01')
  })

  it('handles invalid values instead of printing NaN', () => {
    expect(fmtMoney(NaN)).toBe('0')
    expect(fmtMoney(Infinity)).toBe('0')
    expect(roundMoney(-0.004)).toBe(0)
  })
})
