import { useCategoryStore } from '@/services/category/category.store'
import { cn } from '@/lib/utils'

interface CategorySidebarProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

export function CategorySidebar({ selected, onSelect }: CategorySidebarProps) {
  const categories = useCategoryStore((s) => s.categories)

  return (
    <div className="flex flex-col w-[170px] shrink-0 bg-card border-l">
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-sm font-black tracking-tight text-muted-foreground">الأقسام</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-3 space-y-2">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "w-full flex flex-col items-center gap-1.5 py-4 rounded-2xl text-xs transition-all cursor-pointer",
            selected === null
              ? "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25"
              : "bg-secondary/60 text-foreground hover:bg-secondary font-medium"
          )}
        >
          <span className="text-2xl">📋</span>
          <span>الكل</span>
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              "w-full flex flex-col items-center gap-1.5 py-4 rounded-2xl text-xs transition-all cursor-pointer",
              selected === cat.id
                ? "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25"
                : "bg-secondary/60 text-foreground hover:bg-secondary font-medium"
            )}
          >
            <span className="text-2xl">{cat.emoji}</span>
            <span>{cat.name}</span>
          </button>
        ))}
      </div>
      <div className="p-3">
        <div className="rounded-xl bg-secondary/40 p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground font-medium">v1.0 MVP</p>
        </div>
      </div>
    </div>
  )
}
