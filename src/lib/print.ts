import { fmtMoney } from './format'
import {
  normalizeReceiptInfo,
  receiptContactLines,
  receiptLegalLine,
  receiptLines,
  RECEIPT_INFO_DEFAULTS,
  type ReceiptInfo,
} from './receipt'

export interface PrintItem {
  id?: string
  productId?: string
  productName?: string
  productEmoji?: string
  quantity: number
  unitPrice?: number
  note?: string | null
  selectedModifiersJson?: string | null
  selectedAddonsJson?: string | null
  modifiers?: { modifierName?: string; name?: string; priceAdjustment?: number }[]
  addons?: { emoji?: string; name?: string; price?: number; qty?: number }[]
  addonRollbackInfo?: { emoji?: string; name?: string; price?: number }[]
  kitchenHighlight?: boolean
}

export interface PrintOrder {
  id: string
  orderType: string
  customerName?: string | null
  customerPhone?: string | null
  customerAddress?: string | null
  deliveryZoneName?: string | null
  deliveryNote?: string | null
  deliveryProfileName?: string | null
  note?: string | null
  cashierName?: string | null
  createdAt: string | Date
  items: PrintItem[]
  subtotal?: number
  tax?: number
  taxRate?: number
  deliveryFee?: number
  discountAmount?: number
  discountCode?: string | null
  total?: number
  paymentType?: string
}

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ─── Receipt labels ───────────────────────────────────────────
const ORDER_TYPE_LABELS: Record<string, string> = { delivery: 'توصيل', 'dine-in': 'صالة', takeaway: 'تيك أوي' }
const PAYMENT_LABELS: Record<string, string> = { cash: 'كاش', visa: 'فيزا', card: 'كارت', wallet: 'محفظة' }

function orderTypeLabel(orderType?: string | null): string {
  if (!orderType) return ORDER_TYPE_LABELS['dine-in']
  return ORDER_TYPE_LABELS[orderType] || orderType
}

function paymentLabel(paymentType?: string | null): string {
  if (!paymentType) return PAYMENT_LABELS.cash
  return PAYMENT_LABELS[paymentType] || paymentType
}

/** `1234.50 ج.م` — the currency label is admin-configurable. */
function money(amount: number | null | undefined, info: ReceiptInfo): string {
  return `${fmtMoney(Number(amount) || 0)} ${info.currencyLabel}`
}

interface PrintModifier { modifierName?: string; name?: string; priceAdjustment?: number }
interface AddonLine { emoji: string; name: string; qty: number; price: number }

function modifierList(item: PrintItem): PrintModifier[] {
  if (Array.isArray(item.modifiers) && item.modifiers.length > 0) return item.modifiers
  try {
    const parsed = JSON.parse(item.selectedModifiersJson || '[]')
    if (Array.isArray(parsed)) return parsed as PrintModifier[]
  } catch { /* none */ }
  return []
}

/** Every modifier name — used by the kitchen ticket, which must show the full order. */
function modifierNames(item: PrintItem): string[] {
  return modifierList(item).map((m) => m.modifierName || m.name).filter(Boolean) as string[]
}

/** Modifiers that actually change the price — printed as their own chargeable row. */
function modifierAdjustments(item: PrintItem): { name: string; price: number }[] {
  return modifierList(item)
    .filter((m) => Number(m.priceAdjustment) !== 0)
    .map((m) => ({ name: m.modifierName || m.name || '', price: Number(m.priceAdjustment) || 0 }))
}

/** Modifiers with no price impact stay inline in the product name. */
function freeModifierNames(item: PrintItem): string[] {
  return modifierList(item)
    .filter((m) => !Number(m.priceAdjustment))
    .map((m) => m.modifierName || m.name)
    .filter(Boolean) as string[]
}

function addonLines(item: PrintItem): AddonLine[] {
  if (Array.isArray(item.addons)) {
    return item.addons.map((a) => ({ emoji: a.emoji || '', name: a.name || '', qty: a.qty || 1, price: Number(a.price) || 0 }))
  }
  const groups: AddonLine[] = []
  for (const a of item.addonRollbackInfo || []) {
    const g = groups.find((g) => g.name === a.name)
    if (g) { g.qty += 1; g.price = Number(a.price) || g.price }
    else groups.push({ emoji: a.emoji || '', name: a.name || '', qty: 1, price: Number(a.price) || 0 })
  }
  if (groups.length > 0) return groups
  try {
    const ids = JSON.parse(item.selectedAddonsJson || '[]')
    if (Array.isArray(ids)) {
      const g: AddonLine[] = []
      for (const id of ids) {
        const found = g.find((x) => x.name === String(id))
        if (found) found.qty += 1
        else g.push({ emoji: '', name: String(id), qty: 1, price: 0 })
      }
      return g
    }
  } catch { /* none */ }
  return []
}

// ─── Item table rows ──────────────────────────────────────────
export interface ReceiptItemRow {
  kind: 'item' | 'addon' | 'note'
  name: string
  qty: number
  unitPrice: number
  total: number
}

/**
 * Flattens one order line into printable table rows.
 *
 * The product row carries its **base** unit price and base total; every addon and
 * price-adjusting modifier becomes its own row with its own quantity and total, so
 * the `الإجمالي` column adds up exactly to the printed subtotal (no double counting).
 */
export function receiptItemRows(item: PrintItem): ReceiptItemRow[] {
  const qty = Number(item.quantity) || 0
  const unit = Number(item.unitPrice) || 0
  const mods = freeModifierNames(item)
  const rows: ReceiptItemRow[] = [{
    kind: 'item',
    name: mods.length > 0 ? `${item.productName || ''} (${mods.join('، ')})` : (item.productName || ''),
    qty,
    unitPrice: unit,
    total: unit * qty,
  }]
  for (const a of addonLines(item)) {
    if (!a.name) continue
    const q = a.qty * qty
    rows.push({ kind: 'addon', name: a.name, qty: q, unitPrice: a.price, total: a.price * q })
  }
  for (const m of modifierAdjustments(item)) {
    if (!m.name) continue
    rows.push({ kind: 'addon', name: `تعديل: ${m.name}`, qty, unitPrice: m.price, total: m.price * qty })
  }
  const note = (item.note || '').trim()
  if (note) rows.push({ kind: 'note', name: note, qty: 0, unitPrice: 0, total: 0 })
  return rows
}

function kitchenItemBlock(item: PrintItem): string {
  const mods = modifierNames(item)
  const addons = addonLines(item)
  const note = (item.note || '').trim()
  const weight = item.kitchenHighlight === false ? 500 : 900
  const highlight = item.kitchenHighlight === false
    ? ''
    : 'background:#fff3bf;border:1px solid #000;padding:2px 3px;border-radius:2px;'
  let h = `<div style="margin-bottom:3px;${highlight}font-size:15px;font-weight:${weight};line-height:1.15;overflow-wrap:anywhere">`
  h += `${esc(item.productName || '')}${mods.length > 0 ? ` <span style="font-size:12px;font-weight:700">(${esc(mods.join('، '))})</span>` : ''} <span style="font-size:16px;font-weight:900">×${item.quantity}</span>`
  for (const a of addons) {
    h += `<div style="font-size:11px;font-weight:600;padding-right:7px;line-height:1.1">+ ${esc(a.name)}${a.qty > 1 ? ` ×${a.qty}` : ''}</div>`
  }
  if (note) h += `<div style="font-size:11px;border-right:1px solid #000;padding-right:4px;margin-top:1px;color:#333;line-height:1.1">${esc(note)}</div>`
  h += `</div>`
  return h
}

const fontLink = `<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">`

const pageCss = (_width: string) => `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; margin: 0; padding: 0; }
  body { font-family: 'Tajawal', monospace; color: #000; background: #fff; }
  @media print { body { margin: 0; } }
  .ticket { width: 100%; margin: 0; padding: 0 4mm 0 3mm; min-height: 5cm; }
  .center { text-align: center; }
  .row { display: flex; justify-content: space-between; margin-bottom: 1px; gap: 3px; font-size: 10px; }
  .row > span:last-child { white-space: nowrap; flex-shrink: 0; }
  .row > span:first-child { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
  .cut { border-top: 2px dashed #000; margin: 4px 0; }
  .dashed { border-top: 1px dashed #999; margin: 4px 0; }
  .solid { border-top: 1.5px solid #000; margin: 4px 0; }
  .double { border-top: 3px double #000; margin: 4px 0; }
  .muted { color: #777; }
  .faint { color: #999; }
  .logo { display: block; margin: 0 auto 3px; object-fit: contain; }
  .store-name { font-size: 19px; font-weight: 900; letter-spacing: -0.3px; line-height: 1.2; }
  .tagline { font-size: 10px; font-weight: 700; margin-top: 1px; }
  .doc-title { font-size: 13px; font-weight: 900; letter-spacing: 0.5px; }
  .items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .items col.c-name { width: 37%; }
  .items col.c-qty { width: 13%; }
  .items col.c-price { width: 24%; }
  .items col.c-total { width: 26%; }
  .items th { font-size: 7.5px; font-weight: 700; color: #666; text-align: right; padding: 0 1px 2px; border-bottom: 1px solid #000; white-space: nowrap; }
  .items td { font-size: 10px; padding: 2px 1px; vertical-align: top; line-height: 1.35; overflow-wrap: anywhere; word-break: break-word; }
  .items td.num { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .items tr { page-break-inside: avoid; }
  .items tr.item td:first-child { font-weight: 700; }
  .items tr.addon td { font-size: 9px; color: #555; }
  .items tr.addon td:first-child { padding-right: 9px; }
  .items tr.note td { font-size: 9px; color: #444; border-right: 2px solid #bbb; padding-right: 5px; }
  .items tr.group-end td { border-bottom: 1px dotted #bbb; padding-bottom: 3px; }
  .item-note { font-size: 9px; color: #444; border-right: 2px solid #bbb; padding-right: 5px; margin-top: 1px; overflow-wrap: anywhere; }
  .grand { font-size: 16px; font-weight: 900; }
  .fine { font-size: 8px; line-height: 1.5; }
`

const PX_PER_MM = 96 / 25.4

export function autosizeScript(width: string, root = '.ticket'): string {
  return `<script>(function(){var W=${JSON.stringify(width)};function apply(){var el=document.querySelector(${JSON.stringify(root)})||document.body;var r=el.getBoundingClientRect();var mm=r.height/${PX_PER_MM};var h=Math.max(30,Math.min(3276,Math.floor(mm+0.2)));var s=document.getElementById('__pagesize');if(!s){s=document.createElement('style');s.id='__pagesize';document.head.appendChild(s)}s.textContent='@media print {@page { margin: 0 !important; size: '+W+' '+h+'mm !important; } body { margin: 0 !important; }}'}try{apply()}catch(e){}addEventListener('load',apply);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(apply)})()</script>`
}

function itemsTableHtml(items: PrintItem[]): string {
  if (!items || items.length === 0) return '<p class="center muted" style="font-size:9px">لا توجد أصناف</p>'
  const body = items
    .map((item) => {
      const rows = receiptItemRows(item)
      return rows
        .map((r, i) => {
          const cls = [r.kind, i === rows.length - 1 ? 'group-end' : ''].filter(Boolean).join(' ')
          if (r.kind === 'note') return `<tr class="${cls}"><td colspan="4">${esc(r.name)}</td></tr>`
          return `<tr class="${cls}"><td>${esc(r.name)}</td><td class="num">${r.qty}</td>` +
            `<td class="num">${esc(fmtMoney(r.unitPrice))}</td><td class="num">${esc(fmtMoney(r.total))}</td></tr>`
        })
        .join('')
    })
    .join('')
  return `<table class="items">
  <colgroup><col class="c-name"><col class="c-qty"><col class="c-price"><col class="c-total"></colgroup>
  <thead><tr><th>الصنف</th><th class="num">الكمية</th><th class="num">سعر الوحدة</th><th class="num">الإجمالي</th></tr></thead>
  <tbody>${body}</tbody>
</table>`
}

// ─── Letterhead / footer (shared by every receipt flavour) ─────
export function letterheadHtml(info: ReceiptInfo, opts: { logoWidth?: number; logoHeight?: number; nameSize?: number } = {}): string {
  const { logoWidth = 44, logoHeight = 19, nameSize = 19 } = opts
  const logo = info.showLogo ? info.logo : ''
  return `
  <div class="center">
    ${logo ? `<img class="logo" src="${esc(logo)}" alt="" style="width:${logoWidth}mm;height:${logoHeight}mm">` : ''}
    <p class="store-name" style="font-size:${nameSize}px">${esc(info.storeName)}</p>
    ${info.tagline ? `<p class="tagline">${esc(info.tagline)}</p>` : ''}
    ${receiptContactLines(info).map(l => `<p class="fine">${esc(l)}</p>`).join('')}
  </div>`
}

export function receiptFooterHtml(info: ReceiptInfo): string {
  return `
  <div class="cut"></div>
  <div class="center">
    ${info.footer ? `<p style="font-size:12px;font-weight:900">${esc(info.footer)}</p>` : ''}
    ${receiptLines(info.terms).map(l => `<p class="fine faint">${esc(l)}</p>`).join('')}
    ${info.social ? `<p class="fine muted">${esc(info.social)}</p>` : ''}
  </div>
  <div class="dashed"></div>
  <p class="center faint" style="font-size:7px">نسخة من إيصال المبيعات</p>`
}

// ─── Kitchen ticket: items only, big fonts, no prices ──────────
export function buildKitchenTicketHtml(o: PrintOrder, items: PrintItem[], stationName: string, width = '72mm', info: ReceiptInfo = RECEIPT_INFO_DEFAULTS): string {
  const now = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)
  const itemsHtml = items.map(kitchenItemBlock).join('')
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Kitchen ${esc(o.id)}</title>
${fontLink}
<style>${pageCss(width)}</style></head>
<body><div class="ticket">
  <div class="center" style="border-bottom:1px dashed #000;padding-bottom:3px;margin-bottom:4px">
    <p style="font-size:15px;font-weight:900;line-height:1.1">${esc(stationName)}</p>
    <p style="font-size:13px;font-weight:900;line-height:1.1">${esc(orderTypeLabel(o.orderType))} · ${esc(o.id)}</p>
    <p style="font-size:9px;line-height:1.1">${esc(now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }))}</p>
  </div>
  ${o.note ? `<div style="font-size:11px;font-weight:700;border-right:1px solid #000;padding-right:4px;margin-bottom:4px;line-height:1.1">${esc(o.note)}</div>` : ''}
  ${itemsHtml}
  <div style="border-top:1px dashed #000;margin-top:3px;padding-top:3px">
    <p class="center" style="font-size:8px">${esc(info.storeName)} · ${esc(o.id)}</p>
  </div>
</div></body></html>`
}

export function markKitchenTicketItems(allItems: PrintItem[], stationItems: PrintItem[]): PrintItem[] {
  const stationIds = new Set(stationItems.map((item) => item.id).filter(Boolean))
  return allItems.map((item) => ({
    ...item,
    kitchenHighlight: stationIds.has(item.id),
  }))
}

// The full order as printed on every ticket, deduped by row id: a department
// shared by several stations puts the item into each of their routes, and it
// must still appear only once per ticket. Rows without an id are kept as-is.
export function collectKitchenItems(
  routes: { items?: PrintItem[] }[],
  unrouted: PrintItem[] = [],
): PrintItem[] {
  const seen = new Set<string>()
  return [...routes.flatMap((r) => r.items || []), ...unrouted].filter((item) => {
    const key = item?.id
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Customer receipt: full totals ─────────────────────────────
export function buildCustomerReceiptHtml(o: PrintOrder, width = '72mm', info: ReceiptInfo = RECEIPT_INFO_DEFAULTS): string {
  const now = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)
  const dateStr = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const taxPercent = Math.round((o.taxRate || 0.14) * 100)
  const totalQty = o.items.reduce((s, i) => s + (i.quantity || 0), 0)

  const itemsHtml = itemsTableHtml(o.items)

  const legal = receiptLegalLine(info)
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Receipt ${esc(o.id)}</title>
${fontLink}
<style>${pageCss(width)}</style></head>
<body><div class="ticket">
  ${letterheadHtml(info)}
  <div class="solid"></div>
  ${legal ? `<p class="center fine muted">${esc(legal)}</p>` : ''}
  <div class="cut"></div>
  <p class="center doc-title">إيصال مبيعات</p>
  ${info.showOrderId ? `<div class="center" style="margin:2px 0 1px">
    <p style="font-size:9px;color:#555">رقم الطلب</p>
    <p style="font-size:22px;font-weight:900;line-height:1.1">${esc(o.id)}</p>
  </div>` : ''}
  <div class="dashed"></div>
  <div class="row"><span>التاريخ</span><span style="font-weight:700">${esc(dateStr)}</span></div>
  <div class="row"><span>الوقت</span><span style="font-weight:700">${esc(timeStr)}</span></div>
  <div class="row"><span>نوع الطلب</span><span style="font-weight:700">${esc(orderTypeLabel(o.orderType))}</span></div>
  <div class="row"><span>طريقة الدفع</span><span style="font-weight:700">${esc(paymentLabel(o.paymentType))}</span></div>
  ${info.showCashier ? `<div class="row"><span>الكاشير</span><span style="font-weight:700">${esc(o.cashierName || '—')}</span></div>` : ''}
  ${o.note ? `<div class="item-note" style="margin-top:3px">ملاحظة الطلب: ${esc(o.note)}</div>` : ''}
  ${(o.orderType === 'delivery' && (o.deliveryProfileName || o.customerName || o.customerPhone || o.customerAddress || o.deliveryZoneName || o.deliveryNote)) ? `
  <div class="dashed"></div>
  <p style="font-size:10px;font-weight:900;margin-bottom:2px">بيانات التوصيل</p>
  ${o.deliveryProfileName ? `<div class="row"><span>الديلفري</span><span style="font-weight:700">${esc(o.deliveryProfileName)}</span></div>` : ''}
  ${o.customerName ? `<div class="row"><span>العميل</span><span style="font-weight:700">${esc(o.customerName)}</span></div>` : ''}
  ${o.customerPhone ? `<div class="row"><span>التليفون</span><span style="font-weight:700">${esc(o.customerPhone)}</span></div>` : ''}
  ${o.customerAddress ? `<div class="row"><span>العنوان</span><span style="font-weight:700">${esc(o.customerAddress)}</span></div>` : ''}
  ${o.deliveryZoneName ? `<div class="row"><span>المنطقة</span><span style="font-weight:700">${esc(o.deliveryZoneName)}</span></div>` : ''}
  ${o.deliveryNote ? `<div class="item-note">ملاحظة التوصيل: ${esc(o.deliveryNote)}</div>` : ''}` : ''}
  <div class="cut"></div>
  ${itemsHtml}
  <div class="dashed"></div>
  <div class="row"><span>عدد الأصناف</span><span>${totalQty}</span></div>
  ${(o.subtotal ?? 0) > 0 ? `<div class="row"><span>المبلغ الفرعي</span><span>${esc(money(o.subtotal, info))}</span></div>` : ''}
  ${(o.discountAmount || 0) > 0 ? `<div class="row" style="color:#16a34a"><span>الخصم${o.discountCode ? ` (${esc(o.discountCode)})` : ''}</span><span>-${esc(money(o.discountAmount, info))}</span></div>` : ''}
  ${info.showTax && (o.tax ?? 0) > 0 ? `<div class="row"><span>ضريبة القيمة المضافة (${taxPercent}%)</span><span>${esc(money(o.tax, info))}</span></div>` : ''}
  ${(o.deliveryFee || 0) > 0 ? `<div class="row"><span>رسوم التوصيل${o.deliveryZoneName ? ` (${esc(o.deliveryZoneName)})` : ''}</span><span>${esc(money(o.deliveryFee, info))}</span></div>` : ''}
  <div class="double"></div>
  <div class="row grand"><span>الإجمالي المستحق</span><span>${esc(money(o.total, info))}</span></div>
  <div class="double"></div>
  ${receiptFooterHtml(info)}
</div></body></html>`
}


// Paper width → printable content width (hardware margins ~4mm each side)
export function contentWidth(paper: string): string {
  const mm = parseInt(paper) || 80
  return `${mm - 8}mm`
}

// ─── High-level print runner ───────────────────────────────────
// Prints the customer receipt + routed kitchen tickets for an order.
// Set preview:true to open a browser preview window instead (no printer needed).
export async function printOrderPack(args: {
  order: PrintOrder
  receiptPrinter?: string | null
  receiptWidth?: string
  paperWidth?: string
  autoReceipt?: boolean
  autoKitchen?: boolean
  copies?: number
  receiptCopies?: number
  /** Raw settings row (or a normalized ReceiptInfo); fetched when omitted. */
  receiptInfo?: ReceiptInfo | Record<string, any> | null
  preview?: boolean
}): Promise<{ receipt: { ok: boolean; error?: string } | null; kitchen: { station: string; ok: boolean; error?: string }[]; unrouted: number }> {
  const { order, receiptPrinter, receiptWidth, paperWidth = '80mm', autoReceipt = true, autoKitchen = true, copies = 1, receiptCopies = 1, preview = false } = args
  const htmlWidth = receiptWidth || contentWidth(paperWidth)
  const settings: any = args.receiptInfo ?? (await window.api.settings.get().catch(() => null))
  const info = normalizeReceiptInfo(settings)
  if (preview) {
    const html = buildCustomerReceiptHtml(order, htmlWidth, info)
    const w = window.open('', '_blank', 'width=420,height=700')
    if (w) {
      w.document.write(html.replace('</head>', autosizeScript(htmlWidth) + '</head>'))
      w.document.close()
    }
    return { receipt: { ok: true }, kitchen: [], unrouted: 0 }
  }
  let receipt: { ok: boolean; error?: string } | null = null
  if (autoReceipt) {
    receipt = await window.api.printer.printHtml(buildCustomerReceiptHtml(order, htmlWidth, info), {
      deviceName: receiptPrinter || undefined, copies: Math.max(1, receiptCopies), paperWidth,
    })
  }
  const kitchen: { station: string; ok: boolean; error?: string }[] = []
  let unrouted = 0
  if (autoKitchen) {
    try {
      const routed = await window.api.station.routeOrder(order.id)
      const allKitchenItems = collectKitchenItems(routed.routes || [], routed.unrouted || [])
      const usedPrinters = new Set<string>()
      for (const r of routed.routes) {
        if (!r.station.printerName) {
          kitchen.push({ station: r.station.name, ok: false, error: 'مفيش طابعة مربوطة' })
          continue
        }
        if (usedPrinters.has(r.station.printerName)) {
          kitchen.push({ station: r.station.name, ok: false, error: 'الطابعة مستخدمة في محطة أخرى — تم منع تكرار الطباعة' })
          continue
        }
        usedPrinters.add(r.station.printerName)
        if (!allKitchenItems.length) continue
        const stPaper = r.station.paperWidth || '80mm'
        const html = buildKitchenTicketHtml(order, markKitchenTicketItems(allKitchenItems, r.items), r.station.name, contentWidth(stPaper), info)
        const res = await window.api.printer.printHtml(html, {
          deviceName: r.station.printerName, copies, paperWidth: stPaper,
        })
        kitchen.push({ station: r.station.name, ok: res.ok, error: res.error })
      }
      unrouted = routed.unrouted?.length || 0
    } catch (err: any) {
      kitchen.push({ station: 'التوجيه', ok: false, error: err?.message || 'فشل التوجيه' })
    }
  }
  return { receipt, kitchen, unrouted }
}
