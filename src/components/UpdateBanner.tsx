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

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 shrink-0" dir="rtl">
      <p className="text-xs font-bold text-primary flex items-center gap-2">
        <Download className="h-4 w-4 animate-bounce" />
        {state.status === 'downloading'
          ? `جارٍ تحميل التحديث… ${state.percent ?? 0}%`
          : `يوجد تحديث جديد${state.version ? ` v${state.version}` : ''} — جارٍ التحميل في الخلفية…`}
      </p>
      {state.status === 'downloading' && (
        <div className="w-32 h-1.5 rounded-full bg-secondary overflow-hidden shrink-0">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${state.percent ?? 0}%` }} />
        </div>
      )}
    </div>
  )
}
