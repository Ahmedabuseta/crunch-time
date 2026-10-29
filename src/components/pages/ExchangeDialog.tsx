import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Repeat, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { SearchableSelect } from '@/components/ui/searchable-select'
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

export function ExchangeDialog({
  ingredient,
  onClose,
  onDone,
}: {
  ingredient: any
  onClose: () => void
  onDone: () => void
}) {
  const ingredients = useInventoryStore((s) => s.allIngredients)
  const exchange = useInventoryStore((s) => s.exchange)

  const [fromPackages, setFromPackages] = useState('')
  const [toId, setToId] = useState('')
  const [toPackages, setToPackages] = useState('')
  const [price, setPrice] = useState('')
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fromPack = Number(ingredient.purchaseQty) || 1
  const fromUnit = unitLabel[ingredient.unit] || ingredient.unit
  const to = ingredients.find((i) => i.id === toId)
  const toPack = to ? (Number(to.purchaseQty) || 1) : 1
  const toUnit = to ? unitLabel[to.unit] || to.unit : ''
  const priceNum = parseFloat(price) || 0

  const outQty = (parseFloat(fromPackages) || 0) * fromPack
  const inQty = (parseFloat(toPackages) || 0) * toPack
  const toUnitCost = priceNum > 0 ? priceNum / toPack : null
  const returnCredit = fromPack * (ingredient.costPerUnit || 0) * (parseFloat(fromPackages) || 0)
  const newSpend = priceNum * (parseFloat(toPackages) || 0)

  const submit = async () => {
    if (!to) { setError('اختر المادة الجديدة'); return }
    if ((parseFloat(fromPackages) || 0) <= 0 && (parseFloat(toPackages) || 0) <= 0) {
      setError('اكتب كمية واحدة على الأقل')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const result = await exchange({
        fromIngredientId: ingredient.id,
        fromPackages: parseFloat(fromPackages) || 0,
        toIngredientId: to.id,
        toPackages: parseFloat(toPackages) || 0,
        packagePrice: priceNum > 0 ? priceNum : undefined,
        supplier: supplier.trim() || undefined,
        note: note.trim() || 'مبادلة',
      })
      if (!result?.ok) throw new Error(result?.error || 'فشل تسجيل المبادلة')
      toast({
        title: 'تمت المبادلة',
        description: `${ingredient.name} − ${(parseFloat(fromPackages) || 0)} ← ${to.name} + ${parseFloat(toPackages) || 0}`,
        variant: 'success',
      })
      onDone()
      onClose()
    } catch (err: any) {
      setError(err?.message || 'فشل تسجيل المبادلة')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        dir="rtl"
        className="bg-card border-2 rounded-3xl shadow-2xl w-[500px] max-w-[94vw] max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
              <Repeat className="h-5 w-5 text-orange-500" />
            </span>
            <div>
              <h3 className="font-black text-base">مبادلة مخزون</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                رجّع {ingredient.name} · الرصيد {fmtQty(ingredient.stockQuantity)} {fromUnit} · {fmtMoney(ingredient.costPerUnit || 0)} ج.م / {fromUnit}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-5 pb-4 space-y-3">
          <Field
            label="عدد علب الرجوع من المادة القديمة"
            hint={`حجم العبوة: ${fmtQty(fromPack)} ${fromUnit} — يُخصم ${fmtQty(outQty)} ${fromUnit} من ${ingredient.name}`}
          >
            <input
              type="number"
              inputMode="decimal"
              value={fromPackages}
              onChange={(e) => setFromPackages(e.target.value)}
              placeholder="مثال: 2 — اتركها 0 لو مش راجع حاجة"
              className={inputClass}
              dir="rtl"
            />
          </Field>

          <Field label="المادة الجديدة" required hint="ممكن تكون نفس المادة ببرند تاني — الاختيارات كلها متاحة">
            <SearchableSelect
              value={toId}
              onChange={setToId}
              placeholder="ابحث عن المادة…"
              options={ingredients.map((i) => ({
                value: i.id,
                label: i.name,
                sub: `${Number(i.stockQuantity).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unitLabel[i.unit] || i.unit} · ${fmtMoney(Number(i.costPerUnit) || 0)} ج.م/${unitLabel[i.unit] || i.unit}`,
              }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="عدد علب المادة الجديدة"
              required
              hint={to ? `حجم العبوة: ${fmtQty(toPack)} ${toUnit} — يُضاف ${fmtQty(inQty)} ${toUnit}` : 'اختر المادة أولاً'}
            >
              <input
                type="number"
                inputMode="decimal"
                value={toPackages}
                onChange={(e) => setToPackages(e.target.value)}
                placeholder="مثال: 10"
                className={inputClass}
                dir="rtl"
              />
            </Field>
            <Field label="سعر علب المادة الجديدة" optional hint="سعر العبوة كما على الفاتورة — يُسجل سعر الشراء الجديد">
              <input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className={inputClass}
                dir="rtl"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="المورد" optional>
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="اسم المورد"
                dir="rtl"
                className={inputClass}
              />
            </Field>
            <Field label="ملاحظة" optional>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثال: برند جديد"
                dir="rtl"
                className={inputClass}
              />
            </Field>
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-secondary/40 px-3 py-2.5 space-y-1 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">هيتخصم من المادة القديمة</span>
              <b className={cn('text-foreground', outQty > 0 && 'text-red-500')}>
                −{fmtQty(outQty)} {fromUnit}
              </b>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">هيتضاف للمادة الجديدة</span>
              <b className={cn('text-foreground', to !== undefined && inQty > 0 && 'text-green-500')}>
                +{fmtQty(inQty)} {toUnit || '—'}
              </b>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">تكلفة الوحدة بعد المبادلة</span>
              <b className="text-foreground">
                {toUnitCost != null ? `${fmtMoney(toUnitCost)} ج.م / ${toUnit}` : '—'}
              </b>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">صافي حركة الكاش</span>
              <b className="text-foreground">
                {(() => {
                  const net = newSpend - returnCredit
                  if (net === 0) return '—'
                  return `${net > 0 ? 'دفع ' : 'استرداد '}${fmtMoney(Math.abs(net))} ج.م`
                })()}
              </b>
            </div>
          </div>

          {error && <p className="text-[11px] font-bold text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 p-5 pt-1">
          <Button className="flex-1 rounded-2xl h-12 text-base font-black" onClick={() => void submit()} disabled={busy}>
            {busy ? 'جارٍ التسجيل…' : 'تأكيد المبادلة'}
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

