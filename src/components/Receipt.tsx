import type { CartItem } from '@/services/cart/cart.types'
import { fmtMoney } from '@/lib/format'
import {
  receiptContactLines,
  receiptLegalLine,
  receiptLines,
  RECEIPT_INFO_DEFAULTS,
  type ReceiptInfo,
} from '@/lib/receipt'

interface ReceiptProps {
  orderId: string
  items: CartItem[]
  subtotal: number
  tax: number
  taxRate?: number
  deliveryFee: number
  deliveryZoneName?: string
  deliveryNote?: string
  deliveryProfileName?: string
  discountAmount?: number
  discountCode?: string
  orderNote?: string
  total: number
  orderType: string
  /** Dine-in only: printed under the order type. */
  tableNumber?: string
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  paymentType: string
  cashierName?: string
  /** Falls back to "now" — pass the order time so reprints match the sale. */
  createdAt?: Date | string
  /** Shop branding; defaults are used when omitted. */
  info?: ReceiptInfo
}

const paymentLabels: Record<string, string> = {
  cash: 'كاش', visa: 'فيزا', card: 'كارت', wallet: 'محفظة',
}

const orderTypeLabels: Record<string, string> = {
  delivery: 'توصيل', 'dine-in': 'صالة', takeaway: 'تيك أوي',
}

const Row = ({ label, value, bold, color }: { label: string; value?: string | number; bold?: boolean; color?: string }) => (
  <div className="flex justify-between gap-2">
    <span className="text-gray-500">{label}</span>
    <span className={bold ? 'font-bold' : 'font-medium'} style={color ? { color } : undefined}>{value ?? '—'}</span>
  </div>
)

export function Receipt({
  orderId, items, subtotal, tax, taxRate = 0.14, deliveryFee, deliveryZoneName, deliveryNote, deliveryProfileName,
  discountAmount = 0, discountCode, orderNote, total, orderType, tableNumber, customerName, customerPhone, customerAddress,
  paymentType, cashierName, createdAt, info,
}: ReceiptProps) {
  const brand = info ?? RECEIPT_INFO_DEFAULTS
  const now = createdAt ? (createdAt instanceof Date ? createdAt : new Date(createdAt)) : new Date()
  const dateStr = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const money = (n: number) => `${fmtMoney(n)} ${brand.currencyLabel}`
  const taxPercent = Math.round(taxRate * 100)
  const legalLine = receiptLegalLine(brand)
  const contactLines = receiptContactLines(brand)
  const termLines = receiptLines(brand.terms)
  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0)

  return (
    <div id="receipt" className="bg-white text-black mx-auto font-mono" dir="rtl" style={{ fontFamily: 'Tajawal, monospace', width: '300px', maxWidth: '100%', fontSize: '11px', padding: '10px 12px', lineHeight: '1.35', minHeight: '5cm' }}>
      {/* ── Letterhead ── */}
      <div className="text-center">
        {brand.showLogo && brand.logo && (
          <img src={brand.logo} alt="" className="mx-auto" style={{ width: '104px', maxHeight: '58px', objectFit: 'contain' }} />
        )}
        <p className="font-black tracking-tight" style={{ fontSize: '19px', lineHeight: 1.2 }}>{brand.storeName}</p>
        {brand.tagline && <p className="font-bold" style={{ fontSize: '10px' }}>{brand.tagline}</p>}
        {contactLines.map((line, i) => (
          <p key={i} className="text-gray-500" style={{ fontSize: '9px' }}>{line}</p>
        ))}
      </div>

      <div className="border-t-2 border-black mt-2" />
      {legalLine && <p className="text-center text-gray-500" style={{ fontSize: '8.5px' }}>{legalLine}</p>}
      <div className="border-t border-dashed border-gray-400 my-1.5" />
      <p className="text-center font-black tracking-wide" style={{ fontSize: '13px' }}>إيصال مبيعات</p>
      {brand.showOrderId && (
        <div className="text-center my-1">
          <p className="text-gray-500" style={{ fontSize: '9px' }}>رقم الطلب</p>
          <p className="font-black tracking-wide" style={{ fontSize: '24px', lineHeight: 1.1 }}>{orderId}</p>
        </div>
      )}
      <div className="border-t border-dashed border-gray-300 my-1.5" />

      {/* ── Order info ── */}
      <div style={{ fontSize: '10px' }}>
        <Row label="التاريخ" value={dateStr} />
        <Row label="الوقت" value={timeStr} />
        <Row label="نوع الطلب" value={orderTypeLabels[orderType] || orderType} bold />
        {orderType === 'dine-in' && tableNumber && <Row label="الترابيزة" value={tableNumber} bold />}
        <Row label="طريقة الدفع" value={paymentLabels[paymentType] || paymentType} bold />
        {brand.showCashier && <Row label="الكاشير" value={cashierName || '—'} bold />}
      </div>
      {orderNote && (
        <div className="border-r-2 border-gray-400 pr-1.5 mt-1.5" style={{ fontSize: '10px', overflowWrap: 'anywhere' }}>
          <span className="text-gray-500">ملاحظة الطلب: </span>
          <span className="font-medium">{orderNote}</span>
        </div>
      )}

      {/* ── Delivery ── */}
      {orderType === 'delivery' && (customerName || customerPhone || customerAddress || deliveryZoneName || deliveryProfileName || deliveryNote) && (
        <>
          <div className="border-t border-dashed border-gray-300 my-1.5" />
          <p className="font-black mb-0.5" style={{ fontSize: '10px' }}>بيانات التوصيل</p>
          <div style={{ fontSize: '10px' }}>
            {deliveryProfileName && <Row label="الديلفري" value={deliveryProfileName} bold />}
            {customerName && <Row label="العميل" value={customerName} bold />}
            {customerPhone && <Row label="التليفون" value={customerPhone} bold />}
            {deliveryZoneName && <Row label="المنطقة" value={deliveryZoneName} bold />}
          </div>
          {customerAddress && (
            <div className="flex justify-between gap-1" style={{ fontSize: '10px' }}>
              <span className="text-gray-500 shrink-0">العنوان</span>
              <span className="font-bold break-words text-left min-w-0">{customerAddress}</span>
            </div>
          )}
          {deliveryNote && (
            <div className="border-r-2 border-gray-400 pr-1.5 mt-1" style={{ fontSize: '10px', overflowWrap: 'anywhere' }}>
              <span className="text-gray-500">ملاحظة التوصيل: </span>
              <span className="font-medium">{deliveryNote}</span>
            </div>
          )}
        </>
      )}

      {/* ── Items ── */}
      <div className="border-t-2 border-dashed border-black my-1.5" />
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontVariantNumeric: 'tabular-nums' }}>
        <colgroup>
          <col style={{ width: '37%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '26%' }} />
        </colgroup>
        <thead>
          <tr className="text-gray-400 border-b border-gray-400" style={{ fontSize: '7.5px' }}>
            <th className="text-right font-bold py-0.5">الصنف</th>
            <th className="text-center font-bold py-0.5">الكمية</th>
            <th className="text-center font-bold py-0.5">سعر الوحدة</th>
            <th className="text-center font-bold py-0.5">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.flatMap((item, i) => {
            const qty = item.quantity
            const freeMods = item.modifiers.filter((m) => !m.priceAdjustment).map((m) => m.modifierName)
            const rows: {
              key: string
              name: string
              qty?: number
              unit?: number
              total?: number
              muted?: boolean
              note?: string
              last: boolean
            }[] = [{
              key: `${i}-item`,
              name: freeMods.length > 0
                ? `${item.product.name} (${freeMods.join('، ')})`
                : item.product.name,
              qty,
              unit: item.product.price,
              total: item.product.price * qty,
              last: false,
            }]
            for (const [ai, a] of item.addons.entries()) {
              const aq = (a.qty || 1) * qty
              rows.push({ key: `${i}-a${ai}`, name: a.name, qty: aq, unit: a.price, total: a.price * aq, muted: true, last: false })
            }
            for (const [mi, m] of item.modifiers.entries()) {
              if (!m.priceAdjustment) continue
              rows.push({
                key: `${i}-m${mi}`,
                name: `تعديل: ${m.modifierName}`,
                qty,
                unit: m.priceAdjustment,
                total: m.priceAdjustment * qty,
                muted: true,
                last: false,
              })
            }
            if (item.note) rows.push({ key: `${i}-n`, name: item.note, note: item.note, last: true })
            if (rows[rows.length - 1].last === false) rows[rows.length - 1].last = true
            return rows
          }).map((r) => (
            <tr
              key={r.key}
              className={r.last ? 'border-b border-dotted border-gray-400' : undefined}
              style={{ fontSize: r.muted ? '9px' : '10px' }}
            >
              {r.note ? (
                <td colSpan={4} className="text-gray-600 border-r-2 border-gray-300 pr-1.5 py-0.5" style={{ overflowWrap: 'anywhere' }}>
                  ملاحظة: {r.note}
                </td>
              ) : (
                <>
                  <td className={`py-0.5 ${r.muted ? 'text-gray-600 pr-2' : 'font-bold'}`} style={{ overflowWrap: 'anywhere' }}>{r.name}</td>
                  <td className="text-center py-0.5 whitespace-nowrap">{r.qty}</td>
                  <td className="text-center py-0.5 whitespace-nowrap">{fmtMoney(r.unit || 0)}</td>
                  <td className="text-center py-0.5 whitespace-nowrap font-semibold">{fmtMoney(r.total || 0)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="text-center text-gray-400 py-1" style={{ fontSize: '9px' }}>لا توجد أصناف</p>}

      {/* ── Totals ── */}
      <div className="border-t border-dashed border-gray-300 my-1.5" style={{ fontSize: '10px' }}>
        <Row label="عدد الأصناف" value={totalQty} />
        {subtotal > 0 && <Row label="المبلغ الفرعي" value={money(subtotal)} />}
        {discountAmount > 0 && <Row label={`الخصم${discountCode ? ` (${discountCode})` : ''}`} value={`-${money(discountAmount)}`} color="#16a34a" />}
        {brand.showTax && tax > 0 && <Row label={`ضريبة القيمة المضافة (${taxPercent}%)`} value={money(tax)} />}
        {deliveryFee > 0 && <Row label={`رسوم التوصيل${deliveryZoneName ? ` (${deliveryZoneName})` : ''}`} value={money(deliveryFee)} />}
      </div>
      <div className="border-t-4 border-double border-black" />
      <div className="flex justify-between font-black py-0.5" style={{ fontSize: '16px' }}>
        <span>الإجمالي المستحق</span>
        <span>{money(total)}</span>
      </div>
      <div className="border-t-4 border-double border-black mb-1.5" />

      {/* ── Footer ── */}
      <div className="border-t-2 border-dashed border-black pt-1.5 text-center">
        {brand.footer && <p className="font-black" style={{ fontSize: '12px' }}>{brand.footer}</p>}
        {termLines.map((line, i) => (
          <p key={i} className="text-gray-400" style={{ fontSize: '8px', lineHeight: 1.5 }}>{line}</p>
        ))}
        {brand.social && <p className="text-gray-500" style={{ fontSize: '8px' }}>{brand.social}</p>}
      </div>
      <div className="border-t border-dashed border-gray-300 my-1.5" />
      <p className="text-center text-gray-300" style={{ fontSize: '7px' }}>نسخة من إيصال المبيعات</p>
    </div>
  )
}