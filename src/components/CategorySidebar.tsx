import { useMemo } from 'react'
import { useCategoryStore } from '@/services/category/category.store'
import { cn } from '@/lib/utils'
import { categoryBg } from '@/lib/category-bg'
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
            "relative overflow-hidden flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[48px] transition-all cursor-pointer shrink-0 md:w-full md:flex-col md:py-4 animate-scale-in",
            selected === null
              ? "font-black shadow-lg shadow-primary/25 ring-2 ring-primary"
              : "font-bold ring-1 ring-transparent hover:ring-border hover:scale-[1.02]"
          )}
        >
          <img
            src={categoryBg('all')}
            alt=""
            aria-hidden
            className={cn(
              "absolute inset-0 h-full w-full object-cover scale-110 blur-[3px] transition-all duration-300",
              selected === null ? "brightness-90 saturate-100" : "brightness-[0.65] saturate-[0.85]"
            )}
          />
          <span className="absolute inset-0 bg-black/35" />
          <span className="relative flex items-center gap-1.5">
            <Emoji className="text-xl sm:text-2xl md:text-3xl">📋</Emoji>
            <span className="whitespace-nowrap text-sm md:text-base text-white max-[420px]:hidden">الكل</span>
          </span>
        </button>
        {sortedCategories.map((cat, idx) => {
          const bg = categoryBg(cat.id)
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              style={{ animationDelay: `${idx * 0.03}s` }}
              className={cn(
                "relative overflow-hidden flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[48px] transition-all cursor-pointer shrink-0 md:w-full md:flex-col md:py-4 animate-scale-in",
                selected === cat.id
                  ? "font-black shadow-lg shadow-primary/25 ring-2 ring-primary"
                  : "font-bold ring-1 ring-transparent hover:ring-border hover:scale-[1.02]"
              )}
            >
              {bg && (
                <>
                  <img
                    src={bg}
                    alt=""
                    aria-hidden
                    loading={idx > 4 ? 'lazy' : undefined}
                    className="absolute inset-0 h-full w-full object-cover scale-110 blur-[3px] brightness-[0.65] saturate-[0.85] transition-all duration-300"
                  />
                  <span className="absolute inset-0 bg-black/35" />
                </>
              )}
              <span className="relative flex items-center gap-1.5">
                <Emoji className="text-xl sm:text-2xl md:text-3xl">{cat.emoji}</Emoji>
                <span className={cn("whitespace-nowrap text-sm md:text-base max-[420px]:hidden", bg ? "text-white" : "text-foreground")}>{cat.name}</span>
              </span>
            </button>
          )
        })}
      </div>
      <div className="p-3 max-md:hidden">
        <div className="rounded-xl bg-secondary/40 p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground font-medium">v1.0 MVP</p>
        </div>
      </div>
    </div>
  )
}
