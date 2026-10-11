import { useMemo } from 'react'
import { useCategoryStore } from '@/services/category/category.store'
import { cn } from '@/lib/utils'
import { Emoji } from '@/components/Emoji'

interface CategorySidebarProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

export function CategorySidebar({ selected, onSelect }: CategorySidebarProps) {
  const categories = useCategoryStore((s) => s.categories)
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [categories]
  )

  return (
    <div className="flex shrink-0 bg-card border-l max-md:w-full max-md:border-l-0 max-md:border-b md:flex-col md:w-[170px]">
      <div className="px-4 pt-5 pb-3 max-md:hidden">
        <h2 className="text-sm font-black tracking-tight text-muted-foreground">الأقسام</h2>
      </div>
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto p-1.5 sm:p-2 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-visible md:px-3 md:py-0 md:space-y-2">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[44px] rounded-2xl text-xs transition-all cursor-pointer shrink-0 md:w-full md:flex-col md:py-4",
            selected === null
              ? "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25"
              : "bg-secondary/60 text-foreground hover:bg-secondary font-medium"
          )}
        >
          <span className="text-lg sm:text-xl md:text-2xl">📋</span>
          <span className="max-[420px]:hidden">الكل</span>
        </button>
        {sortedCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[44px] rounded-2xl text-xs transition-all cursor-pointer shrink-0 md:w-full md:flex-col md:py-4",
              selected === cat.id
                ? "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25"
                : "bg-secondary/60 text-foreground hover:bg-secondary font-medium"
            )}
          >
            <Emoji className="text-lg sm:text-xl md:text-2xl">{cat.emoji}</Emoji>
            <span className="whitespace-nowrap max-[420px]:hidden">{cat.name}</span>
          </button>
        ))}
      </div>
      <div className="p-3 max-md:hidden">
        <div className="rounded-xl bg-secondary/40 p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground font-medium">v1.0 MVP</p>
        </div>
      </div>
    </div>
  )
}
