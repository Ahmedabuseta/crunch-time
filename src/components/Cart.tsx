import { useCartStore } from '@/services/cart/cart.store'
import { useOrderStore } from '@/services/order/order.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { useUserStore } from '@/services/user/user.store'
import { CartItem } from './CartItem'
import { Receipt } from './Receipt'
import { OrderTypeSelector } from './OrderTypeSelector'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShoppingCart, Trash2, CheckCircle, Banknote, CreditCard, Wallet, Printer, RotateCcw } from 'lucide-react'
import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'

const paymentTypes = [
  { id: 'cash' as const, label: 'كاش', icon: Banknote },
  { id: 'card' as const, label: 'كارت', icon: CreditCard },
  { id: 'wallet' as const, label: 'محفظة', icon: Wallet },
]

interface LastOrder {
  id: string
  items: any[]
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
  const currentUser = useUserStore((s) => s.currentUser)
  const createOrder = useOrderStore((s) => s.create)
  const deductForOrder = useInventoryStore((s) => s.deductForOrder)
  const fetchAlerts = useInventoryStore((s) => s.fetchAlerts)
  const fetchOrders = useOrderStore((s) => s.fetch)
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null)
  const [printing, setPrinting] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)

  const tax = subtotal() * 0.14
  const deliveryFee = orderType === 'delivery' ? 25 : 0
  const total = subtotal() + tax + deliveryFee

  const handleCheckout = async () => {
    const cartItems = [...items] // snapshot before clear
    const orderItems = cartItems.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
      unitPrice: item.product.price + item.modifiers.reduce((s, m) => s + m.priceAdjustment, 0),
      modifiers: item.modifiers,
      addons: item.addons.map((a: any) => a.id),
    }))

    const result = await createOrder({
      orderType,
      tableNumber,
      customerName: orderType === 'delivery' ? customerName : undefined,
      customerPhone: orderType === 'delivery' ? deliveryPhone : undefined,
      customerAddress: orderType === 'delivery' ? deliveryAddress : undefined,
      subtotal: subtotal(),
      tax,
      deliveryFee,
      total,
      paymentType,
      cashierName: currentUser?.name,
      items: orderItems,
    })

    await deductForOrder(result)
    await fetchAlerts()
    await fetchOrders()

    // Store receipt data
    setLastOrder({
      id: result,
      items: cartItems,
      subtotal: subtotal(),
      tax,
      deliveryFee,
      total,
      orderType,
      tableNumber: tableNumber || undefined,
      customerName: customerName || undefined,
      customerPhone: deliveryPhone || undefined,
      customerAddress: deliveryAddress || undefined,
      paymentType,
      cashierName: currentUser?.name,
    })
  }

  const handlePrint = () => {
    setPrinting(true)
    setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 100)
  }

  const handleNewOrder = () => {
    setLastOrder(null)
    clearCart()
  }

  // Receipt view after checkout
  if (lastOrder) {
    return (
      <div className="flex flex-col h-full">
        {/* Receipt header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <h2 className="font-black text-sm">تم الطلب!</h2>
              <p className="text-[10px] text-muted-foreground">{lastOrder.id}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" /> طباعة
            </Button>
            <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={handleNewOrder}>
              <RotateCcw className="h-3.5 w-3.5" /> طلب جديد
            </Button>
          </div>
        </div>

        <div className="h-px bg-border mx-4" />

        {/* Receipt preview */}
        <ScrollArea className="flex-1 p-4">
          <div className="bg-white rounded-xl overflow-hidden shadow-lg" ref={receiptRef}>
            <Receipt
              orderId={lastOrder.id}
              items={lastOrder.items}
              subtotal={lastOrder.subtotal}
              tax={lastOrder.tax}
              deliveryFee={lastOrder.deliveryFee}
              total={lastOrder.total}
              orderType={lastOrder.orderType}
              tableNumber={lastOrder.tableNumber}
              customerName={lastOrder.customerName}
              customerPhone={lastOrder.customerPhone}
              customerAddress={lastOrder.customerAddress}
              paymentType={lastOrder.paymentType}
              cashierName={lastOrder.cashierName}
            />
          </div>
        </ScrollArea>

        {/* Bottom action */}
        <div className="p-4">
          <Button className="w-full rounded-2xl h-11 font-black" onClick={handleNewOrder}>
            طلب جديد
          </Button>
        </div>

        {/* Hidden receipt for printing */}
        {printing && (
          <div className="fixed inset-0 z-[9999] bg-white" style={{ overflow: 'auto' }}>
            <Receipt
              orderId={lastOrder.id}
              items={lastOrder.items}
              subtotal={lastOrder.subtotal}
              tax={lastOrder.tax}
              deliveryFee={lastOrder.deliveryFee}
              total={lastOrder.total}
              orderType={lastOrder.orderType}
              tableNumber={lastOrder.tableNumber}
              customerName={lastOrder.customerName}
              customerPhone={lastOrder.customerPhone}
              customerAddress={lastOrder.customerAddress}
              paymentType={lastOrder.paymentType}
              cashierName={lastOrder.cashierName}
            />
          </div>
        )}
      </div>
    )
  }

  // Cart view
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShoppingCart className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-black text-sm">الطلب</h2>
          {items.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-secondary rounded-full px-2 py-0.5 font-bold">{itemCount()} أصناف</span>
          )}
        </div>
        {items.length > 0 && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg" onClick={clearCart}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="px-4 pb-3"><OrderTypeSelector /></div>
      <div className="h-px bg-border mx-4" />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center">
            <ShoppingCart className="h-7 w-7 opacity-40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold">السلة فارغة</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">اضغط على الأصناف لإضافتها</p>
          </div>
        </div>
      ) : (
        <>
          <ScrollArea className="flex-1 px-4">
            {items.map((item) => <CartItem key={item.product.id} item={item} />)}
          </ScrollArea>

          <div className="px-5 py-4 space-y-2 bg-secondary/20 rounded-t-3xl">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span className="font-bold">{subtotal().toFixed(0)} ج.م</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">ضريبة (14%)</span>
              <span className="font-bold">{tax.toFixed(0)} ج.م</span>
            </div>
            {orderType === 'delivery' && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">رسوم التوصيل</span>
                <span className="font-bold">{deliveryFee} ج.م</span>
              </div>
            )}
            <div className="h-px bg-border" />
            <div className="flex justify-between items-baseline pt-1">
              <span className="font-black text-sm">الإجمالي</span>
              <div className="flex items-baseline gap-1">
                <span className="font-black text-xl text-primary">{total.toFixed(0)}</span>
                <span className="text-xs text-muted-foreground font-medium">ج.م</span>
              </div>
            </div>

            {/* Payment type selector */}
            <div className="flex gap-1.5 bg-secondary/60 p-1 rounded-xl">
              {paymentTypes.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setPaymentType(id)}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    paymentType === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>

            <Button className="w-full rounded-2xl h-12 text-base font-black shadow-lg shadow-primary/25 mt-1 transition-transform active:scale-[0.98]" size="lg" onClick={handleCheckout}>
              تأكيد الطلب
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
