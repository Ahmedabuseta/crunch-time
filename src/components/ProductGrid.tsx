import { useEffect, useMemo, useState } from 'react'
import { useProductStore } from '@/services/product/product.store'
import { useCategoryStore } from '@/services/category/category.store'
import { useCartStore } from '@/services/cart/cart.store'
import type { Addon } from '@/services/addon/addon.types'
import { ProductCard } from './ProductCard'
import { AddonsPanel } from './AddonsPanel'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ProductGridProps {
  category: string | null
}

export function ProductGrid({ category }: ProductGridProps) {
  const products = useProductStore((s) => s.products)
  const categories = useCategoryStore((s) => s.categories)
  const items = useCartStore((s) => s.items)
  const addAddon = useCartStore((s) => s.addAddon)
  const [targetId, setTargetId] = useState<string | null>(null)

  const lastId = items.length ? items[items.length - 1].lineId : null

  useEffect(() => {
    if (!targetId || !items.some(i => i.lineId === targetId)) setTargetId(lastId)
  }, [targetId, items, lastId])

  const categoryOrderMap = useMemo(() => {
    const map = new Map<string, number>()
    const sorted = [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    sorted.forEach((c, idx) => map.set(c.id, c.sortOrder ?? (idx + 1)))
    return map
  }, [categories])

  const filtered = useMemo(() => {
    // The admin screen may keep hidden products in the shared store so they can
    // be re-enabled; the sale menu only ever shows what is visible.
    const active = products.filter((p) => p.active)
    if (category) {
      return active.filter((p) => p.categoryId === category)
    }
    return active.sort((a, b) => {
      const ordA = categoryOrderMap.get(a.categoryId) ?? 9999
      const ordB = categoryOrderMap.get(b.categoryId) ?? 9999
      return ordA - ordB
    })
  }, [products, category, categoryOrderMap])

  const handleAddAddon = (addon: Addon) => {
    const id = items.some(i => i.lineId === targetId) ? targetId : lastId
    if (id) addAddon(id, addon)
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-2 sm:p-4 lg:p-5">
        <div className="grid grid-cols-2 min-[420px]:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
          {filtered.map((product, i) => (
            <ProductCard key={product.id} product={product} index={i} />
          ))}
        </div>
      </ScrollArea>
      <AddonsPanel
        onAddAddon={handleAddAddon}
        cartItems={items.map(i => ({ lineId: i.lineId, productId: i.product.id, label: `${i.product.emoji} ${i.product.name} ×${i.quantity}` }))}
        targetId={targetId}
        onTargetChange={setTargetId}
      />
    </div>
  )
}
