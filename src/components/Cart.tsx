import { useCartStore } from '@/services/cart/cart.store'
import { useDeliveryStore } from '@/services/delivery/delivery.store'
import { printOrderPack, buildCustomerReceiptHtml, contentWidth, autosizeScript } from '@/lib/print'
import { normalizeReceiptInfo } from '@/lib/receipt'
import { useOrderStore } from '@/services/order/order.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { useUserStore } from '@/services/user/user.store'
import { useShiftStore } from '@/services/shift/shift.store'
import { CartItem } from './CartItem'
import { Receipt } from './Receipt'
import { OrderTypeSelector } from './OrderTypeSelector'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShoppingCart, Trash2, CheckCircle, Banknote, CreditCard, Printer, RotateCcw, Tag, AlertCircle, Lock, StickyNote, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { toast } from '@/components/ui/toast'

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
  deliveryProfileId?: string
  deliveryProfileName?: string
  discountAmount: number
  discountCode?: string
  orderNote?: string
  total: number
  orderType: string
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  paymentType: string
  cashierName?: string
  createdAt: Date
}

export function Cart() {
  const items = useCartStore((s) => s.items)
  const subtotal = useCartStore((s) => s.subtotal)
  const itemCount = useCartStore((s) => s.itemCount)
  const clearCart = useCartStore((s) => s.clearCart)
  const orderType = useCartStore((s) => s.orderType)
  const deliveryAddress = useCartStore((s) => s.deliveryAddress)
  const deliveryPhone = useCartStore((s) => s.deliveryPhone)
  const customerName = useCartStore((s) => s.customerName)
  const deliveryZoneId = useCartStore((s) => s.deliveryZoneId)
  const deliveryNote = useCartStore((s) => s.deliveryNote)
  const deliveryProfileId = useCartStore((s) => s.deliveryProfileId)
  const deliveryProfileName = useCartStore((s) => s.deliveryProfileName)
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
  const [step, setStep] = useState<1 | 2>(1)
  const zones = useDeliveryStore((s) => s.zones)
  const fetchZones = useDeliveryStore((s) => s.fetch)

  useEffect(() => { window.api.settings.get().then((s: any) => setSettings(s || {})) }, [])
  useEffect(() => { fetchCurrentShift() }, [])
  useEffect(() => { fetchZones() }, [])

  const rawTaxRate = Number(settings.taxRate)
  const taxRate = rawTaxRate > 1 ? rawTaxRate / 100 : Number.isFinite(rawTaxRate) && settings.taxRate !== undefined ? rawTaxRate : 0.14
  const activeZone = zones.find((z) => z.id === deliveryZoneId && z.active)
  // Money stays in whole pounds: round the subtotal once, then derive tax,
  // discount and total from that rounded figure so every line the receipt
  // prints (subtotal + tax + delivery − discount) adds up to the total exactly.
  const sub = Math.round(subtotal())
  const tax = Math.round(sub * taxRate)
  const deliveryFee = orderType === 'delivery' && activeZone ? Math.round(Number(activeZone.fee) || 0) : 0
  const rawDiscount = discountResult?.valid
    ? discountResult.discount.type === 'percentage'
      ? Math.round(sub * (discountResult.discount.value / 100))
      : Math.round(Number(discountResult.discount.value) || 0)
    : 0
  // Never discount more than the goods themselves — mirrors seed.ts, and keeps
  // the total from going negative (and therefore never a float).
  const discountAmount = Math.min(Math.max(rawDiscount, 0), sub)
  const total = sub + tax + deliveryFee - discountAmount

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
        orderType,
        customerName: orderType === 'delivery' ? customerName : undefined,
        customerPhone: orderType === 'delivery' ? deliveryPhone : undefined,
        customerAddress: orderType === 'delivery' ? deliveryAddress : undefined,
        deliveryZoneId: orderType === 'delivery' ? deliveryZoneId || undefined : undefined,
        deliveryZoneName: orderType === 'delivery' ? activeZone?.name : undefined,
        deliveryNote: orderType === 'delivery' ? deliveryNote.trim() || undefined : undefined,
        deliveryProfileId: orderType === 'delivery' ? deliveryProfileId || undefined : undefined,
        deliveryProfileName: orderType === 'delivery' ? deliveryProfileName || undefined : undefined,
        subtotal: sub, tax, deliveryFee, total,
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
        id: result, items: cartItems, subtotal: sub, tax, taxRate,
        deliveryFee,
        deliveryZoneId: orderType === 'delivery' ? deliveryZoneId || undefined : undefined,
        deliveryZoneName: orderType === 'delivery' ? activeZone?.name : undefined,
        deliveryNote: orderType === 'delivery' ? deliveryNote.trim() || undefined : undefined,
        deliveryProfileId: orderType === 'delivery' ? deliveryProfileId || undefined : undefined,
        deliveryProfileName: orderType === 'delivery' ? deliveryProfileName || undefined : undefined,
        discountAmount, discountCode: discountResult?.valid ? discountCode : undefined,
        orderNote: orderNote.trim() || undefined, total, orderType,
        customerName: customerName || undefined,
        customerPhone: deliveryPhone || undefined, customerAddress: deliveryAddress || undefined,
        paymentType, cashierName: currentUser?.name, createdAt,
      })

      // ─── Silent auto-print: receipt + routed kitchen tickets ───
      try {
        const s: any = await window.api.settings.get()
        // Delivery order with no driver yet: the kitchen must start work now,
        // so its tickets print — but the customer receipt waits until a driver
        // is assigned (releases from the الديلفري page).
        const withholdReceipt = orderType === 'delivery' && !deliveryProfileId
        const printed = await printOrderPack({
          order: {
            id: result, orderType,
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
            subtotal: sub, tax, taxRate, deliveryFee,
            discountAmount, discountCode: discountResult?.valid ? discountCode : undefined,
            total, paymentType,
          },
          receiptPrinter: s?.receiptPrinter,
          paperWidth: s?.receiptWidth || '80mm',
          autoReceipt: (s?.autoPrintReceipt ?? true) && !withholdReceipt,
          autoKitchen: s?.autoPrintKitchen ?? true,
          copies: s?.kitchenCopies || 1,
          receiptCopies: s?.receiptCopies || 1,
          receiptInfo: s,
        })
        const failedKitchen = printed.kitchen.filter((k) => !k.ok)
        if (printed.receipt && !printed.receipt.ok) {
          const message = `الإيصال ما اتطبعش: ${printed.receipt.error || 'فشلت الطباعة'}`
          setPrintStatus(`⚠️ ${message}`)
          toast({ title: 'فشلت الطباعة التلقائية', description: message, variant: 'error', duration: 7000 })
        } else if (failedKitchen.length > 0) {
          const message = `المطبخ: ${failedKitchen.map((k) => `${k.station} (${k.error || 'فشلت الطباعة'})`).join('، ')}`
          setPrintStatus(`⚠️ ${message}`)
          toast({ title: 'فشلت طباعة بعض تذاكر المطبخ', description: message, variant: 'error', duration: 7000 })
        } else if (printed.unrouted > 0) {
          const message = `${printed.unrouted} صنف مش مربوط بمحطة — اتأكد من التوجيه في الإعدادات`
          setPrintStatus(`⚠️ ${message}`)
          toast({ title: 'الطلب تم، لكن التوجيه ناقص', description: message, variant: 'warning', duration: 7000 })
        } else {
          setPrintStatus('')
          if (withholdReceipt) {
            const kitchenLine = printed.kitchen.some((k) => k.ok) ? 'تذاكر المطبخ اتطبعت' : 'مفيش تذاكر مطبخ اتطبعت'
            toast({
              title: 'طلب توصيل — لسه بدون سائق',
              description: `${kitchenLine} — الإيصال هيتطبع بعد تعيين السائق · الطلب ${result}`,
              variant: 'warning',
              duration: 7000,
            })
          } else if (s?.autoPrintReceipt || s?.autoPrintKitchen) {
            const parts = [
              printed.receipt?.ok ? 'الإيصال' : '',
              printed.kitchen.some((k) => k.ok) ? 'تذاكر المطبخ' : '',
            ].filter(Boolean)
            if (parts.length > 0) {
              toast({ title: 'تمت الطباعة التلقائية', description: `${parts.join(' و ')} — الطلب ${result}`, variant: 'success' })
            }
          }
        }
      } catch (err: any) {
        const message = err?.message || 'فشلت'
        setPrintStatus(`⚠️ الطباعة: ${message}`)
        toast({ title: 'فشلت الطباعة التلقائية', description: message, variant: 'error', duration: 7000 })
      }
    } catch (err: any) {
      console.error('checkout failed', err)
      setValidationError(err?.message || 'حدث خطأ أثناء تأكيد الطلب — حاول مرة أخرى')
    }
  }

  const handlePrint = async () => {
    if (!lastOrder) return
    // Same rule as OrderHistory: a delivery order with no driver hasn't been
    // released for its customer receipt yet.
    if (lastOrder.orderType === 'delivery' && !lastOrder.deliveryProfileId) {
      toast({
        title: 'الإيصال لسه مقفول',
        description: `الطلب ${lastOrder.id} بدون سائق — عيّن سائق من صفحة الديلفري الأول`,
        variant: 'warning',
        duration: 6500,
      })
      return
    }
    toast({
      title: 'جارٍ طباعة الإيصال',
      description: `الطلب ${lastOrder.id}`,
      duration: 5000,
    })
    const s: any = await window.api.settings.get()
    const paper = s?.receiptWidth || '80mm'
    const cw = contentWidth(paper)
    const html = buildCustomerReceiptHtml(lastOrder as any, cw, normalizeReceiptInfo(s))
    const htmlWithAutosize = html.replace('</head>', autosizeScript(cw) + '</head>')
    try {
      const res = await window.api.printer.printHtml(html, { deviceName: s?.receiptPrinter || undefined, copies: 1, paperWidth: paper, order: lastOrder as any })
      if (res?.ok) {
        toast({
          title: 'تمت طباعة الإيصال',
          description: `الطلب ${lastOrder.id} أُرسل للطابعة`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'تعذر الإرسال للطابعة',
          description: res?.error || 'تم فتح نافذة الطباعة اليدوية',
          variant: 'warning',
          duration: 6500,
        })
        const w = window.open('', '_blank', 'width=400,height=600')
        if (w) { w.document.write(htmlWithAutosize); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close() } }
      }
    } catch (err: any) {
      toast({
        title: 'حدث خطأ أثناء الطباعة',
        description: err?.message || 'تم فتح نافذة الطباعة اليدوية',
        variant: 'warning',
        duration: 6500,
      })
      const w = window.open('', '_blank', 'width=400,height=600')
      if (w) { w.document.write(htmlWithAutosize); w.document.close(); w.onload = () => { w.print(); w.onafterprint = () => w.close() } }
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
            <Button variant="outline" size="touch" className="rounded-xl gap-2 flex-1" onClick={handlePrint}
              disabled={lastOrder.orderType === 'delivery' && !lastOrder.deliveryProfileId}
              title={lastOrder.orderType === 'delivery' && !lastOrder.deliveryProfileId ? 'الإيصال يتطبع بعد تعيين السائق' : 'طباعة الإيصال'}>
              <Printer className="h-5 w-5" /> {lastOrder.orderType === 'delivery' && !lastOrder.deliveryProfileId ? 'مؤجل' : 'طباعة'}
            </Button>
            <Button variant="ghost" size="touch" className="rounded-xl gap-2 flex-1" onClick={handleNewOrder}><RotateCcw className="h-5 w-5" /> طلب جديد</Button>
          </div>
        </div>
        {printStatus && (
          <div className="mx-5 mb-2 text-xs font-bold bg-amber-500/10 text-amber-400 rounded-xl px-3 py-2">{printStatus}</div>
        )}
        <div className="h-px bg-border mx-4" />
        <ScrollArea className="flex-1 p-4">
          <div className="bg-white rounded-xl overflow-hidden shadow-lg">
            <Receipt orderId={lastOrder.id} items={lastOrder.items} subtotal={lastOrder.subtotal} tax={lastOrder.tax} taxRate={lastOrder.taxRate} deliveryFee={lastOrder.deliveryFee} deliveryZoneName={lastOrder.deliveryZoneName} deliveryNote={lastOrder.deliveryNote} deliveryProfileName={lastOrder.deliveryProfileName} discountAmount={lastOrder.discountAmount} discountCode={lastOrder.discountCode} orderNote={lastOrder.orderNote} total={lastOrder.total} orderType={lastOrder.orderType} customerName={lastOrder.customerName} customerPhone={lastOrder.customerPhone} customerAddress={lastOrder.customerAddress} paymentType={lastOrder.paymentType} cashierName={lastOrder.cashierName} createdAt={lastOrder.createdAt} info={normalizeReceiptInfo(settings)} />
          </div>
        </ScrollArea>
        <div className="p-4"><Button className="w-full rounded-2xl h-11 font-black" onClick={handleNewOrder}>طلب جديد</Button></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><ShoppingCart className="h-4 w-4 text-primary" /></div>
          <h2 className="font-black text-sm">الطلب</h2>
          {items.length > 0 && <span className="text-[10px] text-muted-foreground bg-secondary rounded-full px-2 py-0.5 font-bold">{itemCount()} أصناف</span>}
        </div>
        {items.length > 0 && <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive rounded-xl" onClick={() => { clearCart(); setStep(1) }}><Trash2 className="h-5 w-5" /></Button>}
      </div>

      {/* Step indicator */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 px-5 pb-3">
          <button onClick={() => setStep(1)} className={cn("flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer", step === 1 ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
            <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black", step === 1 ? "bg-primary text-primary-foreground" : "bg-secondary")}>1</span>
            الطلب
          </button>
          <div className={cn("flex-1 h-0.5 rounded-full mx-1", step === 2 ? "bg-primary" : "bg-secondary")} />
          <button onClick={() => { if (items.length > 0) setStep(2) }} className={cn("flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer", step === 2 ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
            <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black", step === 2 ? "bg-primary text-primary-foreground" : "bg-secondary")}>2</span>
            الدفع
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center"><ShoppingCart className="h-7 w-7 opacity-40" /></div>
          <div className="text-center"><p className="text-sm font-bold">السلة فارغة</p><p className="text-[11px] text-muted-foreground mt-0.5">اضغط على الأصناف لإضافتها</p></div>
        </div>
      ) : step === 1 ? (
        /* ── Step 1: Order ── */
        <>
          <ScrollArea className="flex-1 px-4 min-h-0">
            <div className="py-1">
              {items.map((item) => <CartItem key={item.lineId} item={item} />)}
            </div>
          </ScrollArea>
          <div className="p-4 border-t bg-background">
            <Button className="w-full rounded-2xl h-12 text-base font-black gap-2" onClick={() => setStep(2)}>
              التالي — الدفع <ChevronLeft className="h-5 w-5" />
            </Button>
          </div>
        </>
      ) : (
        /* ── Step 2: Payment ── */
        <>
          <ScrollArea className="flex-1 px-5 py-3 space-y-2">
            {/* Order type */}
            <div className="pb-2"><OrderTypeSelector /></div>
            <div className="h-px bg-border" />
            <div className="relative">
              <StickyNote className="absolute right-3 top-3 h-4 w-4 text-amber-400/70 pointer-events-none" />
              <textarea placeholder="ملاحظة للطلب كله… (مستعجل، بدون بصل…)" value={orderNote}
                onChange={e => setOrderNote(e.target.value)} rows={2}
                className="w-full pr-10 pl-3 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm font-medium focus:ring-1 focus:ring-amber-500/40 focus:outline-none placeholder:text-muted-foreground resize-none" dir="rtl"
                style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }} />
            </div>
            {/* Discount code */}
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

            {/* Totals */}
            <div className="bg-secondary/30 rounded-xl p-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>الفرعي</span><span className="font-bold text-foreground">{sub} ج.م</span></div>
              <div className="flex justify-between"><span>ضريبة القيمة المضافة</span><span className="font-bold text-foreground">{tax} ج.م</span></div>
              {orderType === 'delivery' && (
                <div className="flex justify-between">
                  <span>توصيل{activeZone ? ` (${activeZone.name})` : ''}</span>
                  <span className="font-bold text-foreground">{fmtMoney(deliveryFee)} ج.م</span>
                </div>
              )}
              {orderType === 'delivery' && zones.length > 0 && !deliveryZoneId && (
                <div className="flex justify-between"><span className="text-amber-400 font-bold">اختار المنطقة</span></div>
              )}
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-400"><span>خصم</span><span className="font-bold">-{discountAmount} ج.م</span></div>
              )}
              <div className="h-px bg-border my-1" />
              <div className="flex justify-between items-baseline">
                <span className="font-black text-sm text-foreground">الإجمالي</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-black text-xl text-primary">{total}</span>
                  <span className="font-medium text-foreground">ج.م</span>
                </div>
              </div>
            </div>

            {/* Payment type */}
            <div className="flex gap-1.5 bg-secondary/60 p-1 rounded-xl">
              {paymentTypes.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setPaymentType(id)}
                  className={cn("flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-lg text-sm font-bold transition-all cursor-pointer",
                    paymentType === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>

            {/* Validation + shift warning */}
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
          </ScrollArea>

          {/* Bottom actions */}
          <div className="p-4 border-t bg-background space-y-2">
            <div className="flex gap-2">
              <Button variant="ghost" className="rounded-2xl h-12 gap-1 shrink-0" onClick={() => setStep(1)}>
                <ChevronRight className="h-5 w-5" /> رجوع
              </Button>
              <Button className="flex-1 rounded-2xl h-12 text-base font-black shadow-lg shadow-primary/25 transition-transform active:scale-[0.98]" size="lg" onClick={handleCheckout} disabled={!currentShift}>
                تأكيد الطلب · {total} ج.م
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
