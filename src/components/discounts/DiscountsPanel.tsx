import { useEffect, useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, sortRows, type SortState } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import type { ViewMode } from '@/components/ui/view-toggle'
import { DatePicker } from '@/components/ui/date-picker'
import { MultiSelect } from '@/components/ui/multi-select'
import { Tag, Plus, X, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { toast } from '@/components/ui/toast'
import { describeSchedule, parseDaysOfWeek } from '@/lib/discount-schedule'

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
// Saturday-first, matching the date picker and the Egyptian week.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]
const PAGE_SIZE = 8
const inputClass = 'px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none'

type DiscountType = 'percentage' | 'fixed' | 'bogo'
type DiscountScope = 'order' | 'products' | 'categories'
type DiscountMode = 'order' | 'daily'

interface DiscountFormState {
  code: string
  type: DiscountType
  value: string
  maxUses: string
  mode: DiscountMode
  dailyUses: string
  dayProducts: { dayOfWeek: number; productId: string }[]
  scope: DiscountScope
  productIds: string[]
  categoryIds: string[]
  startsAt: string
  endsAt: string
  daysOfWeek: number[]
  startTime: string
  endTime: string
  minSubtotal: string
  buyQty: string
  getQty: string
  getPercent: string
  autoApply: boolean
}

const emptyForm = (): DiscountFormState => ({
  code: '',
  type: 'percentage',
  value: '',
  maxUses: '',
  mode: 'order',
  dailyUses: '',
  dayProducts: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, productId: '' })),
  scope: 'order',
  productIds: [],
  categoryIds: [],
  startsAt: '',
  endsAt: '',
  daysOfWeek: [],
  startTime: '',
  endTime: '',
  minSubtotal: '',
  buyQty: '2',
  getQty: '1',
  getPercent: '100',
  autoApply: false,
})

const formFromRow = (row: any): DiscountFormState => ({
  code: row.code ?? '',
  type: row.type === 'bogo' || row.type === 'fixed' ? row.type : 'percentage',
  value: row.value === null || row.value === undefined ? '' : String(row.value),
  maxUses: row.maxUses ? String(row.maxUses) : '',
  mode: row.mode === 'daily' ? 'daily' : 'order',
  dailyUses: row.dailyUses ? String(row.dailyUses) : '',
  dayProducts: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    productId: (row.dayProducts || []).find((dp: any) => Number(dp.dayOfWeek) === dayOfWeek)?.productId || '',
  })),
  scope: row.scope === 'products' || row.scope === 'categories' ? row.scope : 'order',
  productIds: row.productIds || [],
  categoryIds: row.categoryIds || [],
  startsAt: row.startsAt || '',
  endsAt: row.endsAt || '',
  daysOfWeek: parseDaysOfWeek(row.daysOfWeek),
  startTime: row.startTime || '',
  endTime: row.endTime || '',
  minSubtotal: row.minSubtotal ? String(row.minSubtotal) : '',
  buyQty: String(row.buyQty || 2),
  getQty: String(row.getQty || 1),
  getPercent: String(row.getPercent ?? 100),
  autoApply: Boolean(row.autoApply),
})

const offerLabel = (row: any) => {
  if (row.type === 'bogo') {
    const percent = Number(row.getPercent ?? 100)
    return `اشتري ${row.buyQty} + ${row.getQty} ${percent >= 100 ? 'مجاناً' : `بخصم ${percent}%`}`
  }
  if (row.type === 'percentage') return `${row.value}%`
  return `${fmtMoney(Number(row.value) || 0)} ج.م`
}

const scopeLabel = (row: any) => {
  if (row.scope === 'products') return `أصناف (${(row.productIds || []).length})`
  if (row.scope === 'categories') return `أقسام (${(row.categoryIds || []).length})`
  return 'كل الطلب'
}

const modeLabel = (row: any) =>
  (row.mode || 'order') === 'daily' ? 'يومي (صنف اليوم)' : row.autoApply ? 'تلقائي' : 'بكود'

const scheduleLabel = (row: any) => describeSchedule(row) || 'دائماً'

export function DiscountsPanel({ allProducts, categories }: { allProducts: any[]; categories: any[] }) {
  const [discounts, setDiscounts] = useState<any[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DiscountFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('cards')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<SortState<any> | null>(null)
  const [pendingDelete, setPendingDelete] = useState<any | null>(null)

  const load = async () => {
    const rows = await window.api.discountCode.list()
    setDiscounts(rows || [])
  }

  useEffect(() => { load() }, [])

  const productOptions = allProducts.map((product: any) => ({
    value: product.id,
    label: product.name,
    sub: categories.find((category: any) => category.id === product.categoryId)?.name,
  }))
  const categoryOptions = categories.map((category: any) => ({ value: category.id, label: category.name }))

  const filtered = discounts.filter((row) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || `${row.code} ${offerLabel(row)} ${scopeLabel(row)}`.toLowerCase().includes(query)
    const matchesFilter = !filter || (filter === 'active' ? row.active : !row.active)
    return matchesSearch && matchesFilter
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = sortRows(filtered, sort).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const startCreate = () => {
    if (formOpen && !editingId) { setFormOpen(false); return }
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const startEdit = (row: any) => {
    setEditingId(row.id)
    setForm(formFromRow(row))
    setFormOpen(true)
  }

  const set = <K extends keyof DiscountFormState>(key: K, value: DiscountFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const validate = (): string | null => {
    if (!form.code.trim()) return 'اكتب كود الخصم'
    if (form.type === 'percentage') {
      const value = Number(form.value)
      if (!(value > 0 && value <= 100)) return 'النسبة يجب أن تكون بين 1 و 100'
    }
    if (form.type === 'fixed' && !(Number(form.value) > 0)) return 'المبلغ يجب أن يكون أكبر من صفر'
    if (form.type === 'bogo') {
      if (!(Number(form.buyQty) >= 1) || !(Number(form.getQty) >= 1)) return 'حدد عدد القطع المشتراة والمجانية'
      const percent = Number(form.getPercent)
      if (!(percent > 0 && percent <= 100)) return 'نسبة خصم القطع المجانية غير صحيحة'
    }
    if (form.mode === 'daily') {
      if (form.autoApply) return 'خصم الموظفين اليومي لا يمكن تطبيقه تلقائياً'
      if (form.dayProducts.some((row) => !row.productId)) return 'اكمل صنف كل يوم من الأيام السبعة'
    }
    if (form.scope === 'products' && form.productIds.length === 0) return 'اختار صنفاً واحداً على الأقل'
    if (form.scope === 'categories' && form.categoryIds.length === 0) return 'اختار قسماً واحداً على الأقل'
    if (form.startsAt && form.endsAt && form.startsAt > form.endsAt) return 'تاريخ البداية يجب أن يكون قبل تاريخ النهاية'
    return null
  }

  const save = async () => {
    const error = validate()
    if (error) { toast({ title: error, variant: 'error' }); return }

    const payload = {
      code: form.code.toUpperCase().trim(),
      type: form.type,
      value: Number(form.value) || 0,
      maxUses: parseInt(form.maxUses) || 0,
      mode: form.mode,
      dailyUses: parseInt(form.dailyUses) || 0,
      dayProducts: form.mode === 'daily' ? form.dayProducts : undefined,
      scope: form.scope,
      productIds: form.scope === 'products' ? form.productIds : [],
      categoryIds: form.scope === 'categories' ? form.categoryIds : [],
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      daysOfWeek: form.daysOfWeek,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      minSubtotal: Number(form.minSubtotal) || 0,
      buyQty: parseInt(form.buyQty) || 0,
      getQty: parseInt(form.getQty) || 0,
      getPercent: Number(form.getPercent) || 100,
      autoApply: form.autoApply,
    }

    try {
      setSaving(true)
      if (editingId) await window.api.discountCode.update(editingId, payload)
      else await window.api.discountCode.create(payload)
      toast({
        title: editingId ? 'تم تحديث الخصم' : 'تمت إضافة الخصم',
        description: payload.code,
        variant: 'success',
      })
      setFormOpen(false)
      setEditingId(null)
      setForm(emptyForm())
      await load()
    } catch (err: any) {
      toast({ title: 'فشل حفظ الخصم', description: err?.message || 'حدث خطأ', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: any) => {
    try {
      await window.api.discountCode.update(row.id, { active: !row.active })
      await load()
    } catch (err: any) {
      toast({ title: 'فشل تغيير حالة الخصم', description: err?.message || 'حدث خطأ', variant: 'error' })
    }
  }

  return (
    <div className="border-2 rounded-2xl bg-card overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-green-500" />
          <h3 className="font-bold text-sm">أكواد الخصم</h3>
          <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 rounded-full px-2 py-0.5 font-bold">
            {discounts.filter((row) => row.active).length} نشط
          </span>
        </div>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={startCreate}>
          {formOpen && !editingId ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {formOpen && !editingId ? 'إغلاق' : 'إضافة خصم'}
        </Button>
      </div>

      {formOpen && (
        <div className="p-4 border-b space-y-4 animate-slide-up bg-secondary/20">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-xs text-muted-foreground">
              {editingId ? `تعديل الخصم: ${form.code}` : 'إضافة خصم جديد'}
            </h4>
          </div>

          {/* Basics */}
          <div className="space-y-2">
            <p className="text-[11px] font-black text-muted-foreground">الأساسيات</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={form.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder="الكود (مثل BUY2GET1)"
                className={cn(inputClass, 'uppercase font-mono font-bold')}
              />
              <Select value={form.type} onValueChange={(value) => set('type', value as DiscountType)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">نسبة مئوية (%)</SelectItem>
                  <SelectItem value="fixed">مبلغ ثابت (ج.م)</SelectItem>
                  <SelectItem value="bogo">اشتري X واحصل على Y</SelectItem>
                </SelectContent>
              </Select>

              {form.type === 'bogo' ? (
                <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground">اشتري</span>
                    <input type="number" min={1} value={form.buyQty} onChange={(e) => set('buyQty', e.target.value)} placeholder="2" className={cn(inputClass, 'w-full')} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground">احصل على</span>
                    <input type="number" min={1} value={form.getQty} onChange={(e) => set('getQty', e.target.value)} placeholder="1" className={cn(inputClass, 'w-full')} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground">خصم الهدية %</span>
                    <input type="number" min={1} max={100} value={form.getPercent} onChange={(e) => set('getPercent', e.target.value)} placeholder="100" className={cn(inputClass, 'w-full')} />
                  </label>
                </div>
              ) : (
                <input
                  type="number"
                  value={form.value}
                  onChange={(e) => set('value', e.target.value)}
                  placeholder={form.type === 'percentage' ? 'النسبة (مثل 10)' : 'المبلغ (مثل 20)'}
                  className={inputClass}
                />
              )}

              <input
                type="number"
                value={form.maxUses}
                onChange={(e) => set('maxUses', e.target.value)}
                placeholder="حد الاستخدام (0 = بلا حد)"
                className={inputClass}
              />
              <Select
                value={form.mode}
                onValueChange={(value) => {
                  set('mode', value as DiscountMode)
                  if (value === 'daily') set('autoApply', false)
                }}
              >
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="order">خصم بكود / عرض تلقائي</SelectItem>
                  <SelectItem value="daily">خصم موظفين يومي (صنف اليوم)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.mode === 'daily' && (
              <div className="space-y-3 rounded-xl bg-background/40 p-3">
                <input
                  type="number"
                  value={form.dailyUses}
                  onChange={(e) => set('dailyUses', e.target.value)}
                  placeholder="الاستخدامات اليومية (0 = بلا حد)"
                  className={cn(inputClass, 'w-full')}
                />
                <p className="text-[11px] font-bold text-muted-foreground">
                  صنف كل يوم — الخصم يُطبق على صنف اليوم فقط، وباقي الطلب بسعره الكامل
                </p>
                <div className="space-y-1.5">
                  {Array.from({ length: 7 }, (_, day) => (
                    <div key={day} className="flex items-center gap-2">
                      <span className="w-16 text-xs font-bold text-muted-foreground shrink-0">{DAY_NAMES[day]}</span>
                      <Select
                        value={form.dayProducts.find((row) => row.dayOfWeek === day)?.productId || ''}
                        onValueChange={(value) => set('dayProducts', form.dayProducts.map((row) => row.dayOfWeek === day ? { ...row, productId: value } : row))}
                      >
                        <SelectTrigger className="flex-1 rounded-xl h-9"><SelectValue placeholder="اختار الصنف" /></SelectTrigger>
                        <SelectContent>
                          {allProducts.map((product: any) => (
                            <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <p className="text-[11px] font-black text-muted-foreground">الجدولة</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DatePicker value={form.startsAt} onChange={(value) => set('startsAt', value)} placeholder="يبدأ من تاريخ" />
              <DatePicker value={form.endsAt} onChange={(value) => set('endsAt', value)} placeholder="ينتهي في تاريخ" />
              <label className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground">من الساعة</span>
                <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} className={cn(inputClass, 'w-full')} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground">إلى الساعة</span>
                <input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} className={cn(inputClass, 'w-full')} />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[10px] font-bold text-muted-foreground">الحد الأدنى للطلب (ج.م)</span>
                <input type="number" value={form.minSubtotal} onChange={(e) => set('minSubtotal', e.target.value)} placeholder="0 = بدون حد" className={cn(inputClass, 'w-full')} />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WEEK_ORDER.map((day) => {
                const active = form.daysOfWeek.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => set('daysOfWeek', active ? form.daysOfWeek.filter((d) => d !== day) : [...form.daysOfWeek, day])}
                    className={cn(
                      'min-h-[34px] rounded-xl border-2 px-3 text-xs font-bold transition-all cursor-pointer',
                      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {DAY_NAMES[day]}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">من غير اختيار أيام، الخصم ساري كل يوم.</p>
          </div>

          {/* Scope */}
          <div className="space-y-2">
            <p className="text-[11px] font-black text-muted-foreground">النطاق</p>
            <Select value={form.scope} onValueChange={(value) => set('scope', value as DiscountScope)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="order">كل الطلب</SelectItem>
                <SelectItem value="products">أصناف محددة</SelectItem>
                <SelectItem value="categories">أقسام محددة</SelectItem>
              </SelectContent>
            </Select>
            {form.scope === 'products' && (
              <MultiSelect
                values={form.productIds}
                onChange={(values) => set('productIds', values)}
                options={productOptions}
                placeholder="اختار الأصناف"
                searchPlaceholder="ابحث عن صنف…"
              />
            )}
            {form.scope === 'categories' && (
              <MultiSelect
                values={form.categoryIds}
                onChange={(values) => set('categoryIds', values)}
                options={categoryOptions}
                placeholder="اختار الأقسام"
                searchPlaceholder="ابحث عن قسم…"
              />
            )}
            {form.type === 'bogo' && (
              <p className="text-[10px] text-muted-foreground">
                أرخص وحدة من الأصناف المشمولة هي اللي بتاخد الخصم، ويتكرر لكل مجموعة كاملة.
              </p>
            )}
          </div>

          {/* Auto apply */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-background/40 px-3 py-2">
            <div>
              <p className="text-xs font-bold">تطبيق تلقائي بدون كود</p>
              <p className="text-[10px] text-muted-foreground">يُطبَّق أفضل عرض ساري تلقائياً؛ الكود اليدوي له الأولوية</p>
            </div>
            <button
              type="button"
              disabled={form.mode === 'daily'}
              onClick={() => set('autoApply', !form.autoApply)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer border-2 transition-all shrink-0',
                form.autoApply
                  ? 'bg-green-500/10 text-green-400 border-green-500/30'
                  : 'bg-secondary/60 text-muted-foreground border-transparent',
                form.mode === 'daily' && 'opacity-40 cursor-not-allowed',
              )}
            >
              <span className={cn('w-8 h-5 rounded-full relative transition-colors', form.autoApply ? 'bg-green-500' : 'bg-secondary')}>
                <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', form.autoApply ? 'right-0.5' : 'left-0.5')} />
              </span>
              {form.autoApply ? 'مفعّل' : 'متوقف'}
            </button>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl" onClick={save} disabled={saving}>
              {editingId ? 'تحديث الخصم' : 'إضافة الخصم'}
            </Button>
            <Button variant="ghost" className="rounded-xl" onClick={() => { setFormOpen(false); setEditingId(null) }}>إلغاء</Button>
          </div>
        </div>
      )}

      <ListToolbar
        search={search}
        onSearchChange={(value) => { setSearch(value); setPage(1) }}
        searchPlaceholder="ابحث عن خصم..."
        filters={[
          { value: null, label: 'الكل', count: discounts.length },
          { value: 'active', label: 'نشطة', count: discounts.filter((row) => row.active).length },
          { value: 'inactive', label: 'معطلة', count: discounts.filter((row) => !row.active).length },
        ]}
        filterValue={filter}
        onFilterChange={(value) => { setFilter(value); setPage(1) }}
        view={view}
        onViewChange={setView}
        className="px-4"
      />

      {view === 'table' ? (
        <DataTable
          data={visible}
          keyExtractor={(row) => row.id}
          sort={sort}
          onSortChange={(value) => { setSort(value); setPage(1) }}
          columns={[
            { key: 'code', label: 'الكود', render: (row) => <span className="font-mono font-bold">{row.code}</span> },
            {
              key: 'offer',
              label: 'العرض',
              sortValue: (row: any) => row.code,
              render: (row) => (
                <div>
                  <p className="font-bold text-xs">{offerLabel(row)}</p>
                  <p className="text-[10px] text-muted-foreground">{scopeLabel(row)} · {modeLabel(row)}</p>
                </div>
              ),
            },
            {
              key: 'schedule',
              label: 'المدة',
              render: (row) => <span className="text-[11px] text-muted-foreground">{scheduleLabel(row)}</span>,
            },
            {
              key: 'usage',
              label: 'الاستخدام',
              sortValue: (row: any) => row.usedCount,
              render: (row) => {
                const base = row.maxUses > 0 ? `${row.usedCount} / ${row.maxUses}` : `${row.usedCount} (بلا حد)`
                return (row.mode || 'order') === 'daily' && row.dailyUses > 0 ? `${base} — ${row.dailyUses}/يوم` : base
              },
            },
            {
              key: 'status',
              label: 'الحالة',
              sortValue: (row: any) => row.active,
              render: (row) => (
                <button
                  onClick={() => toggleActive(row)}
                  className={cn(
                    'text-[10px] font-bold rounded-full px-2.5 py-0.5 cursor-pointer transition-colors border',
                    row.active
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/20'
                      : 'bg-secondary text-muted-foreground border-border hover:bg-secondary/80',
                  )}
                  title="اضغط للتبديل بين نشط ومعطل"
                >
                  {row.active ? 'نشط' : 'معطل'}
                </button>
              ),
            },
            {
              key: 'actions',
              label: 'إجراءات',
              className: 'text-left',
              render: (row) => (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(row)} title="تعديل">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(row)} title="حذف">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ),
            },
          ]}
          className="mx-4 mb-4"
        />
      ) : (
        <div className="p-4 space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="flex items-center gap-3 bg-secondary/60 rounded-xl p-3">
              <Tag className="h-4 w-4 text-green-500 shrink-0" />
              <div className="flex-1 cursor-pointer min-w-0" onClick={() => startEdit(row)}>
                <p className="text-sm font-bold font-mono">{row.code}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {offerLabel(row)} · {scopeLabel(row)} · {modeLabel(row)}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{scheduleLabel(row)}</p>
              </div>
              <button
                onClick={() => toggleActive(row)}
                className={cn(
                  'text-[10px] font-bold rounded-full px-2.5 py-0.5 cursor-pointer transition-colors border shrink-0',
                  row.active
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/20'
                    : 'bg-secondary text-muted-foreground border-border hover:bg-secondary/80',
                )}
                title="اضغط للتبديل بين نشط ومعطل"
              >
                {row.active ? 'نشط' : 'معطل'}
              </button>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg shrink-0" onClick={() => startEdit(row)} title="تعديل">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive shrink-0" onClick={() => setPendingDelete(row)} title="حذف">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-xs text-muted-foreground py-4">لا توجد أكواد خصم مطابقة</p>}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={filtered.length}
        start={(page - 1) * PAGE_SIZE}
        end={Math.min(page * PAGE_SIZE, filtered.length)}
        onPageChange={setPage}
        pageSize={PAGE_SIZE}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف الخصم"
        description={pendingDelete ? `سيتم حذف «${pendingDelete.code}» نهائياً.` : undefined}
        allowHardDelete
        hardDeleteDescription="يحذف الخصم نهائياً من قاعدة البيانات. لن يمكن استرجاعه."
        onConfirm={async ({ hard }) => {
          if (!pendingDelete) return
          try {
            await window.api.discountCode.delete(pendingDelete.id, { hard })
            toast({ title: 'تم الحذف بنجاح', variant: 'success' })
            await load()
          } catch (err: any) {
            toast({ title: 'فشل الحذف', description: err?.message || 'حدث خطأ أثناء الحذف', variant: 'error' })
          } finally {
            setPendingDelete(null)
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
