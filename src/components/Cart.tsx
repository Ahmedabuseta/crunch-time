import { useCartStore } from '@/services/cart/cart.store'
import { useOrderStore } from '@/services/order/order.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { useUserStore } from '@/services/user/user.store'
import { CartItem } from './CartItem'
import { Receipt } from './Receipt'
import { OrderTypeSelector } from './OrderTypeSelector'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShoppingCart, Trash2, CheckCircle, Banknote, CreditCard, Printer, RotateCcw, Tag, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const paymentTypes = [
  { id: 'cash' as const, label: 'كاش', icon: Banknote },
  { id: 'visa' as const, label: 'فيزا', icon: CreditCard },
]

interface LastOrder {
  id: string
  items: any[]
  subtotal: number
  tax: number
  deliveryFee: number
  discountAmount: number
  total: number
  orderType: string
  tableNumber?: string
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  paymentType: string
  cashierName?: string
  createdAt: Date
}

function buildReceiptHtml(o: LastOrder): string {
  const dateStr = o.createdAt.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = o.createdAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const paymentLabels: Record<string, string> = { cash: 'كاش', visa: 'فيزا' }

  let itemsHtml = ''
  for (const item of o.items) {
    const addonTotal = item.addons.reduce((s: number, a: any) => s + a.price, 0)
    const modifierTotal = item.modifiers.reduce((s: number, m: any) => s + m.priceAdjustment, 0)
    const lineTotal = (item.product.price + addonTotal + modifierTotal) * item.quantity
    itemsHtml += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px"><span>${item.product.emoji} ${item.product.name} ×${item.quantity}</span><span style="font-weight:700">${lineTotal} ج.م</span></div>`
    for (const m of item.modifiers) {
      itemsHtml += `<div style="display:flex;justify-content:space-between;color:#666;font-size:11px;padding-right:16px;margin-bottom:2px"><span>↳ ${m.modifierName}</span>${m.priceAdjustment > 0 ? `<span>+${m.priceAdjustment * item.quantity} ج.م</span>` : ''}</div>`
    }
    for (const a of item.addons) {
      itemsHtml += `<div style="display:flex;justify-content:space-between;color:#666;font-size:11px;padding-right:16px;margin-bottom:2px"><span>↳ ${a.emoji} ${a.name}</span><span>+${a.price * item.quantity} ج.م</span></div>`
    }
  }

  let deliverySection = ''
  if (o.orderType === 'delivery') {
    deliverySection = `<div style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px;font-size:12px">
      <div style="font-weight:700;margin-bottom:4px">بيانات التوصيل:</div>
      ${o.customerName ? `<div class="row"><span class="gray">الاسم</span><span style="font-weight:700">${o.customerName}</span></div>` : ''}
      ${o.customerPhone ? `<div class="row"><span class="gray">التليفون</span><span style="font-weight:700">${o.customerPhone}</span></div>` : ''}
      ${o.customerAddress ? `<div class="row"><span class="gray">العنوان</span><span style="font-weight:700">${o.customerAddress}</span></div>` : ''}
    </div>`
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>Receipt ${o.id}</title>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Tajawal', monospace; font-size: 13px; color: #000; background: #fff; }
  @media print { @page { margin: 0; size: 80mm auto; } body { margin: 0; } }
  .receipt { width: 80mm; margin: 0 auto; padding: 8mm 6mm; }
  .center { text-align: center; }
  .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .bold { font-weight: 900; }
  .gray { color: #666; }
</style>
</head>
<body>
<div class="receipt">
  <div class="center" style="padding-bottom:10px;border-bottom:2px dashed #999;margin-bottom:10px">
    <p style="font-size:22px;font-weight:900">🍔 فاست فود</p>
    <p class="gray" style="font-size:11px;margin-top:2px">نقطة البيع — نظام الكاشير</p>
  </div>

  <div style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px;font-size:12px">
    <div class="row"><span class="gray">رقم الطلب</span><span class="bold">${o.id}</span></div>
    <div class="row"><span class="gray">التاريخ</span><span style="font-weight:700">${dateStr}</span></div>
    <div class="row"><span class="gray">الوقت</span><span style="font-weight:700">${timeStr}</span></div>
    <div class="row"><span class="gray">نوع الطلب</span><span style="font-weight:700">${o.orderType === 'delivery' ? '🛵 توصيل' : '🍽️ صالة'}</span></div>
    ${o.tableNumber ? `<div class="row"><span class="gray">رقم الطاولة</span><span style="font-weight:700">${o.tableNumber}</span></div>` : ''}
    <div class="row"><span class="gray">طريقة الدفع</span><span style="font-weight:700">${paymentLabels[o.paymentType] || o.paymentType}</span></div>
    <div class="row"><span class="gray">الكاشير</span><span style="font-weight:700">${o.cashierName || '—'}</span></div>
  </div>

  ${deliverySection}

  <div style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px">
    <div style="font-weight:900;margin-bottom:6px;font-size:12px">الأصناف:</div>
    ${itemsHtml}
  </div>

  <div style="margin-bottom:16px;font-size:12px">
    <div class="row gray"><span>المجموع الفرعي</span><span>${o.subtotal.toFixed(0)} ج.م</span></div>
    <div class="row gray"><span>ضريبة القيمة المضافة (14%)</span><span>${o.tax.toFixed(0)} ج.م</span></div>
    ${o.deliveryFee > 0 ? `<div class="row gray"><span>رسوم التوصيل</span><span>${o.deliveryFee} ج.م</span></div>` : ''}
    ${o.discountAmount > 0 ? `<div class="row" style="color:#16a34a"><span>خصم</span><span>-${o.discountAmount.toFixed(0)} ج.م</span></div>` : ''}
    <hr style="border:none;border-top:2px solid #000;margin:10px 0">
    <div class="row" style="font-size:20px"><span class="bold">الإجمالي</span><span class="bold">${o.total.toFixed(0)} ج.م</span></div>
  </div>

  <div class="center" style="font-size:11px;color:#999;border-top:1.5px dashed #ccc;padding-top:10px">
    <p style="font-size:14px">شكراً لزيارتكم ❤️</p>
    <p style="margin-top:4px">فاست فود — نظام نقطة البيع</p>
    <p style="margin-top:2px;font-size:10px">هذا إيصال إلكتروني ولا يحتاج توقيع</p>
  </div>
</div>
</body>
</html>`
}

export function Cart() {
  const items = useCartStore((s) => s.items)
  const subtotal = useCartStore((s) => s.subtotal)
  const itemCount = useCartStore((s) => s.itemCount)
  const clearCart = useCartStore((s) => s.clearCart)
  const orderType = useCartStore((s) => s.orderType)
  const tableNumber = useCartStore((s) => s.tableNumber)
  const deliveryAddress = useCartStore((s) => s.deliveryAddress)
  const deliveryPhone = useCartStore((s) => s.deliveryPhone)
  const customerName = useCartStore((s) => s.customerName)
  const paymentType = useCartStore((s) => s.paymentType)
  const setPaymentType = useCartStore((s) => s.setPaymentType)
  const discountCode = useCartStore((s) => s.discountCode)
  const setDiscountCode = useCartStore((s) => s.setDiscountCode)
  const currentUser = useUserStore((s) => s.currentUser)
  const createOrder = useOrderStore((s) => s.create)
  const deductForOrder = useInventoryStore((s) => s.deductForOrder)
  const fetchAlerts = useInventoryStore((s) => s.fetchAlerts)
  const fetchOrders = useOrderStore((s) => s.fetch)
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null)
  const [validationError, setValidationError] = useState('')
  const [discountResult, setDiscountResult] = useState<{ valid: boolean; discount?: any; error?: string } | null>(null)

  const tax = subtotal() * 0.14
  const deliveryFee = orderType === 'delivery' ? 25 : 0
  const discountAmount = discountResult?.valid
    ? discountResult.discount.type === 'percentage'
      ? subtotal() * (discountResult.discount.value / 100)
      : discountResult.discount.value
    : 0
  const total = subtotal() + tax + deliveryFee - discountAmount

  const handleValidateDiscount = async () => {
    if (!discountCode.trim()) { setDiscountResult(null); return }
    const result = await window.api.discountCode.validate(discountCode.trim())
    setDiscountResult(result)
  }

  const handleCheckout = async () => {
    setValidationError('')
    if (orderType === 'delivery') {
      if (!customerName.trim()) { setValidationError('اكتب اسم العميل'); return }
      if (!deliveryPhone.trim()) { setValidationError('اكتب رقم التليفون'); return }
      if (!deliveryAddress.trim()) { setValidationError('اكتب العنوان'); return }
    }

    const cartItems = [...items]
    const orderItems = cartItems.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
      unitPrice: item.product.price + item.modifiers.reduce((s, m) => s + m.priceAdjustment, 0),
      modifiers: item.modifiers,
      addons: item.addons.map((a: any) => a.id),
    }))

    const createdAt = new Date()
    const result = await createOrder({
      orderType, tableNumber,
      customerName: orderType === 'delivery' ? customerName : undefined,
      customerPhone: orderType === 'delivery' ? deliveryPhone : undefined,
      customerAddress: orderType === 'delivery' ? deliveryAddress : undefined,
      subtotal: subtotal(), tax, deliveryFee, total,
      paymentType, cashierName: currentUser?.name,
      discountCode: discountResult?.valid ? discountCode : undefined,
      discountAmount: discountAmount > 0 ? discountAmount : undefined,
      discountCodeId: discountResult?.valid ? discountResult.discount?.id : undefined,
      items: orderItems,
    })

    await deductForOrder(result)
    await fetchAlerts()
    await fetchOrders()
    if (discountResult?.valid && discountResult.discount?.id) {
      await window.api.discountCode.use(discountResult.discount.id)
    }

    setLastOrder({
      id: result, items: cartItems, subtotal: subtotal(), tax, deliveryFee,
      discountAmount, total, orderType,
      tableNumber: tableNumber || undefined, customerName: customerName || undefined,
      customerPhone: deliveryPhone || undefined, customerAddress: deliveryAddress || undefined,
      paymentType, cashierName: currentUser?.name, createdAt,
    })
  }

  const handlePrint = () => {
    if (!lastOrder) return
    const html = buildReceiptHtml(lastOrder)
    const w = window.open('', '_blank', 'width=400,height=600')
    if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close() } }
  }

  const handleNewOrder = () => { setLastOrder(null); setDiscountResult(null); setValidationError(''); clearCart() }

  if (lastOrder) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center"><CheckCircle className="h-4 w-4 text-green-500" /></div>
            <div><h2 className="font-black text-sm">تم الطلب!</h2><p className="text-[10px] text-muted-foreground">{lastOrder.id}</p></div>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={handlePrint}><Printer className="h-3.5 w-3.5" /> طباعة</Button>
            <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={handleNewOrder}><RotateCcw className="h-3.5 w-3.5" /> طلب جديد</Button>
          </div>
        </div>
        <div className="h-px bg-border mx-4" />
        <ScrollArea className="flex-1 p-4">
          <div className="bg-white rounded-xl overflow-hidden shadow-lg">
            <Receipt orderId={lastOrder.id} items={lastOrder.items} subtotal={lastOrder.subtotal} tax={lastOrder.tax} deliveryFee={lastOrder.deliveryFee} total={lastOrder.total} orderType={lastOrder.orderType} tableNumber={lastOrder.tableNumber} customerName={lastOrder.customerName} customerPhone={lastOrder.customerPhone} customerAddress={lastOrder.customerAddress} paymentType={lastOrder.paymentType} cashierName={lastOrder.cashierName} />
          </div>
        </ScrollArea>
        <div className="p-4"><Button className="w-full rounded-2xl h-11 font-black" onClick={handleNewOrder}>طلب جديد</Button></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><ShoppingCart className="h-4 w-4 text-primary" /></div>
          <h2 className="font-black text-sm">الطلب</h2>
          {items.length > 0 && <span className="text-[10px] text-muted-foreground bg-secondary rounded-full px-2 py-0.5 font-bold">{itemCount()} أصناف</span>}
        </div>
        {items.length > 0 && <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg" onClick={clearCart}><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>

      <div className="px-4 pb-3"><OrderTypeSelector /></div>
      <div className="h-px bg-border mx-4" />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center"><ShoppingCart className="h-7 w-7 opacity-40" /></div>
          <div className="text-center"><p className="text-sm font-bold">السلة فارغة</p><p className="text-[11px] text-muted-foreground mt-0.5">اضغط على الأصناف لإضافتها</p></div>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1 px-4">
            {items.map((item) => <CartItem key={item.product.id} item={item} />)}
          </ScrollArea>

          <div className="px-5 py-4 space-y-2 bg-secondary/20 rounded-t-3xl">
            {/* Discount code input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input type="text" placeholder="كود الخصم" value={discountCode}
                  onChange={e => { setDiscountCode(e.target.value); setDiscountResult(null) }}
                  onBlur={handleValidateDiscount} onKeyDown={e => e.key === 'Enter' && handleValidateDiscount()}
                  className="w-full pr-9 pl-3 py-2 rounded-xl bg-secondary/60 text-xs font-medium border-0 focus:ring-1 focus:ring-primary focus:outline-none uppercase" dir="ltr" />
              </div>
            </div>
            {discountResult && (
              <div className={cn("text-[10px] font-bold px-2 py-1 rounded-lg", discountResult.valid ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
                {discountResult.valid ? `✓ خصم ${discountResult.discount.type === 'percentage' ? discountResult.discount.value + '%' : discountResult.discount.value + ' ج.م'}` : `✗ ${discountResult.error}`}
              </div>
            )}

            <div className="flex justify-between text-xs"><span className="text-muted-foreground">المجموع الفرعي</span><span className="font-bold">{subtotal().toFixed(0)} ج.م</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">ضريبة (14%)</span><span className="font-bold">{tax.toFixed(0)} ج.م</span></div>
            {orderType === 'delivery' && <div className="flex justify-between text-xs"><span className="text-muted-foreground">رسوم التوصيل</span><span className="font-bold">{deliveryFee} ج.م</span></div>}
            {discountAmount > 0 && <div className="flex justify-between text-xs text-green-400"><span>خصم</span><span className="font-bold">-{discountAmount.toFixed(0)} ج.م</span></div>}
            <div className="h-px bg-border" />
            <div className="flex justify-between items-baseline pt-1">
              <span className="font-black text-sm">الإجمالي</span>
              <div className="flex items-baseline gap-1"><span className="font-black text-xl text-primary">{total.toFixed(0)}</span><span className="text-xs text-muted-foreground font-medium">ج.م</span></div>
            </div>

            {/* Payment type — cash or visa */}
            <div className="flex gap-1.5 bg-secondary/60 p-1 rounded-xl">
              {paymentTypes.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setPaymentType(id)}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    paymentType === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>

            {/* Validation error */}
            {validationError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="font-bold">{validationError}</span>
              </div>
            )}

            <Button className="w-full rounded-2xl h-12 text-base font-black shadow-lg shadow-primary/25 mt-1 transition-transform active:scale-[0.98]" size="lg" onClick={handleCheckout}>
              تأكيد الطلب
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
