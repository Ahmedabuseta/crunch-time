import { LayoutGrid, Table } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViewMode = 'cards' | 'table'

interface ViewToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const button = (mode: ViewMode, Icon: typeof LayoutGrid, label: string) => (
    <button
      onClick={() => onChange(mode)}
      title={label}
      className={cn(
        "h-10 w-10 rounded-xl flex items-center justify-center cursor-pointer transition-all shrink-0",
        value === mode ? "bg-primary text-primary-foreground shadow" : "bg-secondary text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {button('cards', LayoutGrid, 'عرض البطاقات')}
      {button('table', Table, 'عرض الجدول')}
    </div>
  )
}