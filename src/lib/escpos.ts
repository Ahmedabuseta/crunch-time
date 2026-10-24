import { fmtMoney } from './format'
import type { PrintOrder } from './print'

// ESC/POS constants
const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

// Helper: create buffer from bytes
const buf = (...bytes: (number | Uint8Array)[]) => {
  const parts: Uint8Array[] = []
  for (const b of bytes) {
    parts.push(b instanceof Uint8Array ? b : new Uint8Array([b]))
  }
  const total = parts.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    result.set(p, offset)
    offset += p.length
  }
  return result
}

// Helper: encode string to UTF-8 bytes
const text = (s: string) => new TextEncoder().encode(s)

// Helper: repeat character
const repeat = (char: string, count: number) => text(char.repeat(count))

// Commands
const init = () => buf(ESC, 0x40) // ESC @ - Initialize printer
const alignLeft = () => buf(ESC, 0x61, 0x00) // ESC a 0
const alignCenter = () => buf(ESC, 0x61, 0x01) // ESC a 1
const boldOn = () => buf(ESC, 0x45, 0x01) // ESC E 1
const boldOff = () => buf(ESC, 0x45, 0x00) // ESC E 0
const doubleHeight = () => buf(GS, 0x21, 0x01) // GS ! 1
const normalSize = () => buf(GS, 0x21, 0x00) // GS ! 0
const lineFeed = () => buf(LF)
const cutPaper = () => buf(GS, 0x56, 0x00) // GS V 0 - Full cut
const setUtf8 = () => buf(ESC, 0x74, 0x12) // ESC t 18 - UTF-8 encoding

// Paper width: 80mm = ~48 chars, 58mm = ~32 chars
const COLS_80MM = 48
const COLS_58MM = 32

function buildReceiptBuffer(o: PrintOrder, paperWidth: string = '80mm'): Uint8Array {
  const cols = paperWidth === '58mm' ? COLS_58MM : COLS_80MM
  const now = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)
  const dateStr = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const orderType = o.orderType === 'delivery' ? 'توصيل' : o.orderType === 'takeaway' ? 'تيك أوي' : 'صالة'
  const paymentLabels: Record<string, string> = { cash: 'كاش', visa: 'فيزا', card: 'كارت', wallet: 'محفظة' }
  const payment = paymentLabels[o.paymentType || ''] || o.paymentType || 'كاش'

  const parts: Uint8Array[] = []

  // Initialize and set UTF-8
  parts.push(init(), setUtf8())

  // Header: store name
  parts.push(alignCenter(), doubleHeight(), boldOn())
  parts.push(text('Crunch Time'))
  parts.push(boldOff(), normalSize(), lineFeed())

  // Order type
  parts.push(doubleHeight(), boldOn())
  parts.push(text(orderType))
  parts.push(boldOff(), normalSize(), lineFeed(), lineFeed())

  // Separator
  parts.push(alignLeft())
  parts.push(repeat('-', cols), lineFeed())

  // Order info
  parts.push(boldOn())
  parts.push(text(`رقم الطلب: ${o.id}`))
  parts.push(boldOff(), lineFeed())

  if (o.deliveryProfileName) {
    parts.push(text(`الديلفري: ${o.deliveryProfileName}`), lineFeed())
  }
  if (o.customerName) {
    parts.push(text(`العميل: ${o.customerName}`), lineFeed())
  }
  if (o.customerPhone) {
    parts.push(text(`التليفون: ${o.customerPhone}`), lineFeed())
  }
  if (o.customerAddress) {
    parts.push(text(`العنوان: ${o.customerAddress}`), lineFeed())
  }
  if (o.deliveryZoneName) {
    parts.push(text(`المنطقة: ${o.deliveryZoneName}`), lineFeed())
  }
  if (o.deliveryNote) {
    parts.push(text(`ملاحظة التوصيل: ${o.deliveryNote}`), lineFeed())
  }
  if (o.note) {
    parts.push(text(`ملاحظة الطلب: ${o.note}`), lineFeed())
  }
  parts.push(text(`التاريخ: ${dateStr}`), lineFeed())
  parts.push(text(`الوقت: ${timeStr}`), lineFeed())
  parts.push(text(`الدفع: ${payment}`), lineFeed())
  if (o.cashierName) {
    parts.push(text(`الكاشير: ${o.cashierName}`), lineFeed())
  }

  // Separator
  parts.push(repeat('-', cols), lineFeed())

  // Items header
  parts.push(boldOn())
  parts.push(text('الأصناف:'))
  parts.push(boldOff(), lineFeed())

  // Items
  for (const item of o.items) {
    const qty = item.quantity
    const unit = Number(item.unitPrice) || 0
    const addonTotal = (item.addons || []).reduce((s, a) => s + (Number(a.price) || 0) * (a.qty || 1), 0)
    const lineTotal = unit > 0 ? unit * qty + addonTotal * qty : null

    // Item name × qty ... price
    const name = `${item.productName || ''}${qty > 1 ? ` ×${qty}` : ''}`
    const price = lineTotal != null ? `${fmtMoney(lineTotal)} ج.م` : ''
    const padding = Math.max(1, cols - name.length - price.length)
    parts.push(text(`${name}${' '.repeat(padding)}${price}`), lineFeed())

    // Addons
    for (const addon of item.addons || []) {
      const addonName = `  ↳ ${addon.name || ''}${(addon.qty || 1) > 1 ? ` ×${addon.qty}` : ''}`
      parts.push(text(addonName), lineFeed())
    }

    // Note
    if (item.note?.trim()) {
      parts.push(text(`  ملاحظة: ${item.note.trim()}`), lineFeed())
    }
  }

  // Separator
  parts.push(repeat('-', cols), lineFeed())

  // Totals
  if ((o.subtotal ?? 0) > 0) {
    const label = 'الفرعي'
    const value = `${(o.subtotal || 0).toFixed(0)} ج.م`
    const padding = Math.max(1, cols - label.length - value.length)
    parts.push(text(`${label}${' '.repeat(padding)}${value}`), lineFeed())
  }
  if ((o.tax ?? 0) > 0) {
    const taxPercent = Math.round(((o as any).taxRate || 0.14) * 100)
    const label = `ضريبة (${taxPercent}%)`
    const value = `${(o.tax || 0).toFixed(0)} ج.م`
    const padding = Math.max(1, cols - label.length - value.length)
    parts.push(text(`${label}${' '.repeat(padding)}${value}`), lineFeed())
  }
  if ((o.deliveryFee || 0) > 0) {
    const label = `توصيل${o.deliveryZoneName ? ` (${o.deliveryZoneName})` : ''}`
    const value = `${fmtMoney(o.deliveryFee || 0)} ج.م`
    const padding = Math.max(1, cols - label.length - value.length)
    parts.push(text(`${label}${' '.repeat(padding)}${value}`), lineFeed())
  }
  const explicitDiscount = Number(o.discountAmount) || 0
  const derivedDiscount = o.total == null
    ? 0
    : Math.max(0, Math.round(
      (Number(o.subtotal) || 0) + (Number(o.tax) || 0) + (Number(o.deliveryFee) || 0) - (Number(o.total) || 0),
    ))
  const discountAmount = explicitDiscount > 0 ? explicitDiscount : derivedDiscount
  if (discountAmount > 0) {
    const label = 'خصم'
    const value = `-${discountAmount.toFixed(0)} ج.م`
    const padding = Math.max(1, cols - label.length - value.length)
    parts.push(text(`${label}${' '.repeat(padding)}${value}`), lineFeed())
  }

  // Total (double height, bold)
  parts.push(repeat('=', cols), lineFeed())
  parts.push(doubleHeight(), boldOn())
  const totalLabel = 'الإجمالي'
  const totalValue = `${(o.total || 0).toFixed(0)} ج.م`
  const totalPadding = Math.max(1, cols - totalLabel.length - totalValue.length)
  parts.push(text(`${totalLabel}${' '.repeat(totalPadding)}${totalValue}`))
  parts.push(boldOff(), normalSize(), lineFeed(), lineFeed())

  // Footer
  parts.push(alignCenter())
  parts.push(text('شكراً لزيارتكم'), lineFeed())
  parts.push(text('Crunch Time'), lineFeed())

  // Feed and cut
  parts.push(lineFeed(), lineFeed(), lineFeed())
  parts.push(cutPaper())

  // Concatenate all parts
  const total = parts.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    result.set(p, offset)
    offset += p.length
  }
  return result
}

// Export for use in main process
export { buildReceiptBuffer, COLS_80MM, COLS_58MM }