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
          "relative overflow-hidden flex min-h-full min-w-0 flex-col items-center gap-1 sm:gap-2.5 transition-all cursor-pointer animate-scale-in group",
          "border border-border backdrop-blur-3xl focus:outline-none",
          "hover:bg-foreground/10 hover:border-primary/40 hover:-translate-y-0.5 active:scale-[0.96]",
          inCartQty > 0 && "bg-background/70 border-primary shadow-lg shadow-primary/10"
        )}
      >
        {inCartQty > 0 && (
          <span className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 flex h-6 min-w-6 sm:h-7 sm:min-w-7 items-center justify-center rounded-full bg-primary text-[11px] sm:text-sm font-black text-primary-foreground px-1.5 sm:px-2 animate-scale-in z-20">
            {inCartQty}
          </span>
        )}
        {hasModifiers && (
          <span className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 rounded-full bg-secondary/80 text-[9px] sm:text-[10px] font-black px-1.5 sm:px-2 py-0.5 sm:py-1 z-20 whitespace-nowrap text-muted-foreground">
            خيارات
          </span>
        )}
        <span className="relative z-10 flex w-full min-w-0 flex-1 flex-col items-center justify-center space-y-0.5 text-center pt-3 sm:pt-4">
          <p className="w-full min-w-0 whitespace-normal break-words px-1 text-sm sm:text-lg font-black leading-snug text-foreground">
            {product.name}
          </p>
          {product.description && (
            <p className="hidden w-full min-w-0 whitespace-normal break-words text-[11px] leading-snug text-muted-foreground md:block">
              {product.description}
            </p>
          )}
        </span>
        <span className="relative z-10 inline-flex items-center text-sm sm:text-lg font-black text-foreground whitespace-nowrap mb-1.5 sm:mb-2">
          {fmtMoney(product.price)} <span className="text-[10px] sm:text-xs font-black mr-1">ج.م</span>
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
