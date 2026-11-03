import { describe, expect, it } from 'vitest'
import { isSeparator, parseBlocks, splitRow } from '../components/ui/markdown'

describe('markdown parser', () => {
  it('parses the reported ranking table', () => {
    const blocks = parseBlocks(`الترتيب | الصنف | العدد المبيع
|--------|-------|--------------|
| 1 | بطاطس سوري | 14 |
| 2 | سموكي تشكن | 9 |
| 3 | بطاطس | 9 |`)

    expect(blocks).toHaveLength(1)
    const table = blocks[0]
    expect(table.type).toBe('table')
    if (table.type !== 'table') return
    expect(table.header).toEqual(['الترتيب', 'الصنف', 'العدد المبيع'])
    expect(table.rows).toEqual([
      ['1', 'بطاطس سوري', '14'],
      ['2', 'سموكي تشكن', '9'],
      ['3', 'بطاطس', '9'],
    ])
  })

  it('splits rows and recognises separator rows', () => {
    expect(splitRow('| a | b |')).toEqual(['a', 'b'])
    expect(isSeparator('|:---|---:|')).toBe(true)
    expect(isSeparator('| 1 | 2 |')).toBe(false)
  })

  it('keeps headings, lists and code apart', () => {
    const blocks = parseBlocks('# العنوان\n- أولاً\n- ثانياً\n\n```sql\nSELECT 1\n```')
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'list', 'code'])
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1, text: 'العنوان' })
    expect(blocks[1]).toMatchObject({ type: 'list', ordered: false, items: ['أولاً', 'ثانياً'] })
    expect(blocks[2]).toMatchObject({ type: 'code', text: 'SELECT 1', lang: 'sql' })
  })

  it('does not mistake a paragraph with a pipe for a table', () => {
    const blocks = parseBlocks('البطاطس | السعر\n\nالنوع ده مش جدول')
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph'])
  })
})
