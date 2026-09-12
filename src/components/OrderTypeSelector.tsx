import { useCartStore } from '@/services/cart/cart.store'
import { cn } from '@/lib/utils'
import { Truck, UtensilsCrossed, MapPin, Phone, User } from 'lucide-react'

export function OrderTypeSelector() {
  const orderType = useCartStore((s) => s.orderType)
  const setOrderType = useCartStore((s) => s.setOrderType)
  const tableNumber = useCartStore((s) => s.tableNumber)
  const setTableNumber = useCartStore((s) => s.setTableNumber)
  const deliveryAddress = useCartStore((s) => s.deliveryAddress)
  const setDeliveryAddress = useCartStore((s) => s.setDeliveryAddress)
  const deliveryPhone = useCartStore((s) => s.deliveryPhone)
  const setDeliveryPhone = useCartStore((s) => s.setDeliveryPhone)
  const customerName = useCartStore((s) => s.customerName)
  const setCustomerName = useCartStore((s) => s.setCustomerName)

  const types = [
    { id: 'delivery' as const, label: 'توصيل', icon: Truck },
    { id: 'dine-in' as const, label: 'صالة', icon: UtensilsCrossed },
  ]

  return (
    <div className="space-y-3">
      <div className="flex gap-2 bg-secondary/60 p-1.5 rounded-2xl">
        {types.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setOrderType(id)}
            className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer",
              orderType === id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {orderType === 'dine-in' && (
        <div className="animate-slide-up">
          <input type="text" placeholder="رقم الطاولة" value={tableNumber} onChange={e => setTableNumber(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl bg-secondary/60 text-sm font-medium border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none placeholder:text-muted-foreground" dir="rtl" />
        </div>
      )}

      {orderType === 'delivery' && (
        <div className="space-y-2 animate-slide-up">
          <div className="relative">
            <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="اسم العميل" value={customerName} onChange={e => setCustomerName(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-secondary/60 text-sm font-medium border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none placeholder:text-muted-foreground" dir="rtl" />
          </div>
          <div className="relative">
            <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="tel" placeholder="رقم التليفون" value={deliveryPhone} onChange={e => setDeliveryPhone(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-secondary/60 text-sm font-medium border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none placeholder:text-muted-foreground" dir="rtl" />
          </div>
          <div className="relative">
            <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="العنوان" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-secondary/60 text-sm font-medium border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none placeholder:text-muted-foreground" dir="rtl" />
          </div>
        </div>
      )}
    </div>
  )
}
