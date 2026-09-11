import { products } from '@/data/products'
import type { Addon } from '@/data/products'
import { ProductCard } from './ProductCard'
import { AddonsPanel } from './AddonsPanel'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCartStore } from '@/store/cart'

interface ProductGridProps {
  category: string | null
}

export function ProductGrid({ category }: ProductGridProps) {
  const items = useCartStore((s) => s.items)
  const addAddonToItem = useCartStore((s) => s.addAddonToItem)

  const filtered = category
    ? products.filter((p) => p.category === category)
    : products

  const handleAddAddon = (addon: Addon) => {
    if (items.length > 0) {
      const lastItem = items[items.length - 1]
      addAddonToItem(lastItem.product.id, addon)
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
