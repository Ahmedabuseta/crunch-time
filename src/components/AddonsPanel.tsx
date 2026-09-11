import { useAddonStore } from '@/services/addon/addon.store'
import type { Addon } from '@/services/addon/addon.types'
import { cn } from '@/lib/utils'

interface AddonsPanelProps {
  onAddAddon: (addon: Addon) => void
}

export function AddonsPanel({ onAddAddon }: AddonsPanelProps) {
  const addons = useAddonStore((s) => s.addons)

  return (
    <div className="border-t bg-secondary/20">
      <div className="px-5 py-3 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <h3 className="text-xs font-black text-muted-foreground uppercase tracking-wider">إضافات</h3>
      </div>
      <div className="flex gap-3 overflow-x-auto px-5 pb-5">
        {addons.map((addon) => (
          <button
            key={addon.id}
            onClick={() => onAddAddon(addon)}
            className={cn(
              "shrink-0 flex flex-col items-center gap-1.5 px-5 py-3.5 rounded-2xl",
              "bg-card border-2 text-sm font-medium transition-all",
              "hover:border-primary/40 hover:bg-primary/5 hover:scale-105 active:scale-95 cursor-pointer"
            )}
          >
            <span className="text-2xl">{addon.emoji}</span>
            <span className="text-xs font-bold">{addon.name}</span>
            <span className="text-primary font-black text-xs bg-primary/10 px-2.5 py-0.5 rounded-full">
              +{addon.price} ج.م
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
