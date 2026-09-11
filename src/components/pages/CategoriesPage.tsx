import { useEffect } from 'react'
import { useCategoryStore } from '@/services/category/category.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react'

export function CategoriesPage() {
  const categories = useCategoryStore((s) => s.categories)
  const fetch = useCategoryStore((s) => s.fetch)
  const remove = useCategoryStore((s) => s.remove)

  useEffect(() => { fetch() }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">الأقسام</h2>
        <Button size="sm" className="gap-1.5 rounded-xl"><Plus className="h-4 w-4" /> إضافة قسم</Button>
      </div>
      <div className="flex-1 p-5 space-y-2">
        {categories.map((cat, i) => (
          <div key={cat.id} className="flex items-center gap-3 border-2 rounded-xl bg-card p-3">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl">{cat.emoji}</span>
            <span className="flex-1 font-bold text-sm">{cat.name}</span>
            <span className="text-xs text-muted-foreground">ترتيب: {i + 1}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg"><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => remove(cat.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </div>
  )
}
