import { create } from 'zustand'
import { useEffect } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'default' | 'success' | 'error' | 'warning'

interface ToastItem {
  id: number
  title: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

interface ToastStore {
  toasts: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>) => void
  dismiss: (id: number) => void
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.duration ?? 3500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export function toast(opts: Omit<ToastItem, 'id'>) {
  useToastStore.getState().push(opts)
}

const ICONS: Record<ToastVariant, { el: typeof Info; className: string }> = {
  success: { el: CheckCircle2, className: 'text-green-500' },
  error: { el: AlertCircle, className: 'text-destructive' },
  warning: { el: AlertTriangle, className: 'text-amber-500' },
  default: { el: Info, className: 'text-primary' },
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const variant = item.variant ?? 'default'
  const Icon = ICONS[variant].el

  useEffect(() => {
    const t = setTimeout(onClose, item.duration ?? 3500)
    return () => clearTimeout(t)
  }, [item.id])

  return (
    <div className={cn(
      "pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 shadow-lg shadow-black/10",
      "animate-slide-up cursor-pointer",
      variant === 'success' ? "border-green-500/30" :
      variant === 'error' ? "border-destructive/30" :
      variant === 'warning' ? "border-amber-500/30" : "border-border"
    )} onClick={onClose}>
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", ICONS[variant].className)} />
      <div className="min-w-0">
        <p className="text-xs font-bold leading-tight">{item.title}</p>
        {item.description && <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{item.description}</p>}
      </div>
    </div>
  )
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="fixed top-4 inset-x-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => <ToastCard key={t.id} item={t} onClose={() => dismiss(t.id)} />)}
    </div>
  )
}