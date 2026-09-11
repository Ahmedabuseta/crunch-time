import type { CartItem as CartItemType } from '@/services/cart/cart.types'
import { useCartStore } from '@/services/cart/cart.store'
import { Button } from '@/components/ui/button'
import { Minus, Plus, Trash2, X } from 'lucide-react'

interface CartItemProps {
  item: CartItemType
}

export function CartItem({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const removeAddon = useCartStore((s) => s.removeAddon)

  const addonTotal = item.addons.reduce((s, a) => s + a.price, 0)
  const modifierTotal = item.modifiers.reduce((s, m) => s + m.priceAdjustment, 0)
  const lineTotal = (item.product.price + addonTotal + modifierTotal) * item.quantity

  return (
    <div className="py-3 border-b border-border/40 last:border-0 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-secondary/80 flex items-center justify-center shrink-0">
          <span className="text-xl">{item.product.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">{item.product.name}</p>
          <p className="text-[10px] text-muted-foreground">{item.product.price} ج.م/وحدة</p>
        </div>
        <div className="flex items-center bg-secondary rounded-full">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-7 text-center text-sm font-black">{item.quantity}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="text-left w-16">
          <p className="text-sm font-black">{lineTotal} <span className="text-[9px] text-muted-foreground font-medium">ج.م</span></p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg shrink-0" onClick={() => removeItem(item.product.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Modifiers */}
      {item.modifiers.length > 0 && (
        <div className="mr-13 mt-2 flex flex-wrap gap-1.5">
          {item.modifiers.map((m, i) => (
            <span key={i} className="text-[10px] bg-blue-500/10 text-blue-400 rounded-full px-2 py-0.5 font-bold">
              {m.modifierName} {m.priceAdjustment > 0 && `+${m.priceAdjustment}`}
            </span>
          ))}
        </div>
      )}

      {/* Addons */}
      {item.addons.length > 0 && (
        <div className="mr-13 mt-2 grid grid-cols-2 gap-1.5">
          {item.addons.map((addon: any) => (
            <div key={addon._uid || addon.id} className="flex items-center gap-1.5 text-[11px] bg-secondary/70 rounded-xl px-2.5 py-1.5 font-medium group">
              <span className="text-sm">{addon.emoji}</span>
              <span className="flex-1 truncate">{addon.name}</span>
              <span className="text-primary font-bold text-[10px]">+{addon.price}</span>
              <button onClick={() => removeAddon(item.product.id, addon._uid || addon.id)} className="hover:text-destructive cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
