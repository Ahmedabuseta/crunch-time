import { categories } from '@/data/products'
import { cn } from '@/lib/utils'

interface CategorySidebarProps {
  selected: string | null
  onSelect: (id: string | null) => void
}

export function CategorySidebar({ selected, onSelect }: CategorySidebarProps) {
  return (
    <div className="flex flex-col w-[170px] shrink-0 bg-card border-l">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-sm font-black tracking-tight text-muted-foreground">الأقسام</h2>
      </div>

      {/* Category List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-2">
        {/* All button */}
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

        {categories.map((cat, i) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            style={{
              '--cat-color': cat.color,
              animationDelay: `${i * 0.04}s`,
            } as React.CSSProperties}
            className={cn(
              "w-full flex flex-col items-center gap-1.5 py-4 rounded-2xl text-xs transition-all cursor-pointer animate-slide-up",
              selected === cat.id
                ? "font-bold shadow-lg"
                : "bg-secondary/60 text-foreground hover:bg-secondary font-medium"
            )}
          >
            <span className="text-2xl">{cat.emoji}</span>
            <span>{cat.name}</span>
            {selected === cat.id && (
              <div
                className="absolute inset-0 rounded-2xl opacity-15"
                style={{ backgroundColor: cat.color }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3">
        <div className="rounded-xl bg-secondary/40 p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground font-medium">v1.0 MVP</p>
        </div>
      </div>
    </div>
  )
}
