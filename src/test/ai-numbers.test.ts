// The number guard: Arabic digits, formatted money and the array-length rule
// that makes "3 أصناف" truthful even though no cell holds a 3.
import { describe, expect, it } from 'vitest'
import { normalizeDigits, unknownNumbers } from '../ai/guard/numbers'
import type { ToolExchange } from '../ai/loop'

const exchange = (data: unknown, summary = ''): ToolExchange => ({
  id: '1',
  name: 'query_metrics',
  args: {},
  data,
  summary,
})

describe('normalizeDigits', () => {
  it('converts Arabic-Indic digits and separators', () => {
    expect(normalizeDigits('٤٬٢٠٠٫٥')).toBe('4200.5')
  })
})

describe('unknownNumbers', () => {
  it('accepts a number the tool returned', () => {
    expect(unknownNumbers('المبيعات 4200 ج.م', [exchange({ revenue: 4200 })])).toEqual([])
  })

  it('accepts a rounded rendering of a precise value', () => {
    expect(unknownNumbers('الربح حوالي ٤٢٠٠', [exchange({ profit: 4203.5 })])).toEqual([])
  })

  it('flags an invented figure', () => {
    expect(unknownNumbers('المبيعات 9999 ج.م', [exchange({ revenue: 4200 })])).toEqual(['9999'])
  })

  it('accepts an array length as a count', () => {
    const rows = [{ product: 'سجق' }, { product: 'كريب' }, { product: 'برجر' }]
    expect(unknownNumbers('أعلى 3 أصناف', [exchange({ rows })])).toEqual([])
  })

  it('reads numbers out of a summary string', () => {
    expect(unknownNumbers('٣٧ طلب', [exchange({}, 'مبيعات اليوم من 37 طلب')])).toEqual([])
  })

  it('does not treat a year as an invented figure', () => {
    expect(unknownNumbers('تقرير نوفمبر ٢٠٢٦', [exchange({ revenue: 4200 })])).toEqual([])
  })

  it('never flags a turn that ran no tools', () => {
    expect(unknownNumbers('المبيعات 9999', [])).toEqual([])
  })

  it('flags a percentage the model computed itself', () => {
    expect(unknownNumbers('الربح زاد 18٪', [exchange({ profit: 4200, delta: 0.1 })])).toEqual(['18'])
  })
})
