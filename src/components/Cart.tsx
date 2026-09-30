import { useCartStore } from '@/services/cart/cart.store'
import { useDeliveryStore } from '@/services/delivery/delivery.store'
import { printOrderPack, buildCustomerReceiptHtml } from '@/lib/print'
import { useOrderStore } from '@/services/order/order.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { useUserStore } from '@/services/user/user.store'
import { useShiftStore } from '@/services/shift/shift.store'
import { CartItem } from './CartItem'
import { Receipt } from './Receipt'
import { OrderTypeSelector } from './OrderTypeSelector'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShoppingCart, Trash2, CheckCircle, Banknote, CreditCard, Printer, RotateCcw, Tag, AlertCircle, Lock, StickyNote } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'

const paymentTypes = [
  { id: 'cash' as const, label: 'كاش', icon: Banknote },
  { id: 'visa' as const, label: 'فيزا', icon: CreditCard },
]

interface LastOrder {
  id: string
  items: any[]
  subtotal: number
  tax: number
  taxRate: number
  deliveryFee: number
  deliveryZoneId?: string
  deliveryZoneName?: string
  deliveryNote?: string
  discountAmount: number
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
  createdAt: Date
}

function buildReceiptHtml(o: LastOrder): string {
  const dateStr = o.createdAt.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = o.createdAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
  const paymentLabels: Record<string, string> = { cash: 'كاش', visa: 'فيزا' }
  const taxPercent = Math.round((o.taxRate || 0.14) * 100)

  let itemsHtml = ''
  for (const item of o.items) {
    const addonTotal = item.addons.reduce((s: number, a: any) => s + a.price * (a.qty || 1), 0)
    const modifierTotal = item.modifiers.reduce((s: number, m: any) => s + m.priceAdjustment, 0)
    const lineTotal = (item.product.price + addonTotal + modifierTotal) * item.quantity
    const itemNote = (item.note || '').trim()
    itemsHtml += `<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:13px"><span style="flex:1;min-width:0;overflow-wrap:anywhere">${item.product.emoji} ${item.product.name}${item.modifiers.length > 0 ? ` (${item.modifiers.map((m: any) => m.modifierName).join('، ')})` : ''} ×${item.quantity}${itemNote ? `<br><span style="color:#b45309;font-size:11px">📝 ${itemNote}</span>` : ''}</span><span style="font-weight:700;white-space:nowrap;flex-shrink:0">${fmtMoney(lineTotal)} ج.م</span></div>`
    for (const a of item.addons) {
      itemsHtml += `<div style="display:flex;justify-content:space-between;gap:8px;color:#666;font-size:11px;padding-right:16px;margin-bottom:2px"><span style="flex:1;min-width:0;overflow-wrap:anywhere">↳ ${a.emoji} ${a.name}${(a.qty || 1) > 1 ? ` ×${a.qty}` : ''}${item.quantity > 1 ? ` ×${item.quantity}` : ''}</span><span style="white-space:nowrap;flex-shrink:0">${fmtMoney(a.price * (a.qty || 1) * item.quantity)} ج.م</span></div>`
    }
  }

  let deliverySection = ''
  if (o.orderType === 'delivery') {
    deliverySection = `<div style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px;font-size:12px">
      <div style="font-weight:700;margin-bottom:4px">بيانات التوصيل:</div>
      ${o.customerName ? `<div class="row"><span class="gray">الاسم</span><span style="font-weight:700">${o.customerName}</span></div>` : ''}
      ${o.customerPhone ? `<div class="row"><span class="gray">التليفون</span><span style="font-weight:700">${o.customerPhone}</span></div>` : ''}
      ${o.customerAddress ? `<div class="row"><span class="gray">العنوان</span><span style="font-weight:700">${o.customerAddress}</span></div>` : ''}
      ${o.deliveryZoneName ? `<div class="row"><span class="gray">المنطقة</span><span style="font-weight:700">${o.deliveryZoneName}</span></div>` : ''}
      ${o.deliveryNote ? `<div class="row"><span class="gray">ملاحظة التوصيل</span><span style="font-weight:700">${o.deliveryNote}</span></div>` : ''}
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

  <div class="center" style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px">
    <p style="font-size:10px;color:#666">رقم الطلب</p>
    <p style="font-size:20px;font-weight:900">${o.id}</p>
  </div>

  <div style="border-bottom:1.5px dashed #ccc;padding-bottom:8px;margin-bottom:8px;font-size:12px">
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

  ${o.orderNote ? `<div style="border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;padding:6px 8px;margin-bottom:8px;font-size:12px"><span style="font-weight:900">📝 ملاحظة الطلب: </span><span>${o.orderNote}</span></div>` : ''}

  <div style="margin-bottom:16px;font-size:12px">
    <div class="row gray"><span>المجموع الفرعي</span><span>${o.subtotal.toFixed(0)} ج.م</span></div>
    <div class="row gray"><span>ضريبة القيمة المضافة (${taxPercent}%)</span><span>${o.tax.toFixed(0)} ج.م</span></div>
    ${o.deliveryFee > 0 ? `<div class="row gray"><span>رسوم التوصيل${o.deliveryZoneName ? ` (${o.deliveryZoneName})` : ''}</span><span>${fmtMoney(o.deliveryFee)} ج.م</span></div>` : ''}
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
  const deliveryZoneId = useCartStore((s) => s.deliveryZoneId)
  const deliveryNote = useCartStore((s) => s.deliveryNote)
  const paymentType = useCartStore((s) => s.paymentType)
  const setPaymentType = useCartStore((s) => s.setPaymentType)
  const discountCode = useCartStore((s) => s.discountCode)
  const setDiscountCode = useCartStore((s) => s.setDiscountCode)
  const orderNote = useCartStore((s) => s.orderNote)
  const setOrderNote = useCartStore((s) => s.setOrderNote)
  const currentUser = useUserStore((s) => s.currentUser)
  const currentShift = useShiftStore((s) => s.currentShift)
  const fetchCurrentShift = useShiftStore((s) => s.fetchCurrent)
  const createOrder = useOrderStore((s) => s.create)
  const deductForOrder = useInventoryStore((s) => s.deductForOrder)
  const fetchAlerts = useInventoryStore((s) => s.fetchAlerts)
  const fetchOrders = useOrderStore((s) => s.fetch)
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null)
  const [validationError, setValidationError] = useState('')
  const [discountResult, setDiscountResult] = useState<{ valid: boolean; discount?: any; error?: string } | null>(null)
  const [settings, setSettings] = useState<any>({})
  const [printStatus, setPrintStatus] = useState('')
  const zones = useDeliveryStore((s) => s.zones)
  const fetchZones = useDeliveryStore((s) => s.fetch)

  useEffect(() => { window.api.settings.get().then((s: any) => setSettings(s || {})) }, [])
  useEffect(() => { fetchCurrentShift() }, [])
  useEffect(() => { fetchZones() }, [])

  const rawTaxRate = Number(settings.taxRate)
  const taxRate = rawTaxRate > 1 ? rawTaxRate / 100 : Number.isFinite(rawTaxRate) && settings.taxRate !== undefined ? rawTaxRate : 0.14
  const activeZone = zones.find((z) => z.id === deliveryZoneId && z.active)
  const legacyFee = settings.deliveryFee !== undefined ? Number(settings.deliveryFee) : 25
  const tax = subtotal() * taxRate
  const deliveryFee = orderType === 'delivery' ? (activeZone ? Number(activeZone.fee) : (zones.length > 0 ? 0 : legacyFee)) : 0
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
    if (!currentShift) {
      setValidationError('لا يمكن إنشاء طلب بدون وردية مفتوحة — افتح وردية أولاً')
      return
    }
    if (orderType === 'delivery') {
      if (!customerName.trim()) { setValidationError('اكتب اسم العميل'); return }
      if (!deliveryPhone.trim()) { setValidationError('اكتب رقم التليفون'); return }
      if (!deliveryAddress.trim()) { setValidationError('اكتب العنوان'); return }
      if (zones.length > 0 && !deliveryZoneId) { setValidationError('اختار منطقة التوصيل'); return }
    }

    try {
      const cartItems = [...items]
      const orderItems = cartItems.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.product.price + item.modifiers.reduce((s, m) => s + m.priceAdjustment, 0),
        note: (item.note || '').trim() || undefined,
        modifiers: item.modifiers,
        addons: item.addons.flatMap((a) => Array(a.qty || 1).fill(a.id)),
      }))

      const createdAt = new Date()
      const result = await createOrder({
        orderType, tableNumber,
        customerName: orderType === 'delivery' ? customerName : undefined,
        customerPhone: orderType === 'delivery' ? deliveryPhone : undefined,
        customerAddress: orderType === 'delivery' ? deliveryAddress : undefined,
        deliveryZoneId: orderType === 'delivery' ? deliveryZoneId || undefined : undefined,
        deliveryZoneName: orderType === 'delivery' ? activeZone?.name : undefined,
        deliveryNote: orderType === 'delivery' ? deliveryNote.trim() || undefined : undefined,
        subtotal: subtotal(), tax, deliveryFee, total,
        paymentType, cashierName: currentUser?.name,
        userId: currentUser?.id,
        note: orderNote.trim() || undefined,
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
        id: result, items: cartItems, subtotal: subtotal(), tax, taxRate,
        deliveryFee,
        deliveryZoneId: orderType === 'delivery' ? deliveryZoneId || undefined : undefined,
        deliveryZoneName: orderType === 'delivery' ? activeZone?.name : undefined,
        deliveryNote: orderType === 'delivery' ? deliveryNote.trim() || undefined : undefined,
        discountAmount, discountCode: discountResult?.valid ? discountCode : undefined,
        orderNote: orderNote.trim() || undefined, total, orderType,
        tableNumber: tableNumber || undefined, customerName: customerName || undefined,
        customerPhone: deliveryPhone || undefined, customerAddress: deliveryAddress || undefined,
        paymentType, cashierName: currentUser?.name, createdAt,
      })

      // ─── Silent auto-print: receipt + routed kitchen tickets ───
      try {
        const s: any = await window.api.settings.get()
        const printed = await printOrderPack({
          order: {
            id: result, orderType,
            tableNumber: tableNumber || undefined,
            customerName: customerName || undefined,
            customerPhone: deliveryPhone || undefined,
            customerAddress: deliveryAddress || undefined,
            deliveryZoneName: orderType === 'delivery' ? activeZone?.name : undefined,
            deliveryNote: orderType === 'delivery' ? deliveryNote.trim() || undefined : undefined,
            note: orderNote.trim() || undefined,
            cashierName: currentUser?.name,
            createdAt,
            items: cartItems.map((i: any) => ({
              productName: i.product.name, productEmoji: i.product.emoji,
              quantity: i.quantity, unitPrice: i.product.price,
              note: i.note, modifiers: i.modifiers, addons: i.addons,
            })),
            subtotal: subtotal(), tax, taxRate, deliveryFee,
            discountAmount, discountCode: discountResult?.valid ? discountCode : undefined,
            total, paymentType,
          },
          receiptPrinter: s?.receiptPrinter,
          receiptWidth: s?.receiptWidth || '80mm',
          autoReceipt: s?.autoPrintReceipt ?? true,
          autoKitchen: s?.autoPrintKitchen ?? true,
          copies: s?.kitchenCopies || 1,
        })
        const failedKitchen = printed.kitchen.filter((k) => !k.ok)
        if (printed.receipt && !printed.receipt.ok) {
          setPrintStatus(`⚠️ الإيصال ما اتطبعش: ${printed.receipt.error}`)
        } else if (failedKitchen.length > 0) {
          setPrintStatus(`⚠️ المطبخ: ${failedKitchen.map((k) => `${k.station} (${k.error})`).join('، ')}`)
        } else if (printed.unrouted > 0) {
          setPrintStatus(`⚠️ ${printed.unrouted} صنف مش مربوط بمحطة — اتأكد من التوجيه في الإعدادات`)
        } else {
          setPrintStatus('')
        }
      } catch (err: any) {
        setPrintStatus(`⚠️ الطباعة: ${err?.message || 'فشلت'}`)
      }
    } catch (err: any) {
      console.error('checkout failed', err)
      setValidationError(err?.message || 'حدث خطأ أثناء تأكيد الطلب — حاول مرة أخرى')
    }
  }

  const handlePrint = async () => {
    if (!lastOrder) return
    try {
      const s: any = await window.api.settings.get()
      const res = await window.api.printer.printHtml(
        buildCustomerReceiptHtml({ ...lastOrder, taxRate: lastOrder.taxRate } as any, s?.receiptWidth || '80mm'),
        { deviceName: s?.receiptPrinter || undefined, copies: 1, paperWidth: s?.receiptWidth || '80mm' },
      )
      if (!res?.ok) {
        const html = buildReceiptHtml(lastOrder)
        const w = window.open('', '_blank', 'width=400,height=600')
        if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close() } }
      }
    } catch {
      const html = buildReceiptHtml(lastOrder)
      const w = window.open('', '_blank', 'width=400,height=600')
      if (w) { w.document.write(html); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close() } }
    }
  }

  const handleNewOrder = () => { setLastOrder(null); setDiscountResult(null); setValidationError(''); setPrintStatus(''); clearCart() }

  if (lastOrder) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center"><CheckCircle className="h-4 w-4 text-green-500" /></div>
            <div><h2 className="font-black text-sm">تم الطلب!</h2><p className="text-[10px] text-muted-foreground">{lastOrder.id}</p></div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="touch" className="rounded-xl gap-2 flex-1" onClick={handlePrint}><Printer className="h-5 w-5" /> طباعة</Button>
            <Button variant="ghost" size="touch" className="rounded-xl gap-2 flex-1" onClick={handleNewOrder}><RotateCcw className="h-5 w-5" /> طلب جديد</Button>
          </div>
        </div>
        {printStatus && (
          <div className="mx-5 mb-2 text-xs font-bold bg-amber-500/10 text-amber-400 rounded-xl px-3 py-2">{printStatus}</div>
        )}
        <div className="h-px bg-border mx-4" />
        <ScrollArea className="flex-1 p-4">
          <div className="bg-white rounded-xl overflow-hidden shadow-lg">
            <Receipt orderId={lastOrder.id} items={lastOrder.items} subtotal={lastOrder.subtotal} tax={lastOrder.tax} taxRate={lastOrder.taxRate} deliveryFee={lastOrder.deliveryFee} deliveryZoneName={lastOrder.deliveryZoneName} deliveryNote={lastOrder.deliveryNote} discountAmount={lastOrder.discountAmount} discountCode={lastOrder.discountCode} orderNote={lastOrder.orderNote} total={lastOrder.total} orderType={lastOrder.orderType} tableNumber={lastOrder.tableNumber} customerName={lastOrder.customerName} customerPhone={lastOrder.customerPhone} customerAddress={lastOrder.customerAddress} paymentType={lastOrder.paymentType} cashierName={lastOrder.cashierName} />
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
        {items.length > 0 && <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive rounded-xl" onClick={clearCart}><Trash2 className="h-5 w-5" /></Button>}
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
          <ScrollArea className="flex-1 px-4 min-h-0">
            <div className="py-1">
              {items.map((item) => <CartItem key={item.lineId} item={item} />)}
            </div>
          </ScrollArea>

          <ScrollArea className="shrink-0 max-h-[45%] px-5 py-3 space-y-2 bg-secondary/20 rounded-t-3xl border-t">
            {/* Order note */}
            <div className="relative">
              <StickyNote className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-400/70 pointer-events-none" />
              <input type="text" placeholder="ملاحظة للطلب كله… (مستعجل، بدون بصل…)" value={orderNote}
                onChange={e => setOrderNote(e.target.value)}
                className="w-full pr-10 pl-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm font-medium focus:ring-1 focus:ring-amber-500/40 focus:outline-none placeholder:text-muted-foreground" dir="rtl" />
            </div>
            {/* Discount code input */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Tag className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="text" placeholder="كود الخصم" value={discountCode}
                  onChange={e => { setDiscountCode(e.target.value); setDiscountResult(null) }}
                  onBlur={handleValidateDiscount} onKeyDown={e => e.key === 'Enter' && handleValidateDiscount()}
                  className="w-full pr-10 pl-3 py-2.5 rounded-xl bg-secondary/60 text-sm font-medium border-0 focus:ring-1 focus:ring-primary focus:outline-none uppercase" dir="ltr" />
              </div>
              <Button className="rounded-xl h-11 px-4 text-sm font-bold shrink-0" onClick={handleValidateDiscount}>تحقق</Button>
            </div>
            {discountResult && (
              <div className={cn("text-xs font-bold px-2 py-1 rounded-lg", discountResult.valid ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400")}>
                {discountResult.valid ? `✓ خصم ${discountResult.discount.type === 'percentage' ? discountResult.discount.value + '%' : discountResult.discount.value + ' ج.م'}` : `✗ ${discountResult.error}`}
              </div>
            )}

            {/* Totals — single compact line */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>الفرعي <span className="font-bold text-foreground">{subtotal().toFixed(0)}</span></span>
              <span>ضريبة <span className="font-bold text-foreground">{tax.toFixed(0)}</span></span>
              {orderType === 'delivery' && (
                <span>توصيل{activeZone ? ` (${activeZone.name})` : ''} <span className="font-bold text-foreground">{fmtMoney(deliveryFee)}</span></span>
              )}
              {orderType === 'delivery' && zones.length > 0 && !deliveryZoneId && (
                <span className="text-amber-400 font-bold">اختار المنطقة</span>
              )}
              {discountAmount > 0 && <span className="text-green-400">خصم <span className="font-bold">-{discountAmount.toFixed(0)}</span></span>}
              <span className="mr-auto flex items-baseline gap-1">
                <span className="font-black text-sm text-foreground">الإجمالي</span>
                <span className="font-black text-xl text-primary">{total.toFixed(0)}</span>
                <span className="font-medium">ج.م</span>
              </span>
            </div>

            {/* Payment type — cash or visa */}
            <div className="flex gap-1.5 bg-secondary/60 p-1 rounded-xl">
              {paymentTypes.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setPaymentType(id)}
                  className={cn("flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-lg text-sm font-bold transition-all cursor-pointer",
                    paymentType === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>

            {/* Validation error + shift warning */}
            {(validationError || !currentShift) && (
              <div className="space-y-2">
                {validationError && (
                  <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-bold">{validationError}</span>
                  </div>
                )}
                {!currentShift && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-bold">لا توجد وردية مفتوحة</span>
                  </div>
                )}
              </div>
            )}

            <Button className="w-full rounded-2xl h-12 text-base font-black shadow-lg shadow-primary/25 transition-transform active:scale-[0.98]" size="lg" onClick={handleCheckout} disabled={!currentShift}>
              تأكيد الطلب · {total.toFixed(0)} ج.م
            </Button>
          </ScrollArea>
        </>
      )}
    </div>
  )
}
