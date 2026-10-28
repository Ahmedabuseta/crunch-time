import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Ban, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Emoji } from '@/components/Emoji'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'

const VOID_REASONS = [
  'العميل طلب الإلغاء',
  'خطأ في إدخال الطلب',
  'تأخير التوصيل',
  'مشكلة في جودة الطعام',
  'العميل لم يستلم',
  'دفع مكرر',
]

const paymentLabels: Record<string, string> = { cash: 'كاش', visa: 'فيزا' }

export function OrderVoidDialog({
  order,
  onClose,
  onConfirm,
}: {
  order: any
  onClose: () => void
  onConfirm: (status: 'CANCELLED' | 'REFUNDED', reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'CANCELLED' | 'REFUNDED' | null>(null)

  const items: any[] = order.items || []
  const units = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
  const isCash = (order.paymentType || 'cash') === 'cash'

  // Mirrors rollbackInventoryPartial: refundable products plus refundable
  // addons only, each valued at the price the customer actually paid.
  const refundEstimate = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    let value = item.supportsRollback ? (Number(item.unitPrice) || 0) * qty : 0
    for (const addon of item.addonRollbackInfo || []) {
      if (addon.supportsRollback) value += (Number(addon.price) || 0) * qty
    }
    return sum + value
  }, 0)

  const submit = async (status: 'CANCELLED' | 'REFUNDED') => {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError('لازم تكتب أو تختار سبب الإلغاء/الاسترداد')
      return
    }
    setError(null)
    setBusy(status)
    try {
      await onConfirm(status, trimmed)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'فشل تحديث حالة الطلب')
    } finally {
      setBusy(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        dir="rtl"
        className="bg-card border-2 rounded-3xl shadow-2xl w-[560px] max-w-[94vw] max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </span>
            <div>
              <h3 className="font-black text-base">إلغاء / استرداد الطلب</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {order.id} · {items.length} صنف · {units} قطعة · {fmtMoney(order.total)} ج.م · {paymentLabels[order.paymentType] || 'كاش'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-5 pb-4 space-y-3">
          <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-3 space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-black text-red-400">
              <Ban className="h-4 w-4" /> إلغاء كامل
            </p>
            <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              <li>• يرجّع مخزون <b className="text-foreground">كل</b> مكونات الطلب (منتجات + إضافات + خيارات).</li>
              <li>
                • لو الدفع كاش: يتسجل استرداد بمبلغ <b className="text-foreground">{fmtMoney(order.total)} ج.م</b> في الوردية.
                {!isCash && ' الدفع فيزا مش بيتسجل كاش — يترجع من البوابة/الماكينة.'}
              </li>
              <li>• حالة الطلب تتحول إلى «ملغى» ويظهر في تقرير الإلغاءات.</li>
              <li>• الإجراء نهائي ومينفعش يتراجع.</li>
            </ul>
          </div>

          <div className="rounded-2xl border-2 border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-black text-yellow-400">
              <RotateCcw className="h-4 w-4" /> استرداد جزئي
            </p>
            <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              <li>• يرجّع مخزون المنتجات والإضافات المعلّمة <b className="text-green-400">✓ يُرجع</b> فقط.</li>
              <li>
                • قيمة الاسترداد المتوقعة:{' '}
                <b className="text-foreground">{fmtMoney(refundEstimate)} ج.م</b>
                {' '}— الأصناف غير القابلة للإرجاع تفضل مستهلكة ومش بتترجع قيمتها.
              </li>
              {isCash ? (
                <li>• لو القيمة أكبر من صفر: تتسجل حركة استرداد كاش في الوردية بنفس القيمة.</li>
              ) : (
                <li>• الدفع فيزا مش بيتسجل كاش — المبلغ يترجع من البوابة/الماكينة.</li>
              )}
              <li>• حالة الطلب تتحول إلى «مسترد» (مش ملغى).</li>
            </ul>
          </div>

          {items.length > 0 && (
            <div className="rounded-2xl bg-secondary/40 p-3 space-y-1.5">
              <p className="text-[10px] font-black text-muted-foreground">حالة الإرجاع لكل صنف</p>
              {items.map((item) => (
                <div key={item.id} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate">
                      <Emoji>{item.productEmoji}</Emoji> {item.productName || 'منتج'} ×{item.quantity}
                    </span>
                    {item.supportsRollback ? (
                      <span className="shrink-0 font-bold text-green-400">✓ يُرجع</span>
                    ) : (
                      <span className="shrink-0 font-bold text-red-400">✗ لا يُرجع</span>
                    )}
                  </div>
                  {(item.addonRollbackInfo || []).map((addon: any, index: number) => (
                    <div key={index} className="mr-4 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="min-w-0 truncate">↳ <Emoji>{addon.emoji}</Emoji> {addon.name}</span>
                      {addon.supportsRollback
                        ? <span className="shrink-0 font-bold text-green-400/80">✓</span>
                        : <span className="shrink-0 font-bold text-red-400/80">✗</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="mb-1 text-[11px] font-bold text-muted-foreground">
              سبب الإلغاء/الاسترداد <span className="text-destructive">*</span>
            </p>
            <input
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null) }}
              placeholder="اكتب سبباً مخصصاً..."
              className="w-full rounded-xl bg-secondary px-3 py-2.5 text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none"
              dir="rtl"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VOID_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => { setReason(preset); setError(null) }}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[10px] font-bold cursor-pointer transition-colors',
                    reason === preset
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-transparent bg-secondary/60 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[11px] font-bold text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 p-5 pt-1">
          <Button
            variant="destructive"
            className="flex-1 rounded-2xl h-12 font-black gap-1.5"
            disabled={Boolean(busy)}
            onClick={() => void submit('CANCELLED')}
          >
            <Ban className="h-4 w-4" />
            {busy === 'CANCELLED' ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء الكامل'}
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-2xl h-12 font-bold gap-1.5 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
            disabled={Boolean(busy)}
            onClick={() => void submit('REFUNDED')}
          >
            <RotateCcw className="h-4 w-4" />
            {busy === 'REFUNDED' ? 'جارٍ الاسترداد…' : 'تأكيد الاسترداد الجزئي'}
          </Button>
          <Button variant="ghost" className="rounded-2xl h-12 px-4" onClick={onClose} disabled={Boolean(busy)}>
            إغلاق
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
