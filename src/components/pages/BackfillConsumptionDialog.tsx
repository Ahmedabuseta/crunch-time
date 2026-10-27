import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Calculator, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'

type BackfillResult = {
  ok: boolean
  error?: string
  dryRun: boolean
  matchedOrders: number
  alreadyCounted: number
  readyOrders: number
  noRecipeOrders: number
  ingredients: number
  inserted: number
  cost: number
}

const STATUS_PRESETS: Record<string, string[]> = {
  completed: ['COMPLETED'],
  completed_refunded: ['COMPLETED', 'REFUNDED'],
  all: ['COMPLETED', 'REFUNDED', 'CANCELLED'],
}

const filterTriggerClass = 'h-8 w-auto gap-1 px-3 rounded-full bg-secondary/60 text-[11px] font-bold text-foreground [&>span]:truncate'

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-secondary/50 px-3 py-2">
      <p className="text-[10px] font-bold text-muted-foreground leading-none mb-1">{label}</p>
      <p className={cn('text-sm font-black leading-none', tone)}>{value}</p>
    </div>
  )
}

export function BackfillConsumptionDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [statusPreset, setStatusPreset] = useState('completed')
  const [orderType, setOrderType] = useState('all')
  const [result, setResult] = useState<BackfillResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setResult(null)
      setError(null)
    }
  }, [open])

  if (!open) return null

  const resetPreview = () => { setResult(null); setError(null) }

  const run = async (dryRun: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.inventory.backfillConsumption({
        from: from || undefined,
        to: to || undefined,
        statuses: STATUS_PRESETS[statusPreset],
        orderType: orderType === 'all' ? undefined : orderType,
        dryRun,
      })
      if (!res.ok) {
        setError(res.error || 'فشل الاحتساب')
        return
      }
      setResult(res)
      if (!dryRun) {
        toast({
          title: 'تم احتساب الأوردرات القديمة',
          description: `${res.readyOrders} طلب · ${res.inserted} حركة استهلاك`,
          variant: 'success',
        })
        onDone()
        onClose()
      }
    } catch (err: any) {
      setError(err?.message || 'فشل الاحتساب')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        dir="rtl"
        className="bg-card border-2 rounded-3xl shadow-2xl w-[520px] max-w-[94vw] max-h-[88vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Calculator className="h-5 w-5 text-primary" />
            </span>
            <div>
              <h3 className="font-black text-base">احتساب استهلاك أوردرات قديمة</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">يضيف حركات الاستهلاك الناقصة فقط</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-5 pb-4 space-y-3">
          <div className="rounded-2xl bg-secondary/40 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              الأداة بتحسب الكميات من وصفات المنتجات والإضافات والخيارات زي البيع العادي،
              <b className="text-foreground"> من غير أي خصم من المخزون الحالي</b>.
              أي طلب ليه حركة استهلاك بالفعل بيتخطى تلقائيًا، فتشغيلها أكتر من مرة آمن.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground">من تاريخ</p>
              <DatePicker value={from} onChange={(v) => { setFrom(v); resetPreview() }} placeholder="من" />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground">إلى تاريخ</p>
              <DatePicker value={to} onChange={(v) => { setTo(v); resetPreview() }} placeholder="إلى" />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground">حالة الطلب</p>
              <Select value={statusPreset} onValueChange={(v) => { setStatusPreset(v); resetPreview() }}>
                <SelectTrigger className={filterTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">المكتملة فقط</SelectItem>
                  <SelectItem value="completed_refunded">المكتملة والمستردة</SelectItem>
                  <SelectItem value="all">كل الحالات</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-muted-foreground">نوع الطلب</p>
              <Select value={orderType} onValueChange={(v) => { setOrderType(v); resetPreview() }}>
                <SelectTrigger className={filterTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  <SelectItem value="dine-in">صالة</SelectItem>
                  <SelectItem value="takeaway">تيك أوي</SelectItem>
                  <SelectItem value="delivery">توصيل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {result && (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="طلبات مطابقة" value={String(result.matchedOrders)} />
              <Stat label="هتتحسب" value={String(result.readyOrders)} tone={result.readyOrders > 0 ? 'text-primary' : undefined} />
              <Stat label="متخطاة (لها استهلاك)" value={String(result.alreadyCounted)} />
              <Stat label="بدون وصفة" value={String(result.noRecipeOrders)} />
              <Stat label="مواد متأثرة" value={String(result.ingredients)} />
              <Stat label="تكلفة تقديرية" value={`${fmtMoney(result.cost)} ج.م`} />
            </div>
          )}

          {error && <p className="text-[11px] font-bold text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 p-5 pt-1">
          <Button
            className="flex-1 rounded-2xl h-12 text-base font-black gap-1.5"
            disabled={busy || !result || result.readyOrders === 0}
            onClick={() => void run(false)}
          >
            <Calculator className="h-4 w-4" />
            {busy ? 'جارٍ الاحتساب…' : 'احتساب'}
          </Button>
          <Button variant="outline" className="rounded-2xl h-12 px-5" disabled={busy} onClick={() => void run(true)}>
            معاينة
          </Button>
          <Button variant="ghost" className="rounded-2xl h-12 px-4" onClick={onClose} disabled={busy}>
            إغلاق
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
