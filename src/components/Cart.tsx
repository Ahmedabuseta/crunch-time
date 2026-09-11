import { useCartStore } from '@/store/cart'
import { useOrdersStore } from '@/store/orders'
import { CartItem } from './CartItem'
import { OrderTypeSelector } from './OrderTypeSelector'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShoppingCart, Trash2, CheckCircle } from 'lucide-react'
import { useState } from 'react'

export function Cart() {
  const items = useCartStore((s) => s.items)
  const subtotal = useCartStore((s) => s.subtotal)
  const itemCount = useCartStore((s) => s.itemCount)
  const clearCart = useCartStore((s) => s.clearCart)
  const orderType = useCartStore((s) => s.orderType)
  const tableNumber = useCartStore((s) => s.tableNumber)
  const deliveryAddress = useCartStore((s) => s.deliveryAddress)
  const deliveryPhone = useCartStore((s) => s.deliveryPhone)
  const addOrder = useOrdersStore((s) => s.addOrder)

  const [submitted, setSubmitted] = useState(false)

  const tax = subtotal() * 0.14
  const deliveryFee = orderType === 'delivery' ? 25 : 0
  const total = subtotal() + tax + deliveryFee

  const handleCheckout = () => {
    addOrder(items, total, orderType, tableNumber, deliveryAddress, deliveryPhone)
    setSubmitted(true)
    setTimeout(() => {
      clearCart()
      setSubmitted(false)
    }, 1200)
  }

  // Success flash
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle className="h-10 w-10 text-green-500" />
        </div>
        <p className="text-lg font-black">تم الطلب!</p>
        <p className="text-sm text-muted-foreground">جاري التحضير...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShoppingCart className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-black text-sm">الطلب</h2>
          {items.length > 0 && (
            <span className="text-[10px] text-muted-foreground bg-secondary rounded-full px-2 py-0.5 font-bold">
              {itemCount()} أصناف
            </span>
          )}
        </div>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
            onClick={clearCart}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Order Type */}
      <div className="px-4 pb-3">
        <OrderTypeSelector />
      </div>

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
            {items.map((item) => (
              <CartItem key={item.product.id} item={item} />
            ))}
          </ScrollArea>

          {/* Totals */}
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
            <Button
              className="w-full rounded-2xl h-12 text-base font-black shadow-lg shadow-primary/25 mt-1 transition-transform active:scale-[0.98]"
              size="lg"
              onClick={handleCheckout}
            >
              تأكيد الطلب
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
