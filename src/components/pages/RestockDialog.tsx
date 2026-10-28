import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownToLine, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

const unitLabel: Record<string, string> = { g: 'جرام', kg: 'كيلو', ml: 'مليلتر', l: 'لتر', pcs: 'قطعة' }
const fmtQty = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

const inputClass = 'w-full px-3 py-2.5 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none'

function Field({ label, required, optional, hint, children }: {
  label: string
  required?: boolean
  optional?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
        {optional && <span className="font-medium"> (اختياري)</span>}
      </p>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function RestockDialog({
  ingredient,
  onClose,
  onDone,
}: {
  ingredient: any
  onClose: () => void
  onDone: (result: { name: string; ppv?: number }) => void
}) {
  const restock = useInventoryStore((s) => s.restock)
  const pack = Number(ingredient.purchaseQty) || 1
  const unit = unitLabel[ingredient.unit] || ingredient.unit

  const [mode, setMode] = useState<'packages' | 'quantity'>('packages')
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState('')
  const [supplier, setSupplier] = useState(String(ingredient.supplier || ''))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const entered = parseFloat(amount) || 0
  const addedQty = mode === 'packages' ? entered * pack : entered
  const priceNum = parseFloat(price) || 0
  const unitCost = mode === 'packages'
    ? (priceNum > 0 ? priceNum / pack : null)
    : (priceNum > 0 && addedQty > 0 ? priceNum / addedQty : null)

  const submit = async () => {
    if (!entered || entered <= 0) {
      setError(mode === 'packages' ? 'اكتب عدد العبوات' : 'اكتب الكمية المضافة')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const supplierName = supplier.trim() || undefined
      const result = mode === 'packages'
        ? await restock(ingredient.id, entered, 'إعادة تعبئة يدوية', {
            packagePrice: priceNum > 0 ? priceNum : undefined,
            supplier: supplierName,
          })
        : await restock(ingredient.id, entered, 'إعادة تعبئة يدوية', {
            byQuantity: true,
            totalPrice: priceNum > 0 ? priceNum : undefined,
            supplier: supplierName,
          })
      toast({
        title: 'تمت التعبئة',
        description: `${ingredient.name} +${fmtQty(addedQty)} ${unit}`,
        variant: 'success',
      })
      onDone({ name: ingredient.name, ppv: result?.ppv })
      onClose()
    } catch (err: any) {
      setError(err?.message || 'فشل تسجيل التعبئة')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        dir="rtl"
        className="bg-card border-2 rounded-3xl shadow-2xl w-[480px] max-w-[94vw] max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
              <ArrowDownToLine className="h-5 w-5 text-green-500" />
            </span>
            <div>
              <h3 className="font-black text-base">تعبئة مخزون</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {ingredient.name} · الرصيد الحالي {fmtQty(ingredient.stockQuantity)} {unit}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-5 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
            <button
              type="button"
              onClick={() => { setMode('packages'); setError(null) }}
              className={cn(
                'rounded-lg py-2 text-xs font-bold transition-colors cursor-pointer',
                mode === 'packages' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              بالعبوة
            </button>
            <button
              type="button"
              onClick={() => { setMode('quantity'); setError(null) }}
              className={cn(
                'rounded-lg py-2 text-xs font-bold transition-colors cursor-pointer',
                mode === 'quantity' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              بالكمية
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {mode === 'packages' ? (
              <>
                <Field
                  label="عدد العبوات"
                  required
                  hint={`حجم العبوة المسجل: ${fmtQty(pack)} ${unit} — كل عبوة تضيف ${fmtQty(pack)} ${unit}`}
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="مثال: 3"
                    className={inputClass}
                  />
                </Field>
                <Field label="سعر العبوة" optional hint="اختياري — يُستخدم لمقارنة سعر الشراء بالتكلفة القياسية">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field
                  label="الكمية المضافة"
                  required
                  hint={`بالـ${unit} مباشرة — مش هتتضرب في حجم العبوة`}
                >
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="مثال: 300"
                      className={cn(inputClass, 'pl-14')}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">{unit}</span>
                  </div>
                </Field>
                <Field label="إجمالي سعر الكمية" optional hint="اختياري — يُقسم على الكمية لحساب تكلفة الوحدة">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </Field>
              </>
            )}
          </div>

          <Field label="المورد" optional hint="لو المادة ملهاش مورد مسجل، الاسم ده هيتحفظ عليها">
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="اسم المورد"
              dir="rtl"
              className={inputClass}
            />
          </Field>

          <div className="rounded-xl bg-secondary/40 px-3 py-2.5 space-y-1 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">هيتضاف للمخزون</span>
              <b className="text-foreground">{fmtQty(addedQty)} {unit}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">تكلفة الوحدة بعد التعبئة</span>
              <b className={cn('text-foreground', unitCost != null && unitCost < Number(ingredient.costPerUnit || 0) && 'text-green-500')}>
                {unitCost != null ? `${fmtMoney(unitCost)} ج.م / ${unit}` : '—'}
              </b>
            </div>
          </div>

          {error && <p className="text-[11px] font-bold text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 p-5 pt-1">
          <Button className="flex-1 rounded-2xl h-12 text-base font-black" onClick={() => void submit()} disabled={busy}>
            {busy ? 'جارٍ التعبئة…' : 'تأكيد التعبئة'}
          </Button>
          <Button variant="ghost" className="rounded-2xl h-12 px-5" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
