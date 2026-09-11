import type { Product } from '@/services/product/product.types'
import { useCartStore } from '@/services/cart/cart.store'
import { cn } from '@/lib/utils'

interface ProductCardProps {
  product: Product
  index: number
}

export function ProductCard({ product, index }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem)
  const items = useCartStore((s) => s.items)
  const inCart = items.find((i) => i.product.id === product.id)

  return (
    <button
      onClick={() => addItem(product)}
      style={{ animationDelay: `${index * 0.04}s` }}
      className={cn(
        "relative flex flex-col items-center gap-3 rounded-2xl border-2 bg-card p-5 transition-all cursor-pointer group animate-scale-in",
        "hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 active:scale-[0.96]",
        inCart && "border-primary/50 bg-primary/5 shadow-lg shadow-primary/15"
      )}
    >
      {inCart && (
        <span className="absolute top-2.5 left-2.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground px-2 animate-scale-in">
          {inCart.quantity}
        </span>
      )}
      <span className="text-5xl group-hover:scale-110 transition-transform duration-200">{product.emoji}</span>
      <div className="text-center space-y-0.5">
        <p className="text-sm font-bold leading-tight">{product.name}</p>
        <p className="text-[11px] text-muted-foreground">{product.description}</p>
      </div>
      <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-secondary text-sm font-black text-primary">
        {product.price} <span className="text-[10px] font-medium mr-1">ج.م</span>
      </span>
    </button>
  )
}
