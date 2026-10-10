import { useEffect, useState } from 'react'
import { Download, RotateCcw, X } from 'lucide-react'
import type { UpdateStatus } from '@/ipc/renderer.d'

export function UpdateBanner() {
  const [state, setState] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.updater?.onStatus) return
    const off = window.updater.onStatus((s) => {
      if (s.status === 'available' || s.status === 'downloading' || s.status === 'downloaded') {
        setDismissed(false)
      }
      setState(s)
    })
    return off
  }, [])

  if (!state || dismissed) return null
  if (state.status === 'checking' || state.status === 'up-to-date' || state.status === 'error') return null

  if (state.status === 'downloaded') {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-green-500/15 border-b border-green-500/30 shrink-0" dir="rtl">
        <p className="text-xs font-bold text-green-400">
          ✅ التحديث {state.version ? `v${state.version} ` : ''}جاهز — أعد التشغيل للتثبيت
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => window.updater?.quitAndInstall()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500 text-white text-xs font-black cursor-pointer hover:bg-green-600 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            إعادة التشغيل والتثبيت
          </button>
          <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground cursor-pointer p-1" title="لاحقاً">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  if (state.status === 'downloading') {
    const pct = Math.min(100, Math.max(0, Math.round(state.percent ?? 0)))
    const mb = (n?: number) => (n ? (n / 1048576).toFixed(1) : null)
    const transferred = mb(state.transferred)
    const total = mb(state.total)
    const speed = state.bytesPerSecond ? `${(state.bytesPerSecond / 1048576).toFixed(1)} م.ب/ث` : null
    return (
      <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/20 shrink-0" dir="rtl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-primary flex items-center gap-2">
            <Download className="h-4 w-4 animate-bounce" />
            جارٍ تحميل التحديث{state.version ? ` v${state.version}` : ''}…
          </p>
          <p className="text-xs font-black text-primary tabular-nums" dir="ltr">{pct}%</p>
        </div>
        <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        {(transferred != null || speed) && (
          <p className="mt-1 text-[11px] font-medium text-muted-foreground" dir="ltr">
            {transferred != null && `${transferred} MB${total != null ? ` / ${total} MB` : ''}`}
            {speed ? ` — ${speed}` : ''}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 shrink-0" dir="rtl">
      <p className="text-xs font-bold text-primary flex items-center gap-2">
        <Download className="h-4 w-4 animate-bounce" />
        يوجد تحديث جديد{state.version ? ` v${state.version}` : ''} — جارٍ التحميل…
      </p>
    </div>
  )
}
