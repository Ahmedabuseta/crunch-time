// Printable stocktake sheet ("جرد") for the receipt printer.
//
// Deliberately narrow: it is printed through the same 72mm thermal pipeline as
// a receipt, so the layout is a checklist — system quantity on the right, a
// blank column to write the counted quantity, grouped by where the item is
// stored so the person can walk one freezer at a time.

export interface InventorySheetItem {
  id: string
  name: string
  unit: string
  storage: string
  stock: number
  cost: number
  minStock: number
}

export interface InventorySheetOptions {
  restaurant: string
  title: string
  currency: string
  items: InventorySheetItem[]
  now?: Date
}

const UNIT_LABELS: Record<string, string> = {
  g: 'جم',
  kg: 'كجم',
  ml: 'مل',
  l: 'لتر',
  pcs: 'قطعة',
}

const STORAGE_ORDER = ['فريزر', 'ثلاجة', 'رف جاف']

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const qty = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const money = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

export function buildInventorySheetHtml(opts: InventorySheetOptions): string {
  const now = opts.now || new Date()
  const dateLabel = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeLabel = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  const groups = new Map<string, InventorySheetItem[]>()
  for (const item of opts.items) {
    const key = item.storage || 'رف جاف'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  const orderedGroups = [...groups.entries()].sort(
    (a, b) => (STORAGE_ORDER.indexOf(a[0]) + 1 || 99) - (STORAGE_ORDER.indexOf(b[0]) + 1 || 99),
  )

  const totalValue = opts.items.reduce((sum, item) => sum + Math.max(0, item.stock) * item.cost, 0)
  const lowCount = opts.items.filter(item => item.minStock > 0 && item.stock <= item.minStock).length

  const sections = orderedGroups.map(([storage, items]) => {
    const rows = items
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      .map(item => {
        const unit = UNIT_LABELS[item.unit] || item.unit
        const low = item.minStock > 0 && item.stock <= item.minStock
        return `<tr${low ? ' class="low"' : ''}>
          <td class="name">${esc(item.name)}${low ? ' •' : ''}</td>
          <td class="num">${qty(item.stock)} ${esc(unit)}</td>
          <td class="count"></td>
        </tr>`
      })
      .join('')
    const groupValue = items.reduce((sum, item) => sum + Math.max(0, item.stock) * item.cost, 0)
    return `<section class="group">
      <h2>${esc(storage)} <span>${items.length} مادة</span></h2>
      <table>
        <thead><tr><th class="name">المادة</th><th class="num">الرصيد</th><th class="count">الجرد</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="group-total">قيمة المجموعة: ${money(groupValue)} ${esc(opts.currency)}</p>
    </section>`
  }).join('')

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  @page { margin: 0; }
  body { margin: 0; font-family: "Tajawal", "Segoe UI", Tahoma, sans-serif; color: #111; background: #fff; }
  .ticket { width: 100%; padding: 2mm 2mm 4mm; }
  h1 { font-size: 15px; font-weight: 900; margin: 0 0 1px; text-align: center; }
  .sub { text-align: center; font-size: 10px; color: #444; margin: 0 0 4px; }
  .meta { display: flex; justify-content: space-between; font-size: 9px; color: #555; }
  .rule { border-top: 1px dashed #999; margin: 5px 0; }
  .group { margin-top: 7px; }
  .group h2 { font-size: 11px; font-weight: 900; margin: 0 0 3px; padding: 2px 4px; border: 1px solid #222; border-radius: 3px; display: flex; justify-content: space-between; }
  .group h2 span { font-weight: 600; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: right; padding: 2.5px 3px; font-size: 10px; }
  thead th { border-bottom: 1px solid #333; font-weight: 900; }
  tbody tr:nth-child(even) { background: #f1f1f1; }
  td.name { line-height: 1.35; }
  td.num { width: 62px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.count { width: 46px; border-right: 1px solid #bbb; }
  tr.low td { font-weight: 800; }
  .group-total { font-size: 9px; color: #444; margin: 2px 0 0; text-align: left; }
  .totals { margin-top: 8px; padding-top: 4px; border-top: 1px solid #333; font-size: 11px; font-weight: 900; display: flex; justify-content: space-between; }
  .hint { margin-top: 3px; font-size: 9px; color: #555; }
  .sign { margin-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #333; }
  .sign span { border-top: 1px dotted #888; padding-top: 2px; min-width: 45%; }
  .empty { text-align: center; font-size: 10px; padding: 10px 0; color: #666; }
</style>
</head>
<body>
  <div class="ticket">
    <h1>${esc(opts.restaurant)}</h1>
    <p class="sub">${esc(opts.title)}</p>
    <div class="meta"><span>${esc(dateLabel)} · ${esc(timeLabel)}</span><span>${opts.items.length} مادة</span></div>
    <div class="rule"></div>
    ${opts.items.length === 0
      ? '<p class="empty">لا توجد مواد في هذا القسم</p>'
      : sections}
    <div class="totals">
      <span>قيمة المخزون</span>
      <span>${money(totalValue)} ${esc(opts.currency)}</span>
    </div>
    ${lowCount > 0 ? `<p class="hint">• = تحت الحد الأدنى (${lowCount} مادة)</p>` : ''}
    <p class="hint">اكتب الكمية الفعلية في خانة «الجرد».</p>
    <div class="sign"><span>الجرد بواسطة</span><span>التوقيع</span></div>
  </div>
</body>
</html>`
}
