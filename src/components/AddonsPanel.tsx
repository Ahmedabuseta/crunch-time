import { useEffect, useState } from 'react'
import type { Addon } from '@/services/addon/addon.types'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'

interface AddonsPanelProps {
  onAddAddon: (addon: Addon) => void
  cartItems?: { lineId: string; productId: string; label: string }[]
  targetId?: string | null
  onTargetChange?: (id: string) => void
}

export function AddonsPanel({ onAddAddon, cartItems = [], targetId, onTargetChange }: AddonsPanelProps) {
  const noCart = cartItems.length === 0
  const activeLine = cartItems.find(i => i.lineId === targetId) || cartItems[cartItems.length - 1] || null
  const activeTarget = activeLine?.lineId || null
  const activeProductId = activeLine?.productId || null
  const [availableAddons, setAvailableAddons] = useState<Addon[]>([])

  useEffect(() => {
    let cancelled = false
    if (!activeProductId) { setAvailableAddons([]); return }
    window.api.addon.listByProduct(activeProductId).then((list) => {
      if (!cancelled) setAvailableAddons((list || []) as Addon[])
    })
    return () => { cancelled = true }
  }, [activeProductId])

  return (
    <div className="border-t bg-secondary/20 pb-3 sm:pb-5 shrink-0">
      <div className="px-3 sm:px-5 py-2 sm:py-3 flex items-center gap-2">
        <div className={cn("w-2 h-2 rounded-full animate-pulse", noCart ? "bg-muted-foreground/50" : "bg-primary")} />
        <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wider">إضافات</h3>
      </div>

      {noCart ? (
        <p className="px-3 sm:px-5 text-[11px] text-muted-foreground">أضِف منتجًا للسلة أولًا ثم اربط الإضافات بمنتج</p>
      ) : (
        <>
          <div className="px-3 sm:px-5 mb-2 sm:mb-3 flex gap-2 overflow-x-auto pb-1">
            {cartItems.map((item) => (
              <button
                key={item.lineId}
                onClick={() => onTargetChange?.(item.lineId)}
                className={cn(
                  "shrink-0 px-4 py-2.5 min-h-[44px] rounded-full text-sm font-bold border-2 transition-all cursor-pointer",
                  activeTarget === item.lineId
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {availableAddons.length === 0 ? (
            <p className="px-3 sm:px-5 text-[11px] text-muted-foreground">لا توجد إضافات مرتبطة بهذا المنتج</p>
          ) : (
            <div className="flex gap-2 sm:gap-3 overflow-x-auto px-3 sm:px-5 pb-1">
              {availableAddons.map((addon) => (
                <button
                  key={addon.id}
                  onClick={() => onAddAddon(addon)}
                  className={cn(
                    "shrink-0 flex flex-col items-center gap-1.5 px-5 py-3.5 rounded-2xl",
                    "bg-card border-2 text-sm font-medium transition-all",
                    "hover:border-primary/40 hover:bg-primary/5 hover:scale-105 active:scale-95 cursor-pointer"
                  )}
                >
                  <span className="text-2xl">{addon.emoji}</span>
                  <span className="text-xs font-bold">{addon.name}</span>
                  <span className="text-primary font-black text-xs bg-primary/10 px-2.5 py-0.5 rounded-full">
                    +{fmtMoney(addon.price)} ج.م
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}