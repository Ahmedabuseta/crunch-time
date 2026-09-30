import { cn } from '@/lib/utils'

export interface FilterChipOption {
  value: string | null
  label: string
  count: number
}

interface FilterChipsProps {
  options: FilterChipOption[]
  value: string | null
  onChange: (value: string | null) => void
  className?: string
}

export function FilterChips({ options, value, onChange, className }: FilterChipsProps) {
  return (
    <div className={cn("flex gap-1.5 overflow-x-auto", className)}>
      {options.map((opt) => (
        <button
          key={opt.value ?? '__all__'}
          onClick={() => onChange(opt.value)}
          className={cn(
            "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all",
            value === opt.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label} ({opt.count})
        </button>
      ))}
    </div>
  )
}