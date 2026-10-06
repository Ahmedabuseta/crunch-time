import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  // When set, the dialog offers soft delete (default) vs permanent removal.
  allowHardDelete?: boolean
  hardDeleteDescription?: string
  onConfirm: (opts: { hard: boolean }) => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'حذف',
  cancelLabel = 'إلغاء',
  allowHardDelete = false,
  hardDeleteDescription,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [hard, setHard] = useState(false)

  useEffect(() => {
    if (open) setHard(false)
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        dir="rtl"
        className="bg-card border-2 rounded-3xl shadow-2xl w-[380px] max-w-[92vw] overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </span>
              <h3 className="font-black text-base">{title}</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={onCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {description && <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>}
          {allowHardDelete && (
            <button
              type="button"
              onClick={() => setHard((v) => !v)}
              className="w-full text-right rounded-2xl border-2 border-dashed border-destructive/40 hover:border-destructive/70 transition-colors px-4 py-3 space-y-1"
            >
              <span className="flex items-center gap-2 text-xs font-bold text-destructive">
                <span className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${hard ? 'bg-destructive' : 'bg-muted'}`}>
                  <span className={`h-3 w-3 rounded-full bg-card transition-transform ${hard ? '-translate-x-3' : 'translate-x-0'}`} />
                </span>
                حذف نهائي بدون رجعة
              </span>
              <span className="block text-[11px] text-muted-foreground leading-relaxed">
                {hardDeleteDescription || 'يحذف العنصر من قاعدة البيانات نهائياً. متاح للمدير فقط.'}
              </span>
            </button>
          )}
        </div>
        <div className="flex gap-2 p-5 pt-2">
          <Button variant="destructive" className="flex-1 rounded-2xl h-12 text-base font-black" onClick={() => onConfirm({ hard })}>
            {hard ? 'حذف نهائي' : confirmLabel}
          </Button>
          <Button variant="ghost" className="rounded-2xl h-12 px-5" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}