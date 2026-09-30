import { useEffect, useState } from 'react'
import type { Product } from '@/services/product/product.types'
import { useCartStore } from '@/services/cart/cart.store'
import { ModifierDialog } from './ModifierDialog'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'

interface ProductCardProps {
  product: Product
  index: number
}

interface ModifierGroup {
  id: string
  name: string
  type: string
  modifiers: { id: string; name: string; priceAdjustment: number }[]
}

export function ProductCard({ product, index }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem)
  const items = useCartStore((s) => s.items)
  const inCartQty = items.filter((i) => i.product.id === product.id).reduce((s, i) => s + i.quantity, 0)
  const [showModifiers, setShowModifiers] = useState(false)
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([])
  const [hasModifiers, setHasModifiers] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.modifier.listByProduct(product.id).then((groups: any) => {
      if (!cancelled) {
        const list = Array.isArray(groups) ? groups : []
        setModifierGroups(list)
        setHasModifiers(list.length > 0)
      }
    }).catch(() => { if (!cancelled) setHasModifiers(false) })
    return () => { cancelled = true }
  }, [product.id])

  const handleClick = async () => {
    try {
      const groups = await window.api.modifier.listByProduct(product.id)
      if (groups && groups.length > 0) {
        setModifierGroups(groups)
        setShowModifiers(true)
      } else {
        addItem(product)
      }
    } catch {
      addItem(product)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        style={{ animationDelay: `${index * 0.04}s` }}
        className={cn(
          "relative flex flex-col items-center gap-1.5 sm:gap-3 rounded-2xl border-2 bg-card p-2.5 sm:p-5 transition-all cursor-pointer group animate-scale-in min-w-0",
          "hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 active:scale-[0.96]",
          inCartQty > 0 && "border-primary/50 bg-primary/5 shadow-lg shadow-primary/15"
        )}
      >
        {inCartQty > 0 && (
          <span className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 flex h-6 min-w-6 sm:h-7 sm:min-w-7 items-center justify-center rounded-full bg-primary text-[11px] sm:text-xs font-black text-primary-foreground px-1.5 sm:px-2 animate-scale-in">
            {inCartQty}
          </span>
        )}
        {hasModifiers && (
          <span className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 rounded-full bg-secondary/80 text-[9px] sm:text-[10px] font-bold text-muted-foreground px-1.5 sm:px-2 py-0.5 sm:py-1">
            خيارات
          </span>
        )}
        <span className="text-3xl sm:text-5xl group-hover:scale-110 transition-transform duration-200">{product.emoji}</span>
        <div className="text-center space-y-0.5 min-w-0 w-full">
          <p className="text-[11px] sm:text-sm font-bold leading-tight truncate">{product.name}</p>
          <p className="text-[11px] text-muted-foreground hidden md:block truncate">{product.description}</p>
        </div>
        <span className="inline-flex items-center px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-secondary text-[11px] sm:text-sm font-black text-primary whitespace-nowrap">
          {fmtMoney(product.price)} <span className="text-[9px] sm:text-[10px] font-medium mr-1">ج.م</span>
        </span>
      </button>

      {showModifiers && (
        <ModifierDialog
          product={product}
          groups={modifierGroups}
          onClose={() => setShowModifiers(false)}
        />
      )}
    </>
  )
}
