import { useState, useRef, useEffect } from 'react'
import { Calendar as CalendarIcon, ChevronRight, ChevronLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const AR_DAYS = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']

const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function parseValue(value: string): { y: number; m: number } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m] = value.split('-').map(Number)
    if (y > 1900 && y < 2100 && m >= 1 && m <= 12) return { y, m: m - 1 }
  }
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() }
}

export function DatePicker({ value, onChange, placeholder = 'اختر التاريخ', className }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const parsed = parseValue(value)
  const [viewY, setViewY] = useState(parsed.y)
  const [viewM, setViewM] = useState(parsed.m)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      const p = parseValue(value)
      setViewY(p.y); setViewM(p.m)
    }
  }, [open, value])

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open ])

  const firstDow = new Date(viewY, viewM, 1).getDay()
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate()
  // Saturday-first (Egyptian week): Sat=0 ... Fri=6
  const offset = (firstDow + 1) % 7

  const prevMonth = () => {
    if (viewM === 0) { setViewM(11); setViewY(viewY - 1) }
    else setViewM(viewM - 1)
  }
  const nextMonth = () => {
    if (viewM === 11) { setViewM(0); setViewY(viewY + 1) }
    else setViewM(viewM + 1)
  }
  const goToday = () => {
    const now = new Date()
    onChange(toISO(now.getFullYear(), now.getMonth(), now.getDate()))
    setOpen(false)
  }

  const display = value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + 'T00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full h-11 flex items-center gap-2 px-3 rounded-xl bg-secondary text-sm font-bold border border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors hover:bg-secondary/80"
      >
        <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className={cn("flex-1 text-right truncate", display ? "text-foreground" : "text-muted-foreground font-medium")}>
          {display || placeholder}
        </span>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange('') } }}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 z-50 w-[300px] bg-card border-2 border-border rounded-2xl shadow-2xl p-4 animate-scale-in" dir="rtl">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-secondary cursor-pointer transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="text-sm font-black">{AR_MONTHS[viewM]} {viewY}</span>
            <button type="button" onClick={nextMonth} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-secondary cursor-pointer transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {AR_DAYS.map((d, i) => (
              <span key={i} className="h-8 flex items-center justify-center text-[11px] font-bold text-muted-foreground">{d}</span>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: offset }).map((_, i) => (
              <span key={`e-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const iso = toISO(viewY, viewM, day)
              const selected = value === iso
              const today = toISO(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) === iso
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => { onChange(iso); setOpen(false) }}
                  className={cn(
                    "h-11 rounded-xl text-sm font-bold cursor-pointer transition-all active:scale-95",
                    selected
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                      : today
                        ? "bg-primary/10 text-primary hover:bg-primary/20"
                        : "hover:bg-secondary text-foreground"
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <button
            type="button"
            onClick={goToday}
            className="w-full mt-3 h-10 rounded-xl bg-secondary text-xs font-bold hover:bg-secondary/70 cursor-pointer transition-colors"
          >
            اليوم
          </button>
        </div>
      )}
    </div>
  )
}
