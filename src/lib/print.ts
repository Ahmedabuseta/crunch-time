import { fmtMoney } from './format'

export interface PrintItem {
  productId?: string
  productName?: string
  productEmoji?: string
  quantity: number
  unitPrice?: number
  note?: string | null
  selectedModifiersJson?: string | null
  selectedAddonsJson?: string | null
  modifiers?: { modifierName?: string; name?: string }[]
  addons?: { emoji?: string; name?: string; price?: number; qty?: number }[]
  addonRollbackInfo?: { emoji?: string; name?: string; price?: number }[]
}

export interface PrintOrder {
  id: string
  orderType: string
  tableNumber?: string | null
  customerName?: string | null
  customerPhone?: string | null
  customerAddress?: string | null
  deliveryZoneName?: string | null
  deliveryNote?: string | null
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

function modifierNames(item: PrintItem): string[] {
  if (Array.isArray(item.modifiers)) return item.modifiers.map((m) => m.modifierName || m.name).filter(Boolean) as string[]
  try {
    const parsed = JSON.parse(item.selectedModifiersJson || '[]')
    if (Array.isArray(parsed)) return parsed.map((m: any) => m.modifierName || m.name).filter(Boolean)
  } catch { /* none */ }
  return []
}

function addonLines(item: PrintItem): { emoji: string; name: string; qty: number }[] {
  if (Array.isArray(item.addons)) return item.addons.map((a) => ({ emoji: a.emoji || '', name: a.name || '', qty: a.qty || 1 }))
  const groups: { emoji: string; name: string; qty: number }[] = []
  for (const a of item.addonRollbackInfo || []) {
    const g = groups.find((g) => g.name === a.name)
    if (g) g.qty += 1
    else groups.push({ emoji: a.emoji || '', name: a.name || '', qty: 1 })
  }
  if (groups.length > 0) return groups
  try {
    const ids = JSON.parse(item.selectedAddonsJson || '[]')
    if (Array.isArray(ids)) {
      const g: { emoji: string; name: string; qty: number }[] = []
      for (const id of ids) {
        const f = g.find((x) => x.name === String(id))
        if (f) f.qty += 1
        else g.push({ emoji: '', name: String(id), qty: 1 })
      }
      return g
    }
  } catch { /* none */ }
  return []
}

function itemBlock(item: PrintItem, big: boolean): string {
  const mods = modifierNames(item)
  const addons = addonLines(item)
  const note = (item.note || '').trim()
  const nameSize = big ? 'font-size:20px' : 'font-size:14px'
  let h = `<div style="margin-bottom:${big ? 10 : 6}px;${nameSize};font-weight:900;line-height:1.4">`
  h += `${esc(item.productEmoji || '')} ${esc(item.productName || '')}${mods.length > 0 ? ` (${esc(mods.join('، '))})` : ''} <span style="font-size:1.3em">×${item.quantity}</span>`
  for (const a of addons) {
    h += `<div style="font-size:${big ? 16 : 12}px;font-weight:700;padding-right:14px">↳ ${esc(a.emoji)} ${esc(a.name)}${a.qty > 1 ? ` ×${a.qty}` : ''}</div>`
  }
  if (note) h += `<div style="font-size:${big ? 18 : 12}px;background:#000;color:#fff;border-radius:6px;padding:4px 8px;margin-top:4px">📝 ${esc(note)}</div>`
  h += `</div>`
  return h
}

const pageCss = (width: string) => `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Tajawal', monospace; color: #000; background: #fff; }
  @media print { @page { margin: 0; size: ${width} auto; } body { margin: 0; } }
  .ticket { width: ${width}; margin: 0 auto; padding: 6mm 5mm; }
  .center { text-align: center; }
  .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .cut { border-top: 2px dashed #000; margin: 8px 0; }
`

function headerHtml(title: string, o: PrintOrder, now: Date): string {
  const dateStr = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  return `
  <div class="center" style="border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px">
    <p style="font-size:26px;font-weight:900">${esc(title)}</p>
    <p style="font-size:24px;font-weight:900;margin-top:4px">${esc(o.orderType === 'delivery' ? '🛵 توصيل' : `🍽️ صالة ${o.tableNumber || ''}`)}</p>
    <p style="font-size:13px;margin-top:4px">${esc(dateStr)} — ${esc(timeStr)}</p>
  </div>
  <div style="font-size:14px;margin-bottom:6px">
    <div class="row"><span>رقم الطلب</span><span style="font-weight:900;font-size:18px">${esc(o.id)}</span></div>
    ${o.customerName ? `<div class="row"><span>العميل</span><span style="font-weight:700">${esc(o.customerName)}</span></div>` : ''}
    ${o.customerPhone ? `<div class="row"><span>التليفون</span><span style="font-weight:700">${esc(o.customerPhone)}</span></div>` : ''}
    ${o.customerAddress ? `<div class="row"><span>العنوان</span><span style="font-weight:700">${esc(o.customerAddress)}</span></div>` : ''}
    ${o.deliveryZoneName ? `<div class="row"><span>المنطقة</span><span style="font-weight:700">${esc(o.deliveryZoneName)}</span></div>` : ''}
    ${o.deliveryNote ? `<div style="font-weight:900;margin-top:4px">📝 توصيل: ${esc(o.deliveryNote)}</div>` : ''}
    ${o.note ? `<div style="font-weight:900;margin-top:4px">📝 ملاحظة: ${esc(o.note)}</div>` : ''}
    ${o.cashierName ? `<div class="row"><span>الكاشير</span><span style="font-weight:700">${esc(o.cashierName)}</span></div>` : ''}
  </div>`
}

// ─── Kitchen ticket: items only, big fonts, no prices ──────────
export function buildKitchenTicketHtml(o: PrintOrder, items: PrintItem[], stationName: string, width = '80mm'): string {
  const now = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)
  const itemsHtml = items.map((i) => itemBlock(i, true)).join('')
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Kitchen ${esc(o.id)}</title>
<style>${pageCss(width)}</style></head>
<body><div class="ticket">
  ${headerHtml(`🔔 ${stationName}`, o, now)}
  <div class="cut"></div>
  ${itemsHtml}
  <div class="cut"></div>
  <p class="center" style="font-size:12px">— نهاية التذكرة —</p>
</div></body></html>`
}

// ─── Customer receipt: full totals ─────────────────────────────
export function buildCustomerReceiptHtml(o: PrintOrder, width = '80mm'): string {
  const now = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)
  const dateStr = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const taxPercent = Math.round(((o as any).taxRate || 0.14) * 100)
  const paymentLabels: Record<string, string> = { cash: 'كاش', visa: 'فيزا', card: 'كارت', wallet: 'محفظة' }
  let itemsHtml = ''
  for (const item of o.items) {
    const qty = item.quantity
    const unit = Number(item.unitPrice) || 0
    const addonTotal = (item.addons || []).reduce((s, a) => s + (Number(a.price) || 0) * (a.qty || 1), 0)
    const lineTotal = unit > 0 ? unit * qty + addonTotal * qty : null
    const mods = modifierNames(item)
    const addons = addonLines(item)
    const note = (item.note || '').trim()
    itemsHtml += `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:13px"><span style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(item.productEmoji)} ${esc(item.productName)}${mods.length > 0 ? ` (${esc(mods.join('، '))})` : ''} ×${qty}${note ? `<br><span style="font-size:11px">📝 ${esc(note)}</span>` : ''}</span>${lineTotal != null ? `<span style="font-weight:700;white-space:nowrap;flex-shrink:0">${fmtMoney(lineTotal)} ج.م</span>` : ''}</div>`
    for (const a of addons) {
      itemsHtml += `<div style="display:flex;justify-content:space-between;gap:8px;color:#666;font-size:11px;padding-right:16px;margin-bottom:2px"><span style="flex:1;min-width:0;overflow-wrap:anywhere">↳ ${esc(a.emoji)} ${esc(a.name)}${a.qty > 1 ? ` ×${a.qty}` : ''}${qty > 1 ? ` ×${qty}` : ''}</span></div>`
    }
  }
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>Receipt ${esc(o.id)}</title>
<style>${pageCss(width)}</style></head>
<body><div class="ticket">
  <div class="center" style="padding-bottom:10px;border-bottom:2px dashed #000;margin-bottom:10px">
    <p style="font-size:22px;font-weight:900">🍔 فاست فود</p>
  </div>
  <div class="center" style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px">
    <p style="font-size:10px;color:#666">رقم الطلب</p>
    <p style="font-size:20px;font-weight:900">${esc(o.id)}</p>
  </div>
  <div style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px;font-size:12px">
    <div class="row"><span>التاريخ</span><span style="font-weight:700">${esc(dateStr)}</span></div>
    <div class="row"><span>الوقت</span><span style="font-weight:700">${esc(timeStr)}</span></div>
    <div class="row"><span>نوع الطلب</span><span style="font-weight:700">${o.orderType === 'delivery' ? '🛵 توصيل' : '🍽️ صالة'}</span></div>
    ${o.tableNumber ? `<div class="row"><span>رقم الطاولة</span><span style="font-weight:700">${esc(o.tableNumber)}</span></div>` : ''}
    ${o.deliveryZoneName ? `<div class="row"><span>المنطقة</span><span style="font-weight:700">${esc(o.deliveryZoneName)}</span></div>` : ''}
    ${o.deliveryNote ? `<div class="row"><span>ملاحظة التوصيل</span><span style="font-weight:700">${esc(o.deliveryNote)}</span></div>` : ''}
    ${o.note ? `<div class="row"><span>ملاحظة الطلب</span><span style="font-weight:700">${esc(o.note)}</span></div>` : ''}
    <div class="row"><span>طريقة الدفع</span><span style="font-weight:700">${esc(paymentLabels[o.paymentType || ''] || o.paymentType || 'كاش')}</span></div>
    <div class="row"><span>الكاشير</span><span style="font-weight:700">${esc(o.cashierName || '—')}</span></div>
  </div>
  ${o.orderType === 'delivery' ? `<div style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px;font-size:12px">
    <div style="font-weight:700;margin-bottom:4px">بيانات التوصيل:</div>
    ${o.customerName ? `<div class="row"><span>الاسم</span><span style="font-weight:700">${esc(o.customerName)}</span></div>` : ''}
    ${o.customerPhone ? `<div class="row"><span>التليفون</span><span style="font-weight:700">${esc(o.customerPhone)}</span></div>` : ''}
    ${o.customerAddress ? `<div class="row"><span>العنوان</span><span style="font-weight:700">${esc(o.customerAddress)}</span></div>` : ''}
  </div>` : ''}
  <div style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px">
    <div style="font-weight:900;margin-bottom:6px;font-size:12px">الأصناف:</div>
    ${itemsHtml}
  </div>
  <div style="margin-bottom:16px;font-size:12px">
    ${(o.subtotal ?? 0) > 0 ? `<div class="row"><span>المجموع الفرعي</span><span>${(o.subtotal || 0).toFixed(0)} ج.م</span></div>` : ''}
    ${(o.tax ?? 0) > 0 ? `<div class="row"><span>ضريبة (${taxPercent}%)</span><span>${(o.tax || 0).toFixed(0)} ج.م</span></div>` : ''}
    ${(o.deliveryFee || 0) > 0 ? `<div class="row"><span>رسوم التوصيل${o.deliveryZoneName ? ` (${esc(o.deliveryZoneName)})` : ''}</span><span>${fmtMoney(o.deliveryFee || 0)} ج.م</span></div>` : ''}
    ${(o.discountAmount || 0) > 0 ? `<div class="row" style="color:#16a34a"><span>خصم</span><span>-${(o.discountAmount || 0).toFixed(0)} ج.م</span></div>` : ''}
    <hr style="border:none;border-top:2px solid #000;margin:10px 0">
    <div class="row" style="font-size:20px"><span style="font-weight:900">الإجمالي</span><span style="font-weight:900">${(o.total || 0).toFixed(0)} ج.م</span></div>
  </div>
  <div class="center" style="font-size:11px;color:#999;border-top:1.5px dashed #ccc;padding-top:10px">
    <p style="font-size:14px">شكراً لزيارتكم ❤️</p>
  </div>
</div></body></html>`
}

// ─── High-level print runner ───────────────────────────────────
// Prints the customer receipt + routed kitchen tickets for an order.
// Set preview:true to open a browser preview window instead (no printer needed).
export async function printOrderPack(args: {
  order: PrintOrder
  receiptPrinter?: string | null
  receiptWidth?: string
  autoReceipt?: boolean
  autoKitchen?: boolean
  copies?: number
  preview?: boolean
}): Promise<{ receipt: { ok: boolean; error?: string } | null; kitchen: { station: string; ok: boolean; error?: string }[]; unrouted: number }> {
  const { order, receiptPrinter, receiptWidth = '80mm', autoReceipt = true, autoKitchen = true, copies = 1, preview = false } = args
  if (preview) {
    const w = window.open('', '_blank', 'width=420,height=700')
    if (w) {
      w.document.write(buildCustomerReceiptHtml(order, receiptWidth))
      w.document.close()
    }
    return { receipt: { ok: true }, kitchen: [], unrouted: 0 }
  }
  let receipt: { ok: boolean; error?: string } | null = null
  if (autoReceipt) {
    receipt = await window.api.printer.printHtml(buildCustomerReceiptHtml(order, receiptWidth), {
      deviceName: receiptPrinter || undefined, copies: 1, paperWidth: receiptWidth,
    })
  }
  const kitchen: { station: string; ok: boolean; error?: string }[] = []
  let unrouted = 0
  if (autoKitchen) {
    try {
      const routed = await window.api.station.routeOrder(order.id)
      for (const r of routed.routes) {
        if (!r.station.printerName) {
          kitchen.push({ station: r.station.name, ok: false, error: 'مفيش طابعة مربوطة' })
          continue
        }
        const html = buildKitchenTicketHtml(order, r.items, r.station.name, r.station.paperWidth || '80mm')
        const res = await window.api.printer.printHtml(html, {
          deviceName: r.station.printerName, copies, paperWidth: r.station.paperWidth || '80mm',
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
