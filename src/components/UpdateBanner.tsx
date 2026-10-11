import { useEffect, useState } from 'react'
import { Download, RotateCcw, TriangleAlert, X } from 'lucide-react'
import type { UpdateStatus } from '@/ipc/renderer.d'

// Map the main process' state machine onto a banner state. Used on mount so a
// reloaded window repaints a download that is already running instead of
// showing nothing until the next updater event arrives.
function fromPhase(s: {
  phase?: string
  version?: string | null
  percent?: number
  transferred?: number
  total?: number
}): UpdateStatus | null {
  const version = s.version ?? undefined
  switch (s.phase) {
    case 'downloading':
      return { status: 'downloading', version, percent: s.percent ?? 0, transferred: s.transferred, total: s.total }
    case 'downloaded':
      return { status: 'downloaded', version }
    case 'stalled':
      return { status: 'stalled', version, transferred: s.transferred, total: s.total }
    case 'error':
      return { status: 'error', version }
    default:
      return null
  }
}

export function UpdateBanner() {
  const [state, setState] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Paint whatever is already happening (e.g. after Ctrl+R during a download).
    window.updater?.state?.().then((res) => {
      if (cancelled || !res?.ok) return
      const s = fromPhase(res)
      if (s) setState(s)
    }).catch(() => {})

    if (!window.updater?.onStatus) return
    const off = window.updater.onStatus((s) => {
      // Problems are never dismissable-into-hiding: the user must be able to
      // see that a download failed and retry it.
      if (s.status === 'available' || s.status === 'downloading' || s.status === 'downloaded'
        || s.status === 'stalled' || s.status === 'error') {
        setDismissed(false)
      }
      setState(s)
    })
    return () => {
      cancelled = true
      off?.()
    }
  }, [])

  if (!state || dismissed) return null
  if (state.status === 'checking' || state.status === 'up-to-date') return null

  if (state.status === 'stalled' || state.status === 'error') {
    const stalled = state.status === 'stalled'
    const mb = (n?: number) => (n && n > 0 ? (n / 1048576).toFixed(1) : null)
    const got = stalled ? mb(state.transferred) : null
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-destructive/15 border-b border-destructive/30 shrink-0" dir="rtl">
        <p className="text-xs font-bold text-destructive flex items-center gap-2">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {stalled
            ? `تعذّر تحميل التحديث${state.version ? ` v${state.version}` : ''} — لم تصل أي بيانات${got ? ` (${got} م.ب)` : ''}`
            : `تعذّر التحديث${state.version ? ` v${state.version}` : ''} — ${state.message || 'خطأ غير معروف'}`}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { setDismissed(true); window.updater?.check() }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive text-white text-xs font-black cursor-pointer hover:bg-destructive/80 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </button>
          <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground cursor-pointer p-1" title="لاحقاً">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

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
    const mb = (n?: number) => (n && n > 0 ? (n / 1048576).toFixed(1) : null)
    const transferred = mb(state.transferred)
    const total = mb(state.total)
    const speed = state.bytesPerSecond ? `${(state.bytesPerSecond / 1048576).toFixed(1)} م.ب/ث` : null
    const starting = pct === 0 && transferred == null
    return (
      <div className="px-4 py-2.5 bg-primary/10 border-b border-primary/20 shrink-0" dir="rtl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold text-primary flex items-center gap-2">
            <Download className="h-4 w-4 animate-bounce" />
            {starting
              ? <>جارٍ بدء تحميل التحديث{state.version ? ` v${state.version}` : ''}…</>
              : <>جارٍ تحميل التحديث{state.version ? ` v${state.version}` : ''}…</>}
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
