import type { CartItem as CartItemType } from '@/services/cart/cart.types'
import { useCartStore } from '@/services/cart/cart.store'
import { Minus, Plus, Trash2, StickyNote, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'

interface CartItemProps {
  item: CartItemType
}

export function CartItem({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const updateAddonQty = useCartStore((s) => s.updateAddonQty)
  const setItemNote = useCartStore((s) => s.setItemNote)
  const [noteOpen, setNoteOpen] = useState(!!item.note)

  const addonTotal = item.addons.reduce((s, a) => s + a.price * (a.qty || 1), 0)
  const modifierTotal = item.modifiers.reduce((s, m) => s + m.priceAdjustment, 0)
  const unitTotal = item.product.price + addonTotal + modifierTotal
  const lineTotal = unitTotal * item.quantity

  return (
    <div className="py-2 border-b border-border/40 last:border-0 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-2xl leading-none shrink-0 w-8 text-center">{item.product.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black leading-snug break-words">
            {item.product.name}
            {item.modifiers.length > 0 && (
              <span className="text-primary"> ({item.modifiers.map((m) => m.modifierName).join('، ')})</span>
            )}
          </p>
          <p className="text-sm font-black text-primary leading-tight">{lineTotal} <span className="text-[10px] font-medium text-muted-foreground">ج.م</span></p>
        </div>
        <div className="flex items-center bg-secondary rounded-full p-0.5 shrink-0">
          <button onClick={() => updateQuantity(item.lineId, item.quantity - 1)} className="flex items-center justify-center h-9 w-9 rounded-full hover:bg-accent cursor-pointer transition-colors">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center text-sm font-black">{item.quantity}</span>
          <button onClick={() => updateQuantity(item.lineId, item.quantity + 1)} className="flex items-center justify-center h-9 w-9 rounded-full hover:bg-accent cursor-pointer transition-colors">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button onClick={() => setNoteOpen((v) => !v)} title="ملاحظة للصنف"
          className={cn("flex items-center justify-center h-9 w-9 rounded-lg cursor-pointer transition-colors shrink-0",
            item.note || noteOpen ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground hover:text-foreground hover:bg-accent")}>
          <StickyNote className="h-4 w-4" />
        </button>
        <button onClick={() => removeItem(item.lineId)} className="flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-colors shrink-0">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {(noteOpen || item.note) && (
        <div className="mt-1.5 mr-10 animate-slide-up">
          <div className="relative">
            <StickyNote className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-400/70 pointer-events-none" />
            <input type="text" placeholder="ملاحظة للصنف… (بدون شطة، مستوي زيادة…)" value={item.note || ''}
              onChange={(e) => setItemNote(item.lineId, e.target.value)}
              className="w-full pr-9 pl-8 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs font-medium focus:ring-1 focus:ring-amber-500/40 focus:outline-none placeholder:text-muted-foreground" dir="rtl" />
            {item.note && (
              <button onClick={() => { setItemNote(item.lineId, ''); setNoteOpen(false) }}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {(item.addons.length > 0 || item.quantity > 1) && (
        <div className="mt-1.5 mr-10 space-y-1.5 text-xs rounded-xl bg-secondary/40 p-2">

          {item.addons.map((addon) => (
            <div key={addon.id} className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">↳</span>
              <span className="text-sm leading-none">{addon.emoji}</span>
              <span className="flex-1 font-medium break-words">{addon.name}</span>
              <div className="flex items-center bg-secondary/70 rounded-full p-0.5 shrink-0">
                <button onClick={() => updateAddonQty(item.lineId, addon.id, (addon.qty || 1) - 1)} className="flex items-center justify-center h-6 w-6 rounded-full hover:bg-accent cursor-pointer transition-colors">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center text-[11px] font-black">×{addon.qty || 1}</span>
                <button onClick={() => updateAddonQty(item.lineId, addon.id, (addon.qty || 1) + 1)} className="flex items-center justify-center h-6 w-6 rounded-full hover:bg-accent cursor-pointer transition-colors">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <span className="text-primary font-bold text-[11px] shrink-0">
                {fmtMoney(addon.price * (addon.qty || 1))} ج.م
                {item.quantity > 1 && <span className="text-muted-foreground font-medium"> ×{item.quantity}</span>}
              </span>
            </div>
          ))}

          {item.quantity > 1 && (
            <div className="flex items-center justify-between border-t border-border/40 pt-1">
              <span className="text-[11px] font-bold text-muted-foreground">سعر القطعة</span>
              <span className="font-black">{fmtMoney(unitTotal)} ج.م</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2 py-1.5">
            <span className="text-[11px] font-black text-muted-foreground">
              {item.quantity > 1 ? `الإجمالي ×${item.quantity}` : 'إجمالي الصنف'}
            </span>
            <span className="font-black text-primary text-sm">{fmtMoney(lineTotal)} ج.م</span>
          </div>
        </div>
      )}
    </div>
  )
}
