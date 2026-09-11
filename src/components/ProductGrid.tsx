import { useProductStore } from '@/services/product/product.store'
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
  const items = useCartStore((s) => s.items)
  const addAddon = useCartStore((s) => s.addAddon)

  const filtered = category
    ? products.filter((p) => p.categoryId === category)
    : products

  const handleAddAddon = (addon: Addon) => {
    if (items.length > 0) {
      const lastItem = items[items.length - 1]
      addAddon(lastItem.product.id, addon)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-5">
        <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((product, i) => (
            <ProductCard key={product.id} product={product} index={i} />
          ))}
        </div>
      </ScrollArea>
      <AddonsPanel onAddAddon={handleAddAddon} />
    </div>
  )
}
