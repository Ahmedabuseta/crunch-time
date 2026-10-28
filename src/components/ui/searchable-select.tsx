import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Search, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SearchableOption {
  value: string
  label: string
  sub?: string
  disabled?: boolean
}

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  placeholder?: string
  emptyText?: string
  searchPlaceholder?: string
  className?: string
}

interface DropdownPos {
  top: number
  left: number
  width: number
  up: boolean
  maxH: number
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'اختر…',
  emptyText = 'لا توجد نتائج',
  searchPlaceholder = 'ابحث…',
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<DropdownPos | null>(null)
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
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 200), up, maxH })
  }, [open])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current && ref.current.contains(t)) return
      if (portalRef.current && portalRef.current.contains(t)) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const closeOnScroll = (e: Event) => {
      const t = e.target as Node
      if (portalRef.current && portalRef.current.contains(t)) return
      if (ref.current && ref.current.contains(t)) return
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

  useEffect(() => { setQuery('') }, [open])

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(q))
      : options
    const enabled = list.filter((o) => !o.disabled)
    return enabled.length > 0 ? enabled : list
  }, [options, query])

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-secondary text-sm border-0",
          "focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer hover:bg-secondary/80 transition-colors",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && createPortal(
        <div
          ref={portalRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 130 }}
          className={cn(
            "bg-card border-2 rounded-2xl shadow-2xl overflow-hidden",
            pos.up ? "-translate-y-full" : "animate-slide-up"
          )}
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
              <p className="text-center text-[11px] text-muted-foreground py-6">{query.trim() ? emptyText : placeholder}</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={o.disabled}
                onMouseDown={(e) => { if (!o.disabled) { e.preventDefault(); onChange(o.value); setOpen(false) } }}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-3 rounded-xl text-sm transition-all cursor-pointer",
                  o.disabled
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-secondary",
                  value === o.value && "bg-primary/10 ring-1 ring-primary/40"
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">{o.label}</span>
                  {o.sub && <span className="shrink-0 text-[10px] text-muted-foreground">{o.sub}</span>}
                </span>
                {value === o.value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                {o.disabled && value !== o.value && (
                  <span className="shrink-0 text-[10px] font-bold text-muted-foreground/70">مستخدمة</span>
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}