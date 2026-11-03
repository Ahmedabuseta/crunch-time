// The printed stocktake sheet: grouped by storage, sorted by name, with a
// blank «الجرد» column to write the counted quantity in.
import { describe, it, expect } from 'vitest'
import { buildInventorySheetHtml } from '../lib/inventory-sheet'

const item = (over: Partial<Parameters<typeof buildInventorySheetHtml>[0]['items'][number]> = {}) => ({
  id: over.id || 'i1',
  name: over.name || 'مادة',
  unit: over.unit || 'kg',
  storage: over.storage || 'فريزر',
  stock: over.stock ?? 5,
  cost: over.cost ?? 100,
  minStock: over.minStock ?? 0,
})

const build = (items: ReturnType<typeof item>[]) =>
  buildInventorySheetHtml({
    restaurant: 'كريب هاوس',
    title: 'جرد لحوم وبروتين',
    currency: 'ج.م',
    items,
    now: new Date('2026-11-03T14:20:00'),
  })

describe('inventory sheet', () => {
  it('groups by storage (freezer first) and sorts names inside a group', () => {
    const html = build([
      item({ id: 'a', name: 'بانيه', storage: 'ثلاجة' }),
      item({ id: 'b', name: 'شاورما', storage: 'فريزر' }),
      item({ id: 'c', name: 'لحمة', storage: 'فريزر' }),
    ])

    expect(html.indexOf('فريزر')).toBeLessThan(html.indexOf('ثلاجة'))
    expect(html.indexOf('شاورما')).toBeLessThan(html.indexOf('لحمة'))
  })

  it('prints the unit, the system quantity and leaves a blank count column', () => {
    const html = build([item({ name: 'لحم مفروم', unit: 'kg', stock: 12.5 })])
    expect(html).toContain('12.5 كجم')
    expect(html).toContain('class="count"')
    expect(html).toContain('>الجرد<')
  })

  it('totals stock value and marks items under the minimum', () => {
    const html = build([
      item({ id: 'a', name: 'غالي', stock: 2, cost: 300 }),
      item({ id: 'b', name: 'تحت الحد', stock: 1, cost: 50, minStock: 3 }),
    ])
    expect(html).toContain('650 ج.م')
    expect(html).toContain('تحت الحد •')
    expect(html).toContain('تحت الحد الأدنى (1 مادة)')
  })

  it('clamps negative stock so the value cannot go negative', () => {
    const html = build([item({ stock: -4, cost: 100 })])
    expect(html).toContain('0 ج.م')
  })

  it('escapes names and says when a section is empty', () => {
    expect(build([item({ name: '<script>x</script>' })])).not.toContain('<script>x</script>')
    expect(build([])).toContain('لا توجد مواد في هذا القسم')
  })
})
