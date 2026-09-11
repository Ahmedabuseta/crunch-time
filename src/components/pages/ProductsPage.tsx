import { useEffect } from 'react'
import { useProductStore } from '@/services/product/product.store'
import { useCategoryStore } from '@/services/category/category.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Pencil, Trash2 } from 'lucide-react'

export function ProductsPage() {
  const products = useProductStore((s) => s.products)
  const fetchProducts = useProductStore((s) => s.fetch)
  const removeProduct = useProductStore((s) => s.remove)
  const categories = useCategoryStore((s) => s.categories)
  const fetchCategories = useCategoryStore((s) => s.fetch)

  useEffect(() => { fetchProducts(); fetchCategories() }, [])

  const catMap = new Map(categories.map(c => [c.id, c]))

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">المنتجات</h2>
        <Button size="sm" className="gap-1.5 rounded-xl">
          <Plus className="h-4 w-4" /> إضافة منتج
        </Button>
      </div>
      <ScrollArea className="flex-1 p-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map(p => (
            <div key={p.id} className="border-2 rounded-2xl bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-3xl">{p.emoji}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg"><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => removeProduct(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <p className="font-bold text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs bg-secondary rounded-full px-2 py-0.5">{catMap.get(p.categoryId)?.name}</span>
                <span className="font-black text-primary">{p.price} ج.م</span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
