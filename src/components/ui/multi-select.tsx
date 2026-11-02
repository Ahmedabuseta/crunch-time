import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
  value: string
  label: string
  sub?: string
}

interface MultiSelectProps {
  values: string[]
  onChange: (values: string[]) => void
  options: MultiSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
}

export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = 'اختار…',
  searchPlaceholder = 'ابحث…',
  emptyText = 'لا توجد نتائج',
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean; maxH: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) { setPos(null); return }
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 10
    const above = r.top - 10
    const up = below < Math.min(260, above) && above >= 8
    const maxH = Math.min(320, Math.max(0, up ? above : below))
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 240), up, maxH })
  }, [open])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || portalRef.current?.contains(target)) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const closeOnScroll = (e: Event) => {
      const target = e.target as Node
      if (portalRef.current?.contains(target) || ref.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', closeOnScroll)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', closeOnScroll)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [])

  useEffect(() => { if (!open) setQuery('') }, [open])

  const selected = useMemo(
    () => values.map((value) => options.find((option) => option.value === value)).filter(Boolean) as MultiSelectOption[],
    [values, options],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((option) => `${option.label} ${option.sub ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value])
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full min-h-[42px] flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-secondary text-sm border-0',
          'focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer hover:bg-secondary/80 transition-colors',
          selected.length === 0 && 'text-muted-foreground',
        )}
      >
        <span className="flex flex-wrap items-center gap-1 min-w-0">
          {selected.length === 0 && <span className="truncate">{placeholder}</span>}
          {selected.slice(0, 2).map((option) => (
            <span key={option.value} className="inline-flex items-center gap-1 max-w-[130px] rounded-lg bg-background/60 px-1.5 py-0.5 text-[11px] font-bold">
              <span className="truncate">{option.label}</span>
            </span>
          ))}
          {selected.length > 2 && (
            <span className="rounded-lg bg-primary/10 text-primary px-1.5 py-0.5 text-[11px] font-bold">+{selected.length - 2}</span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="absolute left-9 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 cursor-pointer"
          title="مسح الاختيار"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && pos && createPortal(
        <div
          ref={portalRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 130 }}
          className={cn('bg-card border-2 rounded-2xl shadow-2xl overflow-hidden', pos.up ? '-translate-y-full' : 'animate-slide-up')}
        >
          <div className="p-2 pt-2.5">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pr-8 pl-3 py-2.5 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>
          <div style={{ maxHeight: pos.maxH }} className="overflow-y-auto px-2 pb-2 space-y-0.5">
            {filtered.length === 0 && (
              <p className="text-center text-[11px] text-muted-foreground py-6">{emptyText}</p>
            )}
            {filtered.map((option) => {
              const checked = values.includes(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); toggle(option.value) }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer hover:bg-secondary',
                    checked && 'bg-primary/10 ring-1 ring-primary/40',
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0 text-right">
                    <span className="truncate font-medium">{option.label}</span>
                    {option.sub && <span className="shrink-0 text-[10px] text-muted-foreground">{option.sub}</span>}
                  </span>
                  <span className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                    checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border',
                  )}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
