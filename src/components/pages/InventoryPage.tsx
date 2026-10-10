import { useEffect, useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import type { InventoryLedger } from '@/services/inventory/inventory.types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Package, AlertTriangle, Pencil, X, History, TrendingDown, TrendingUp, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { toast } from '@/components/ui/toast'
import type { ViewMode } from '@/components/ui/view-toggle'
import { SubRecipesSection } from './SubRecipesSection'

const unitLabel: Record<string, string> = { g: 'جرام', kg: 'كيلو', ml: 'مليلتر', l: 'لتر', pcs: 'قطعة' }

const typeMeta: Record<string, { label: string; cls: string }> = {
  PURCHASE: { label: 'شراء', cls: 'bg-green-500/10 text-green-600' },
  CONSUMPTION: { label: 'بيع', cls: 'bg-red-500/10 text-red-600' },
  WASTE: { label: 'تالف', cls: 'bg-amber-500/10 text-amber-600' },
  ADJUSTMENT: { label: 'تسوية', cls: 'bg-blue-500/10 text-blue-600' },
}

export function InventoryPage() {
  const ingredients = useInventoryStore((s) => s.ingredients)
  const alerts = useInventoryStore((s) => s.alerts)
  const fetchIngredients = useInventoryStore((s) => s.fetchIngredients)
  const fetchAlerts = useInventoryStore((s) => s.fetchAlerts)
  const restock = useInventoryStore((s) => s.restock)
  const recordWaste = useInventoryStore((s) => s.recordWaste)
  const adjust = useInventoryStore((s) => s.adjust)
  const fetchLedger = useInventoryStore((s) => s.fetchLedger)
  const createIngredient = useInventoryStore((s) => s.createIngredient)
  const updateIngredient = useInventoryStore((s) => s.updateIngredient)

  const [showIngForm, setShowIngForm] = useState(false)
  const [invTab, setInvTab] = useState<'ingredients' | 'sub-recipes'>('ingredients')
  const [editIngId, setEditIngId] = useState<string | null>(null)
  const [ingForm, setIngForm] = useState({ name: '', emoji: '', unit: 'g', stockQuantity: '', minStock: '', purchaseQty: '1', packagePrice: '' })
  const [restockId, setRestockId] = useState<string | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [view, setView] = useState<ViewMode>('table')
  const [stockFilter, setStockFilter] = useState<string | null>(null)
  const [movesFor, setMovesFor] = useState<string | null>(null)
  const [ledger, setLedger] = useState<(InventoryLedger & { total: number; page: number; pageSize: number; totalPages: number }) | null>(null)
  const [recType, setRecType] = useState<'WASTE' | 'ADJUSTMENT'>('WASTE')
  const [recQty, setRecQty] = useState('')
  const [recNote, setRecNote] = useState('')
  const [restockUnitCost, setRestockUnitCost] = useState('')
  const [restockSupplier, setRestockSupplier] = useState('')
  const [lastPpv, setLastPpv] = useState<{ name: string; ppv: number } | null>(null)
  const [movTypeFilter, setMovTypeFilter] = useState<string | null>(null)
  const [movFrom, setMovFrom] = useState('')
  const [movTo, setMovTo] = useState('')
  const [movPage, setMovPage] = useState(1)

  useEffect(() => { fetchIngredients(); fetchAlerts() }, [])

  const alertIds = new Set(alerts.map(a => a.id))

  const list = useListControls({
    items: ingredients,
    searchText: (ing) => `${ing.name} ${unitLabel[ing.unit] || ''}`,
    filter: (ing) => {
      if (!stockFilter) return true
      if (stockFilter === 'low') return alertIds.has(ing.id)
      if (stockFilter === 'ok') return !alertIds.has(ing.id)
      return true
    },
    pageSize: 12,
  })

  const resetIngForm = () => { setIngForm({ name: '', emoji: '', unit: 'g', stockQuantity: '', minStock: '', purchaseQty: '1', packagePrice: '' }); setEditIngId(null); setShowIngForm(false) }

  // The owner enters the purchase-package price (e.g. a 1kg bag);
  // the per-unit cost stored on the ingredient is derived from it.
  const deriveCost = (packagePrice: string, purchaseQty: string) =>
    (parseFloat(packagePrice) || 0) / (parseFloat(purchaseQty) || 1)

  const handleCreateIng = async () => {
    if (!ingForm.name || !ingForm.unit) return
    await createIngredient({ name: ingForm.name, emoji: ingForm.emoji || '📦', unit: ingForm.unit, stockQuantity: parseFloat(ingForm.stockQuantity) || 0, minStock: parseFloat(ingForm.minStock) || 0, costPerUnit: deriveCost(ingForm.packagePrice, ingForm.purchaseQty), purchaseQty: parseFloat(ingForm.purchaseQty) || 1 })
    toast({ title: 'تم إنشاء المادة', description: ingForm.name, variant: 'success' })
    resetIngForm()
  }

  const handleUpdateIng = async () => {
    if (!editIngId || !ingForm.name) return
    await updateIngredient(editIngId, { name: ingForm.name, unit: ingForm.unit, minStock: parseFloat(ingForm.minStock) || 0, costPerUnit: deriveCost(ingForm.packagePrice, ingForm.purchaseQty), purchaseQty: parseFloat(ingForm.purchaseQty) || 1 })
    toast({ title: 'تم تحديث المادة', description: ingForm.name, variant: 'success' })
    resetIngForm()
  }

  const startEditIng = (i: any) => {
    setEditIngId(i.id); setShowIngForm(false)
    const purchaseQty = Number(i.purchaseQty) || 1
    setIngForm({ name: i.name, emoji: i.emoji || '', unit: i.unit, stockQuantity: String(i.stockQuantity), minStock: String(i.minStock), purchaseQty: String(purchaseQty), packagePrice: String((Number(i.costPerUnit) || 0) * purchaseQty) })
  }

  const handleRestock = async () => {
    if (restockId && restockQty) {
      const packagePrice = parseFloat(restockUnitCost)
      const opts = {
        packagePrice: !isNaN(packagePrice) && packagePrice > 0 ? packagePrice : undefined,
        supplier: restockSupplier.trim() || undefined,
      }
      const result = await restock(restockId, parseFloat(restockQty), 'إعادة تعبئة يدوية', opts.packagePrice || opts.supplier ? opts : undefined)
      const ing = ingredients.find(i => i.id === restockId)
      toast({ title: 'تمت التعبئة', description: ing ? `${ing.name} +${restockQty} ${ing.unit}` : undefined, variant: 'success' })
      if (result?.ppv != null && ing) setLastPpv({ name: ing.name, ppv: result.ppv })
      setRestockId(null); setRestockQty(''); setRestockUnitCost(''); setRestockSupplier('')
    }
  }

  const loadLedger = async (ingId: string, page = movPage, type = movTypeFilter, from = movFrom, to = movTo) => {
    setLedger(await fetchLedger(ingId, {
      page, pageSize: 20,
      ...(type ? { type } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }))
  }

  const openMoves = async (ingId: string) => {
    setMovesFor(ingId)
    setMovTypeFilter(null); setMovFrom(''); setMovTo(''); setMovPage(1)
    setLedger(await fetchLedger(ingId, { page: 1, pageSize: 20 }))
  }

  const handleRecordMovement = async () => {
    if (!movesFor) return
    const qty = parseFloat(recQty)
    if (isNaN(qty) || qty === 0) return
    if (recType === 'WASTE') await recordWaste(movesFor, Math.abs(qty), recNote || 'تالف')
    else await adjust(movesFor, qty, recNote || 'تسوية يدوية')
    toast({ title: recType === 'WASTE' ? 'تم تسجيل التالف' : 'تمت التسوية', variant: 'success' })
    setRecQty(''); setRecNote('')
    setMovPage(1)
    await loadLedger(movesFor, 1)
  }

  const columns: DataColumn<any>[] = [
    {
      key: 'name', label: 'المادة', render: (ing) => (
        <div className="flex items-center gap-2">
          <Package className={cn("h-4 w-4", alertIds.has(ing.id) ? "text-yellow-500" : "text-muted-foreground")} />
          <span className="font-bold">{ing.name}</span>
          {alertIds.has(ing.id) && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500">⚠️ منخفض</span>}
        </div>
      ),
    },
    { key: 'stock', label: 'المخزون', sortValue: (ing: any) => ing.stockQuantity, render: (ing) => <span className="font-bold">{ing.stockQuantity} / {ing.minStock * 5} {unitLabel[ing.unit] || ing.unit}</span> },
    { key: 'min', label: 'الحد الأدنى', sortValue: (ing: any) => ing.minStock, render: (ing) => <span>{ing.minStock} {unitLabel[ing.unit] || ing.unit}</span> },
    {
      key: 'cost', label: 'التكلفة', sortValue: (ing: any) => ing.costPerUnit, render: (ing) => {
        const pack = Number(ing.purchaseQty) || 1
        const packPrice = (Number(ing.costPerUnit) || 0) * pack
        return pack > 1
          ? <span title={`${fmtMoney(ing.costPerUnit)} ج.م/${unitLabel[ing.unit] || ing.unit}`}>{fmtMoney(packPrice)} ج.م / {pack} {unitLabel[ing.unit] || ing.unit}</span>
          : <span>{fmtMoney(ing.costPerUnit)} ج.م/{unitLabel[ing.unit] || ing.unit}</span>
      },
    },
    {
      key: 'actions', label: 'إجراءات', className: 'text-left', render: (ing) => (
        <div className="flex items-center gap-1.5">
          {restockId === ing.id ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <input type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="الكمية"
                className="w-20 h-11 px-2 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
              <input type="number" value={restockUnitCost} onChange={e => setRestockUnitCost(e.target.value)} placeholder="سعر العبوة"
                className="w-20 h-11 px-2 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" title="سعر العبوة كما تشتريها — تُقسم على حجم العبوة تلقائياً" />
              <input value={restockSupplier} onChange={e => setRestockSupplier(e.target.value)} placeholder="المورد"
                className="w-24 h-11 px-2 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" title="اسم المورد" />
              <Button className="rounded-xl h-11 px-4 text-sm font-bold" onClick={handleRestock}>تأكيد</Button>
              <Button variant="ghost" className="rounded-xl h-11 px-3 text-sm" onClick={() => { setRestockId(null); setRestockUnitCost(''); setRestockSupplier('') }}>إلغاء</Button>
            </div>
          ) : (
            <>
              <Button variant="ghost" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => openMoves(ing.id)}><History className="h-4 w-4" /> السجل</Button>
              <Button variant="ghost" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => startEditIng(ing)}><Pencil className="h-4 w-4" /> تعديل</Button>
              <Button variant="outline" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => { setRestockId(ing.id); setRestockQty('') }}>
                <Plus className="h-4 w-4" /> تعبئة
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-black">المخزون</h2>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary">
            <button
              type="button"
              onClick={() => setInvTab('ingredients')}
              className={cn("px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer", invTab === 'ingredients' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              المواد ({ingredients.length})
            </button>
            <button
              type="button"
              onClick={() => setInvTab('sub-recipes')}
              className={cn("px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer", invTab === 'sub-recipes' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              وصفات فرعية
            </button>
          </div>
        </div>
        {invTab === 'ingredients' ? (
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { showIngForm ? resetIngForm() : setShowIngForm(true); setEditIngId(null) }}>
              {showIngForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showIngForm ? 'إغلاق' : 'إضافة مادة'}
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">مكونات مُحضَّرة تُعاد جاهزة للاستخدام داخل الوصفات</p>
        )}
      </div>

      {invTab === 'sub-recipes' ? (
        <SubRecipesSection />
      ) : (
      <>
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mx-5 mt-3 p-3 bg-yellow-500/10 border-2 border-yellow-500/30 rounded-xl flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
          <p className="text-xs font-bold text-yellow-500">⚠️ {alerts.length} مواد تحت الحد الأدنى: {alerts.map(a => a.name).join('، ')}</p>
        </div>
      )}

      {/* PPV feedback */}
      {lastPpv && (
        <div className="mx-5 mt-3 p-3 rounded-xl flex items-center gap-2 border-2 animate-slide-up"
          style={{ borderColor: lastPpv.ppv <= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)', background: lastPpv.ppv <= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
          {lastPpv.ppv <= 0
            ? <TrendingDown className="h-4 w-4 text-green-500 shrink-0" />
            : <TrendingUp className="h-4 w-4 text-red-500 shrink-0" />}
          <p className="text-xs font-bold text-foreground">
            {lastPpv.name}: {lastPpv.ppv < 0
              ? <>شراء بسعر أقل من القياسي — وفّرت <b className="text-green-500">{fmtMoney(Math.abs(lastPpv.ppv))} ج.م</b></>
              : lastPpv.ppv > 0
                ? <>سعر الشراء أعلى من القياسي — انحراف <b className="text-red-500">{fmtMoney(lastPpv.ppv)} ج.م</b>، فكّر في تعديل سعر البيع</>
                : 'سعر الشراء مطابق للتكلفة القياسية'}
          </p>
          <button className="ms-auto text-muted-foreground hover:text-foreground font-black cursor-pointer" onClick={() => setLastPpv(null)}>×</button>
        </div>
      )}

      {/* Ingredient form */}
      {(showIngForm || editIngId) && (
        <div className="mx-5 mt-3 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-2 gap-3">
            <input value={ingForm.name} onChange={e => setIngForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المادة" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
            <EmojiPicker value={ingForm.emoji} onChange={emoji => setIngForm(f => ({ ...f, emoji }))} />
            <Select value={ingForm.unit} onValueChange={v => setIngForm(f => ({ ...f, unit: v, purchaseQty: v === 'g' ? '1000' : '1' }))}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="g">جرام (g)</SelectItem>
                <SelectItem value="kg">كيلو (kg)</SelectItem>
                <SelectItem value="ml">مليلتر (ml)</SelectItem>
                <SelectItem value="l">لتر (l)</SelectItem>
                <SelectItem value="pcs">قطعة (pcs)</SelectItem>
              </SelectContent>
            </Select>
            <input type="number" value={ingForm.stockQuantity} onChange={e => setIngForm(f => ({ ...f, stockQuantity: e.target.value }))} placeholder="الكمية الحالية" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" disabled={!!editIngId} />
            <input type="number" value={ingForm.minStock} onChange={e => setIngForm(f => ({ ...f, minStock: e.target.value }))} placeholder="الحد الأدنى" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            <input type="number" value={ingForm.purchaseQty} onChange={e => setIngForm(f => ({ ...f, purchaseQty: e.target.value }))} placeholder="حجم العبوة"
              className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" title="حجم العبوة بالوحدة نفسها — مثال: كيس 1 كجم من مادة بالجرام = 1000" />
            <input type="number" value={ingForm.packagePrice} onChange={e => setIngForm(f => ({ ...f, packagePrice: e.target.value }))} placeholder="سعر العبوة (ج.م)"
              className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none col-span-2" title="السعر كما يُكتب على الفاتورة — التكلفة لكل وحدة تُحسب تلقائياً" />
          </div>
          <p className="text-[11px] text-muted-foreground">التكلفة لكل وحدة تُحسب تلقائياً من سعر العبوة — تُستخدم في تكلفة الوصفة، السعر المقترح، وتقارير الأرباح والمخزون</p>
          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl" onClick={editIngId ? handleUpdateIng : handleCreateIng}>{editIngId ? 'تحديث' : 'إضافة'}</Button>
            {editIngId && <Button variant="ghost" className="rounded-xl" onClick={resetIngForm}>إلغاء</Button>}
          </div>
        </div>
      )}

      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث عن مادة..."
        view={view}
        onViewChange={setView}
        filters={[
          { value: null, label: 'الكل', count: ingredients.length },
          { value: 'low', label: 'تحت الحد', count: alerts.length },
          { value: 'ok', label: 'بالمخزون', count: ingredients.length - alerts.length },
        ]}
        filterValue={stockFilter}
        onFilterChange={(v) => { setStockFilter(v); list.setPage(1) }}
      />

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable
            columns={columns}
            data={list.items}
            keyExtractor={(ing) => ing.id}
            rowClassName={(ing) => alertIds.has(ing.id) ? "bg-yellow-500/5" : ""}
            sort={list.sort}
            onSortChange={list.setSort}
          />
        </div>
      ) : (
        <ScrollArea className="flex-1 p-5">
          <div className="space-y-2">
            {list.items.map(ing => {
              const isLow = alertIds.has(ing.id)
              const percentage = ing.minStock > 0 ? (ing.stockQuantity / (ing.minStock * 5)) * 100 : 100
              return (
                <div key={ing.id} className={cn("border-2 rounded-xl bg-card p-4 flex items-center gap-4", isLow && "border-yellow-500/30")}>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isLow ? "bg-yellow-500/10" : "bg-secondary")}>
                    <Package className={cn("h-5 w-5", isLow ? "text-yellow-500" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{ing.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", isLow ? "bg-yellow-500" : "bg-primary")} style={{ width: `${Math.min(percentage, 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-muted-foreground w-20 text-left">{ing.stockQuantity} / {ing.minStock * 5} {ing.unit}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">الحد الأدنى: {ing.minStock} {ing.unit}</p>
                    {(() => {
                      const pack = Number(ing.purchaseQty) || 1
                      const packPrice = (Number(ing.costPerUnit) || 0) * pack
                      return pack > 1
                        ? <p className="text-xs text-muted-foreground" title={`${fmtMoney(ing.costPerUnit)} ج.م/${ing.unit}`}>التكلفة: {fmtMoney(packPrice)} ج.م / {pack} {ing.unit}</p>
                        : <p className="text-xs text-muted-foreground">التكلفة: {fmtMoney(ing.costPerUnit)} ج.م/{ing.unit}</p>
                    })()}
                    {ing.supplier && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 justify-end">
                        <ShieldAlert className={cn("h-3 w-3", ing.secondarySupplier ? "text-muted-foreground" : "text-orange-400")} />
                        المورد: {ing.supplier}
                        {ing.secondarySupplier ? ` / ${ing.secondarySupplier}` : <span className="text-orange-400 font-bold"> (بدون مورد ثانٍ)</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button variant="ghost" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => openMoves(ing.id)}><History className="h-4 w-4" /> السجل</Button>
                    <Button variant="ghost" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => startEditIng(ing)}><Pencil className="h-4 w-4" /> تعديل</Button>
                    {restockId === ing.id ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <input type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="الكمية" className="w-20 h-11 px-2 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
                        <input type="number" value={restockUnitCost} onChange={e => setRestockUnitCost(e.target.value)} placeholder="سعر العبوة" className="w-20 h-11 px-2 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" title="سعر العبوة كما تشتريها — تُقسم على حجم العبوة تلقائياً" />
                        <input value={restockSupplier} onChange={e => setRestockSupplier(e.target.value)} placeholder="المورد" className="w-24 h-11 px-2 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" title="اسم المورد" />
                        <Button className="rounded-xl h-11 px-4 text-sm font-bold" onClick={handleRestock}>تأكيد</Button>
                        <Button variant="ghost" className="rounded-xl h-11 px-3 text-sm" onClick={() => { setRestockId(null); setRestockUnitCost(''); setRestockSupplier('') }}>إلغاء</Button>
                      </div>
                    ) : (
                      <Button variant="outline" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => { setRestockId(ing.id); setRestockQty('') }}>
                        <Plus className="h-4 w-4" /> تعبئة
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
            {list.items.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-10">لا توجد مواد مطابقة</p>
            )}
          </div>
        </ScrollArea>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />
      </>
      )}

      {/* Inventory movements drawer */}
      {movesFor && ledger && (
        <div className="fixed inset-0 z-50" onClick={() => setMovesFor(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />
          <div className="absolute top-0 right-0 h-full w-full max-w-[44rem] border-l border-border bg-card shadow-2xl flex flex-col animate-slide-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-black text-lg">حركة المخزون</h3>
                {ledger.ingredient && <p className="text-xs text-muted-foreground">{ledger.ingredient.emoji} {ledger.ingredient.name} — {unitLabel[ledger.ingredient.unit] || ledger.ingredient.unit} · الرصيد {ledger.currentStock}</p>}
              </div>
              <Button variant="ghost" size="icon" className="rounded-xl h-11 w-11" onClick={() => setMovesFor(null)}><X className="h-5 w-5" /></Button>
            </div>

            <div className="px-5 pt-4 space-y-3">
              {/* Quick record — bigger form */}
              <div className="rounded-2xl border-2 border-border p-4 space-y-3">
                <p className="text-xs font-bold">تسجيل حركة يدوية:</p>
                <div className="flex gap-2">
                  <Select value={recType} onValueChange={v => setRecType(v as 'WASTE' | 'ADJUSTMENT')}>
                    <SelectTrigger className="h-12 rounded-xl font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WASTE">تالف</SelectItem>
                      <SelectItem value="ADJUSTMENT">تسوية</SelectItem>
                    </SelectContent>
                  </Select>
                  <input type="number" value={recQty} onChange={e => setRecQty(e.target.value)} placeholder={recType === 'ADJUSTMENT' ? 'الكمية (±)' : 'الكمية'}
                    className="flex-1 h-12 px-3 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
                  <Button className="rounded-xl h-12 px-5 text-sm font-bold" onClick={handleRecordMovement}>إضافة</Button>
                </div>
                <input value={recNote} onChange={e => setRecNote(e.target.value)} placeholder="ملاحظة (اختياري)" dir="rtl"
                  className="w-full h-11 px-3 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
              </div>

              {/* Type + date filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1.5">
                  {[{ value: null, label: 'الكل' }, { value: 'PURCHASE', label: 'شراء' }, { value: 'CONSUMPTION', label: 'بيع' }, { value: 'WASTE', label: 'تالف' }, { value: 'ADJUSTMENT', label: 'تسوية' }].map(f => (
                    <button key={f.label} onClick={() => { setMovTypeFilter(f.value); setMovPage(1); if (movesFor) loadLedger(movesFor, 1, f.value, movFrom, movTo) }}
                      className={cn("h-9 px-3 rounded-full text-[11px] font-bold cursor-pointer transition-all border",
                        movTypeFilter === f.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/60 text-muted-foreground border-transparent hover:text-foreground")}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 mr-auto">
                  <DatePicker value={movFrom} onChange={(v) => { setMovFrom(v); setMovPage(1); if (movesFor) loadLedger(movesFor, 1, movTypeFilter, v, movTo) }} placeholder="من" className="w-36" />
                  <span className="text-[10px] text-muted-foreground">إلى</span>
                  <DatePicker value={movTo} onChange={(v) => { setMovTo(v); setMovPage(1); if (movesFor) loadLedger(movesFor, 1, movTypeFilter, movFrom, v) }} placeholder="إلى" className="w-36" />
                  {(movFrom || movTo || movTypeFilter) && (
                    <button onClick={() => { setMovTypeFilter(null); setMovFrom(''); setMovTo(''); setMovPage(1); if (movesFor) loadLedger(movesFor, 1, null, '', '') }}
                      className="h-9 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">مسح</button>
                  )}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-5 space-y-4">
                {/* Ledger */}
                <div className="rounded-2xl border border-border overflow-hidden">
                  <div className="grid grid-cols-[72px_1fr_72px_72px] gap-2 px-3 py-2 bg-secondary/60 text-[11px] font-bold text-muted-foreground">
                    <span>التاريخ</span>
                    <span>النوع</span>
                    <span className="text-center">الكمية</span>
                    <span className="text-left">الرصيد</span>
                  </div>
                  {ledger.movements.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">لا توجد حركات مطابقة</p>
                  ) : (
                    ledger.movements.map(m => {
                      const meta = typeMeta[m.type] || { label: m.type, cls: 'bg-secondary text-muted-foreground' }
                      const pos = m.quantity > 0
                      return (
                        <div key={m.id} className="grid grid-cols-[72px_1fr_72px_72px] gap-2 items-center px-3 py-2.5 border-t border-border/50 first:border-t-0">
                          <div className="min-w-0">
                            <p className="text-xs font-bold">{m.createdAt.slice(8, 10)}/{m.createdAt.slice(5, 7)}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{m.createdAt.slice(11, 16)}</p>
                          </div>
                          <div className="min-w-0">
                            <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-bold", meta.cls)}>{meta.label}</span>
                            {m.note && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{m.note}</p>}
                            {m.referenceOrderId && <p className="text-[10px] text-primary font-bold truncate mt-0.5">طلب {m.referenceOrderId}</p>}
                          </div>
                          <span className={cn("text-xs font-black text-center", pos ? "text-green-600" : m.quantity < 0 ? "text-red-600" : "text-muted-foreground")}>
                            {pos ? '+' : ''}{m.quantity}
                          </span>
                          <span className="text-xs font-black text-left">{m.balance ?? '—'} {unitLabel[ledger.ingredient?.unit || ''] || ''}</span>
                        </div>
                      )
                    })
                  )}
                  {ledger.movements.length > 0 && (
                    <div className="flex items-center justify-between px-3 py-2.5 border-t bg-secondary/40">
                      <span className="text-[11px] text-muted-foreground">رصيد افتتاحي: {ledger.openingBalance} {unitLabel[ledger.ingredient?.unit || ''] || ''}</span>
                      <span className="text-xs font-black text-primary">الرصيد الختامي: {ledger.currentStock} {unitLabel[ledger.ingredient?.unit || ''] || ''}</span>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>

            {/* Pagination */}
            {ledger.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t">
                <span className="text-[11px] text-muted-foreground font-bold">عرض {ledger.movements.length} من {ledger.total} · صفحة {ledger.page}/{ledger.totalPages}</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { const p = Math.max(1, movPage - 1); setMovPage(p); if (movesFor) loadLedger(movesFor, p) }}
                    disabled={movPage <= 1}
                    className="h-9 px-3 rounded-lg bg-secondary/60 text-xs font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-secondary transition-colors">السابق</button>
                  <button onClick={() => { const p = Math.min(ledger.totalPages, movPage + 1); setMovPage(p); if (movesFor) loadLedger(movesFor, p) }}
                    disabled={movPage >= ledger.totalPages}
                    className="h-9 px-3 rounded-lg bg-secondary/60 text-xs font-bold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-secondary transition-colors">التالي</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
