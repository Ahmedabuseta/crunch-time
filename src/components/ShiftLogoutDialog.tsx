import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ShiftLogoutDialogProps {
  open: boolean
  shiftNumber?: number
  onGoToShift: () => void
  onClose: () => void
}

export function ShiftLogoutDialog({ open, shiftNumber, onGoToShift, onClose }: ShiftLogoutDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        dir="rtl"
        className="bg-card border-2 rounded-3xl shadow-2xl w-[400px] max-w-[92vw] overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </span>
              <h3 className="font-black text-base">وردية مفتوحة</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {shiftNumber ? `الوردية رقم ${shiftNumber} لسه مفتوحة. ` : 'فيه وردية مفتوحة. '}
            لازم تقفل الوردية قبل تسجيل الخروج — عدّ الكاش وأقفلها من صفحة «ورديتي»، وبعدها سجّل الخروج.
          </p>
        </div>
        <div className="flex gap-2 p-5 pt-2">
          <Button className="flex-1 rounded-2xl h-12 font-black" onClick={onGoToShift}>
            الذهاب إلى ورديتي
          </Button>
          <Button variant="ghost" className="rounded-2xl h-12 px-5" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
