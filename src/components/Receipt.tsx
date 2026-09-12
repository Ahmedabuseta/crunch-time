import type { CartItem } from '@/services/cart/cart.types'

interface ReceiptProps {
  orderId: string
  items: CartItem[]
  subtotal: number
  tax: number
  deliveryFee: number
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
  cash: 'كاش', card: 'كارت', wallet: 'محفظة',
}

export function Receipt({ orderId, items, subtotal, tax, deliveryFee, total, orderType, tableNumber, customerName, customerPhone, customerAddress, paymentType, cashierName }: ReceiptProps) {
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
      {orderType === 'delivery' && (customerName || customerPhone || customerAddress) && (
        <div className="border-b border-dashed border-gray-300 pb-3 mb-3 space-y-1 text-xs">
          {customerName && <div className="flex justify-between"><span className="text-gray-500">العميل</span><span className="font-bold">{customerName}</span></div>}
          {customerPhone && <div className="flex justify-between"><span className="text-gray-500">التليفون</span><span className="font-bold">{customerPhone}</span></div>}
          {customerAddress && <div className="flex justify-between"><span className="text-gray-500">العنوان</span><span className="font-bold">{customerAddress}</span></div>}
        </div>
      )}

      {/* Items */}
      <div className="border-b border-dashed border-gray-300 pb-3 mb-3 space-y-2">
        {items.map((item, i) => {
          const addonTotal = item.addons.reduce((s, a) => s + a.price, 0)
          const modifierTotal = item.modifiers.reduce((s, m) => s + m.priceAdjustment, 0)
          const lineTotal = (item.product.price + addonTotal + modifierTotal) * item.quantity
          return (
            <div key={i}>
              <div className="flex justify-between text-sm">
                <span className="font-bold">{item.product.emoji} {item.product.name} ×{item.quantity}</span>
                <span className="font-bold">{lineTotal} ج.م</span>
              </div>
              {/* Modifiers */}
              {item.modifiers.map((m, mi) => (
                <div key={mi} className="flex justify-between text-xs text-gray-500 mr-4">
                  <span>↳ {m.modifierName}</span>
                  {m.priceAdjustment > 0 && <span>+{m.priceAdjustment * item.quantity} ج.م</span>}
                </div>
              ))}
              {/* Addons */}
              {item.addons.map((a, ai) => (
                <div key={ai} className="flex justify-between text-xs text-gray-500 mr-4">
                  <span>↳ {a.emoji} {a.name}</span>
                  <span>+{a.price * item.quantity} ج.م</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Totals */}
      <div className="space-y-1 text-sm mb-4">
        <div className="flex justify-between text-gray-500">
          <span>المجموع الفرعي</span>
          <span>{subtotal.toFixed(0)} ج.م</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>ضريبة (14%)</span>
          <span>{tax.toFixed(0)} ج.م</span>
        </div>
        {deliveryFee > 0 && (
          <div className="flex justify-between text-gray-500">
            <span>رسوم التوصيل</span>
            <span>{deliveryFee} ج.م</span>
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
