import { useState, useRef, useEffect } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useCartStore } from '@/services/cart/cart.store'
import { useCustomerStore } from '@/services/customer/customer.store'
import { useDeliveryStore, useProfileStore } from '@/services/delivery/delivery.store'
import { cn } from '@/lib/utils'
import { Truck, UtensilsCrossed, ShoppingBag, MapPin, Phone, User, Clock, StickyNote, Hash } from 'lucide-react'

export function OrderTypeSelector() {
  const orderType = useCartStore((s) => s.orderType)
  const setOrderType = useCartStore((s) => s.setOrderType)
  const deliveryAddress = useCartStore((s) => s.deliveryAddress)
  const setDeliveryAddress = useCartStore((s) => s.setDeliveryAddress)
  const deliveryPhone = useCartStore((s) => s.deliveryPhone)
  const setDeliveryPhone = useCartStore((s) => s.setDeliveryPhone)
  const customerName = useCartStore((s) => s.customerName)
  const setCustomerName = useCartStore((s) => s.setCustomerName)
  const deliveryZoneId = useCartStore((s) => s.deliveryZoneId)
  const setDeliveryZoneId = useCartStore((s) => s.setDeliveryZoneId)
  const deliveryNote = useCartStore((s) => s.deliveryNote)
  const setDeliveryNote = useCartStore((s) => s.setDeliveryNote)
  const deliveryProfileId = useCartStore((s) => s.deliveryProfileId)
  const setDeliveryProfileId = useCartStore((s) => s.setDeliveryProfileId)
  const setDeliveryProfileName = useCartStore((s) => s.setDeliveryProfileName)
  const tableNumber = useCartStore((s) => s.tableNumber)
  const setTableNumber = useCartStore((s) => s.setTableNumber)
  const zones = useDeliveryStore((s) => s.zones)
  const fetchZones = useDeliveryStore((s) => s.fetch)
  const profiles = useProfileStore((s) => s.profiles)
  const fetchProfiles = useProfileStore((s) => s.fetch)
  const suggestions = useCustomerStore((s) => s.suggestions)
  const searchCustomers = useCustomerStore((s) => s.search)
  const clearSuggestions = useCustomerStore((s) => s.clearSuggestions)

  const [showSuggestions, setShowSuggestions] = useState(false)
  const phoneRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchZones(); fetchProfiles() }, [])
  const activeZones = zones.filter((z) => z.active)
  const activeProfiles = profiles.filter((p) => p.active)
  const selectedZone = activeZones.find((z) => z.id === deliveryZoneId)

  const types = [
    { id: 'delivery' as const, label: 'توصيل', icon: Truck },
    { id: 'dine-in' as const, label: 'صالة', icon: UtensilsCrossed },
    { id: 'takeaway' as const, label: 'تيك أوي', icon: ShoppingBag },
  ]

  const handlePhoneChange = (value: string) => {
    setDeliveryPhone(value)
    if (value.replace(/\D/g, '').length >= 3) {
      searchCustomers(value)
      setShowSuggestions(true)
    } else {
      clearSuggestions()
      setShowSuggestions(false)
    }
  }

  const handleSelect = (phone: string, name: string | null, address: string | null) => {
    setDeliveryPhone(phone)
    if (name) setCustomerName(name)
    if (address) setDeliveryAddress(address)
    clearSuggestions()
    setShowSuggestions(false)
  }

  const inputCls = "w-full pr-9 pl-3 py-2 rounded-lg bg-secondary/60 text-sm font-medium border-0 focus:ring-1 focus:ring-primary/30 focus:outline-none placeholder:text-muted-foreground"
  const iconCls = "absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 bg-secondary/60 p-1 rounded-xl">
        {types.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setOrderType(id)}
            className={cn("flex-1 flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg text-xs font-bold transition-all cursor-pointer",
              orderType === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {orderType === 'delivery' && (
        <div className="space-y-1.5 animate-slide-up">
          {/* Delivery boy selector */}
          {activeProfiles.length > 0 && (
            <div className="relative">
              <User className={iconCls} />
              <Select value={deliveryProfileId} onValueChange={(id) => {
                setDeliveryProfileId(id)
                const p = activeProfiles.find(pr => pr.id === id)
                if (p) setDeliveryProfileName(p.name)
              }}>
                <SelectTrigger className={cn(inputCls, !deliveryProfileId && "text-muted-foreground")}>
                  <SelectValue placeholder="اختار الديلفري…" />
                </SelectTrigger>
                <SelectContent>
                  {activeProfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="relative">
            <User className={iconCls} />
            <input type="text" placeholder="اسم العميل" value={customerName} onChange={e => setCustomerName(e.target.value)} autoComplete="name"
              className={inputCls} dir="rtl" />
          </div>
          <div className="relative" ref={phoneRef}>
            <Phone className={iconCls} />
            <input type="tel" placeholder="رقم التليفون" value={deliveryPhone} onChange={e => handlePhoneChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
              autoComplete="tel" inputMode="tel"
              className={inputCls} dir="ltr" />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full mt-1 inset-x-0 bg-card border-2 rounded-xl shadow-lg z-50 overflow-hidden animate-slide-up">
                {suggestions.map(c => (
                  <button key={c.id} onPointerDown={(e) => { e.preventDefault(); handleSelect(c.phone, c.name, c.address) }}
                    className="w-full text-right px-3 py-3 min-h-[52px] hover:bg-secondary cursor-pointer transition-colors flex items-center gap-3 border-b border-border/30 last:border-0">
                    <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold" dir="ltr">{c.phone}</p>
                      {c.name && <p className="text-[11px] text-muted-foreground truncate">{c.name} · {c.address || ''}</p>}
                    </div>
                    {c.orderCount > 0 && (
                      <span className="text-[10px] font-bold text-muted-foreground bg-secondary rounded-full px-2 py-1 flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" />{c.orderCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <MapPin className={iconCls} />
            <input type="text" placeholder="العنوان" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} autoComplete="street-address"
              className={inputCls} dir="rtl" />
          </div>
          {activeZones.length > 0 && (
            <div className="relative">
              <Truck className={iconCls} />
              <Select value={deliveryZoneId} onValueChange={setDeliveryZoneId}>
                <SelectTrigger className={cn(inputCls, !deliveryZoneId && "text-muted-foreground")}>
                  <SelectValue placeholder="اختار المنطقة…" />
                </SelectTrigger>
                <SelectContent>
                  {activeZones.map(z => (
                    <SelectItem key={z.id} value={z.id}>{z.name} — {z.fee} ج.م</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {selectedZone && (
            <div className="flex items-center gap-2 text-[11px] font-bold text-blue-400 bg-blue-500/10 rounded-lg px-3 py-1.5">
              <Truck className="h-3.5 w-3.5 shrink-0" />
              <span>التوصيل لـ {selectedZone.name}: {selectedZone.fee} ج.م</span>
            </div>
          )}
          <div className="relative">
            <StickyNote className={iconCls} />
            <input type="text" placeholder="ملاحظة للدليفري… (الاتصال قبل الوصول، الدور الثالث…)" value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)}
              className={inputCls} dir="rtl" />
          </div>
        </div>
      )}

      {orderType === 'dine-in' && (
        <div className="animate-slide-up space-y-1.5">
          <div className="relative">
            <Hash className={iconCls} />
            <input type="text" inputMode="numeric" placeholder="رقم الترابيزة" value={tableNumber}
              onChange={e => setTableNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              className={inputCls} dir="ltr" />
          </div>
          <p className="text-[11px] text-muted-foreground text-center">يظهر رقم الترابيزة على الإيصال وتذكرة المطبخ</p>
        </div>
      )}

      {orderType === 'takeaway' && (
        <div className="animate-slide-up text-xs text-muted-foreground text-center py-2">
          طلب تيك أوي — يتجهز ويتاخد
        </div>
      )}
    </div>
  )
}