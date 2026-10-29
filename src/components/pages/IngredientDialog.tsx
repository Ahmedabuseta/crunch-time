import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Package, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { fmtMoney, roundMoney } from '@/lib/format'
import {
  INVENTORY_CATEGORIES,
  STORAGE_OPTIONS,
  categoryForIngredient,
  defaultStorageForCategory,
  storageForIngredient,
  type InventoryCategoryId,
  type InventoryStorageId,
} from '@/lib/inventory-taxonomy'

const unitLabel: Record<string, string> = { g: 'جرام', kg: 'كيلو', ml: 'مليلتر', l: 'لتر', pcs: 'قطعة' }

function Field({
  label,
  required,
  optional,
  hint,
  children,
  className,
}: {
  label: string
  required?: boolean
  optional?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
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

const inputClass = 'w-full px-3 py-2.5 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-60'

export function IngredientDialog({
  ingredient,
  onClose,
}: {
  ingredient: any | null
  onClose: () => void
}) {
  const createIngredient = useInventoryStore((s) => s.createIngredient)
  const updateIngredient = useInventoryStore((s) => s.updateIngredient)
  const isEdit = Boolean(ingredient)

  const [name, setName] = useState(String(ingredient?.name ?? ''))
  const [unit, setUnit] = useState(String(ingredient?.unit ?? 'g'))
  const [category, setCategory] = useState<InventoryCategoryId>(
    ingredient ? (ingredient.category || categoryForIngredient(ingredient.id || '')) : 'other',
  )
  const [storage, setStorage] = useState<InventoryStorageId>(
    ingredient ? (ingredient.storage || storageForIngredient(ingredient.id || '')) : 'dry',
  )
  const [stockQuantity, setStockQuantity] = useState(String(ingredient?.stockQuantity ?? ''))
  const [minStock, setMinStock] = useState(String(ingredient?.minStock ?? ''))
  const [purchaseQty, setPurchaseQty] = useState(String(Number(ingredient?.purchaseQty) || (unit === 'g' ? 1000 : 1)))
  const [packagePrice, setPackagePrice] = useState(() => {
    const pack = Number(ingredient?.purchaseQty) || 1
    return ingredient ? String(roundMoney((Number(ingredient.costPerUnit) || 0) * pack)) : ''
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const qty = parseFloat(stockQuantity) || 0
  const min = parseFloat(minStock) || 0
  const pack = parseFloat(purchaseQty) || 1
  const packagePriceNum = parseFloat(packagePrice) || 0
  // Money never carries more than two decimals — the same value is stored and
  // shown, so no 0.14333333333333334 can leak into an input or a total.
  const unitCost = roundMoney(packagePriceNum / (pack || 1))

  const save = async () => {
    if (!name.trim()) { setError('اسم المادة مطلوب'); return }
    if (pack <= 0) { setError('حجم العبوة لازم يكون أكبر من صفر'); return }
    if (packagePriceNum < 0) { setError('سعر العبوة لا يقل عن صفر'); return }
    if (!isEdit && qty < 0) { setError('الكمية الحالية لا تقل عن صفر'); return }
    if (min < 0) { setError('الحد الأدنى لا يقل عن صفر'); return }
    setError(null)
    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        unit,
        minStock: min,
        costPerUnit: unitCost,
        purchaseQty: pack,
        category,
        storage,
      }
      if (isEdit) {
        await updateIngredient(ingredient.id, payload)
        toast({ title: 'تم تحديث المادة', description: payload.name, variant: 'success' })
      } else {
        await createIngredient({ ...payload, stockQuantity: qty })
        toast({ title: 'تم إنشاء المادة', description: payload.name, variant: 'success' })
      }
      if (min > 0 && qty <= min) {
        toast({
          title: 'المادة تحت الحد الأدنى',
          description: `${payload.name}: الرصيد ${qty} والحد الأدنى ${min}`,
          variant: 'warning',
        })
      }
      onClose()
    } catch (err: any) {
      setError(err?.message || 'فشل حفظ المادة')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        dir="rtl"
        className="bg-card border-2 rounded-3xl shadow-2xl w-[600px] max-w-[94vw] max-h-[90vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-primary" />
            </span>
            <div>
              <h3 className="font-black text-base">{isEdit ? 'تعديل مادة' : 'إضافة مادة جديدة'}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                الحقول المعلّمة بـ <span className="text-destructive font-bold">*</span> مطلوبة
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="اسم المادة" required className="col-span-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: موزاريلا"
              dir="rtl"
              className={inputClass}
            />
          </Field>

          <Field label="الوحدة" required hint="وحدة القياس اللي بتتخزن بيها وتُستهلك بيها في الوصفات">
            <Select value={unit} onValueChange={(v) => { setUnit(v); setPurchaseQty(v === 'g' ? '1000' : '1') }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="g">جرام (g)</SelectItem>
                <SelectItem value="kg">كيلو (kg)</SelectItem>
                <SelectItem value="ml">مليلتر (ml)</SelectItem>
                <SelectItem value="l">لتر (l)</SelectItem>
                <SelectItem value="pcs">قطعة (pcs)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="القسم" required>
            <Select
              value={category}
              onValueChange={(v) => { setCategory(v as InventoryCategoryId); setStorage(defaultStorageForCategory(v)) }}
            >
              <SelectTrigger><SelectValue placeholder="القسم" /></SelectTrigger>
              <SelectContent>
                {INVENTORY_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="التخزين" required>
            <Select value={storage} onValueChange={(v) => setStorage(v as InventoryStorageId)}>
              <SelectTrigger><SelectValue placeholder="التخزين" /></SelectTrigger>
              <SelectContent>
                {STORAGE_OPTIONS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="الكمية الحالية"
            required={!isEdit}
            optional={isEdit}
            hint={isEdit ? 'الرصيد بيتغير من زر «تعبئة» أو «تسوية» في الجدول' : `بالـ${unitLabel[unit] || unit}`}
          >
            <input
              type="number"
              inputMode="decimal"
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              placeholder="0"
              disabled={isEdit}
              className={inputClass}
            />
          </Field>

          <Field label="الحد الأدنى" optional hint="لو الرصيد وصل له أو قل عنه، المادة تظهر في تنبيهات النقص">
            <input
              type="number"
              inputMode="decimal"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </Field>

          <Field label="حجم العبوة" optional hint={`الافتراضي ${unit === 'g' ? '1000 جرام' : '1'} — سيبه 1 لو بتشتري بالقطعة`}>
            <input
              type="number"
              inputMode="decimal"
              value={purchaseQty}
              onChange={(e) => setPurchaseQty(e.target.value)}
              placeholder={unit === 'g' ? '1000' : '1'}
              className={inputClass}
            />
          </Field>

          <Field label="سعر العبوة" optional hint="السعر كما هو مكتوب على الفاتورة — تُحسب منه تكلفة الوحدة">
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={packagePrice}
              onChange={(e) => setPackagePrice(e.target.value)}
              onBlur={() => setPackagePrice((v) => (v ? String(roundMoney(parseFloat(v) || 0)) : v))}
              placeholder="0.00"
              className={inputClass}
            />
          </Field>

          <div className="col-span-2 rounded-xl bg-secondary/40 px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span className="text-muted-foreground">تكلفة الوحدة:</span>
            <b className="text-foreground">{fmtMoney(unitCost)} ج.م / {unitLabel[unit] || unit}</b>
            {pack > 1 && (
              <span className="text-muted-foreground">(سعر العبوة ÷ {pack} {unitLabel[unit] || unit})</span>
            )}
          </div>

          {min > 0 && qty <= min && (
            <p className="col-span-2 flex items-center gap-1.5 text-[11px] font-bold text-yellow-500">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              الرصيد الحالي أقل من أو يساوي الحد الأدنى — المادة هتظهر في تنبيهات النقص
            </p>
          )}

          {error && <p className="col-span-2 text-[11px] font-bold text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 p-5 pt-1">
          <Button className="flex-1 rounded-2xl h-12 text-base font-black" onClick={() => void save()} disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : isEdit ? 'تحديث المادة' : 'إضافة المادة'}
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
