import type { CartItem } from '@/services/cart/cart.types'
import { fmtMoney } from '@/lib/format'

interface ReceiptProps {
  orderId: string
  items: CartItem[]
  subtotal: number
  tax: number
  taxRate?: number
  deliveryFee: number
  deliveryZoneName?: string
  deliveryNote?: string
  discountAmount?: number
  discountCode?: string
  orderNote?: string
  total: number
  orderType: string
  tableNumber?: string
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  paymentType: string
  cashierName?: string
}

const paymentLabels: Record<string, string> = {
  cash: 'كاش', visa: 'فيزا', card: 'كارت', wallet: 'محفظة',
}

export function Receipt({ orderId, items, subtotal, tax, taxRate = 0.14, deliveryFee, deliveryZoneName, deliveryNote, discountAmount = 0, discountCode, orderNote, total, orderType, tableNumber, customerName, customerPhone, customerAddress, paymentType, cashierName }: ReceiptProps) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

  return (
    <div id="receipt" className="bg-white text-black w-[300px] mx-auto p-6 font-mono text-sm" dir="rtl" style={{ fontFamily: 'Tajawal, monospace' }}>
      {/* Header */}
      <div className="text-center border-b-2 border-dashed border-gray-400 pb-4 mb-4">
        <p className="text-2xl font-black mb-1">🍔 فاست فود</p>
        <p className="text-xs text-gray-500">نقطة البيع</p>
        <p className="text-xs text-gray-500 mt-1">{dateStr} — {timeStr}</p>
      </div>

      {/* Order info */}
      <div className="border-b border-dashed border-gray-300 pb-3 mb-3 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">رقم الطلب</span>
          <span className="font-bold">{orderId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">نوع الطلب</span>
          <span className="font-bold">{orderType === 'delivery' ? 'توصيل' : 'صالة'}</span>
        </div>
        {tableNumber && (
          <div className="flex justify-between">
            <span className="text-gray-500">الطاولة</span>
            <span className="font-bold">{tableNumber}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">طريقة الدفع</span>
          <span className="font-bold">{paymentLabels[paymentType] || paymentType}</span>
        </div>
        {cashierName && (
          <div className="flex justify-between">
            <span className="text-gray-500">الكاشير</span>
            <span className="font-bold">{cashierName}</span>
          </div>
        )}
      </div>

      {/* Delivery info */}
      {orderType === 'delivery' && (customerName || customerPhone || customerAddress || deliveryZoneName || deliveryNote) && (
        <div className="border-b border-dashed border-gray-300 pb-3 mb-3 space-y-1 text-xs">
          {customerName && <div className="flex justify-between"><span className="text-gray-500">العميل</span><span className="font-bold">{customerName}</span></div>}
          {customerPhone && <div className="flex justify-between"><span className="text-gray-500">التليفون</span><span className="font-bold">{customerPhone}</span></div>}
          {customerAddress && <div className="flex justify-between"><span className="text-gray-500">العنوان</span><span className="font-bold">{customerAddress}</span></div>}
          {deliveryZoneName && <div className="flex justify-between"><span className="text-gray-500">المنطقة</span><span className="font-bold">{deliveryZoneName}</span></div>}
          {deliveryNote && <div className="flex justify-between gap-2"><span className="text-gray-500 shrink-0">ملاحظة التوصيل</span><span className="font-bold break-words text-left">{deliveryNote}</span></div>}
        </div>
      )}

      {/* Items */}
      <div className="border-b border-dashed border-gray-300 pb-3 mb-3 space-y-2">
        {items.map((item, i) => {
          const addonTotal = item.addons.reduce((s, a: any) => s + a.price * (a.qty || 1), 0)
          const modifierTotal = item.modifiers.reduce((s, m) => s + m.priceAdjustment, 0)
          const unitTotal = item.product.price + addonTotal + modifierTotal
          const lineTotal = unitTotal * item.quantity
          return (
            <div key={i}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-bold flex-1 break-words min-w-0">
                  {item.product.emoji} {item.product.name}
                  {item.modifiers.length > 0 && (
                    <span className="text-gray-700"> ({item.modifiers.map((m: any) => m.modifierName).join('، ')})</span>
                  )} ×{item.quantity}
                  {(item as any).note && (
                    <span className="block text-[11px] font-medium text-amber-700">📝 {(item as any).note}</span>
                  )}
                </span>
                <span className="font-bold shrink-0 whitespace-nowrap">{fmtMoney(lineTotal)} ج.م</span>
              </div>
              {item.addons.length > 0 && (
                <div className="mr-4 text-xs text-gray-500">
                  {item.addons.map((a: any, ai: number) => (
                    <div key={ai} className="flex justify-between gap-2">
                      <span className="flex-1 break-words min-w-0">↳ {a.emoji} {a.name}{(a.qty || 1) > 1 ? ` ×${a.qty}` : ''}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
                      <span className="text-gray-700 shrink-0 whitespace-nowrap">{fmtMoney(a.price * (a.qty || 1) * item.quantity)} ج.م</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Order note */}
      {orderNote && (
        <div className="border border-amber-400 bg-amber-50 rounded-lg px-3 py-2 mb-3 text-xs">
          <span className="font-black">📝 ملاحظة الطلب: </span>
          <span className="font-medium break-words">{orderNote}</span>
        </div>
      )}

      {/* Totals */}
      <div className="space-y-1 text-sm mb-4">
        <div className="flex justify-between text-gray-500">
          <span>المجموع الفرعي</span>
          <span>{subtotal.toFixed(0)} ج.م</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>ضريبة ({Math.round(taxRate * 100)}%)</span>
          <span>{tax.toFixed(0)} ج.م</span>
        </div>
        {deliveryFee > 0 && (
          <div className="flex justify-between text-gray-500">
            <span>رسوم التوصيل{deliveryZoneName ? ` (${deliveryZoneName})` : ''}</span>
            <span>{fmtMoney(deliveryFee)} ج.م</span>
          </div>
        )}
        {discountAmount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>خصم{discountCode ? ` (${discountCode})` : ''}</span>
            <span>-{discountAmount.toFixed(0)} ج.م</span>
          </div>
        )}
        <div className="border-t-2 border-black pt-2 mt-2">
          <div className="flex justify-between text-lg font-black">
            <span>الإجمالي</span>
            <span>{total.toFixed(0)} ج.م</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 border-t border-dashed border-gray-300 pt-3">
        <p>شكراً لزيارتكم ❤️</p>
        <p className="mt-1">فاست فود — نقطه بيع</p>
      </div>
    </div>
  )
}
