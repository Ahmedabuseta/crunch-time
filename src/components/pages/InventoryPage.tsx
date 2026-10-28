import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import type { InventoryLedger } from '@/services/inventory/inventory.types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Package, AlertTriangle, Pencil, X, History, TrendingDown, TrendingUp, ShieldAlert, Power, PowerOff, Trash2, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { monthStart, today } from '@/lib/dates'
import { fmtMoney } from '@/lib/format'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { toast } from '@/components/ui/toast'
import type { ViewMode } from '@/components/ui/view-toggle'
import { SubRecipesSection } from './SubRecipesSection'
import { ConsumptionSection } from './ConsumptionSection'
import { IngredientDialog } from './IngredientDialog'
import { RestockDialog } from './RestockDialog'
import { InventoryHelpDialog } from './InventoryHelpDialog'
import { Emoji } from '@/components/Emoji'
import {
  INVENTORY_CATEGORIES,
  STORAGE_OPTIONS,
  categoryForIngredient,
  categoryLabel,
  storageForIngredient,
  storageLabel,
  type InventoryCategoryId,
  type InventoryStorageId,
} from '@/lib/inventory-taxonomy'

const unitLabel: Record<string, string> = { g: 'جرام', kg: 'كيلو', ml: 'مليلتر', l: 'لتر', pcs: 'قطعة' }

const CATEGORY_TONES: Record<string, string> = {
  protein: 'bg-red-500/10 text-red-400',
  dairy: 'bg-yellow-500/10 text-yellow-400',
  produce: 'bg-green-500/10 text-green-400',
  frozen: 'bg-blue-500/10 text-blue-400',
  sauces: 'bg-orange-500/10 text-orange-400',
  dry: 'bg-amber-500/10 text-amber-400',
  packaging: 'bg-purple-500/10 text-purple-400',
  other: 'bg-secondary text-muted-foreground',
}

const filterTriggerClass = 'h-8 w-auto gap-1 px-3 rounded-full bg-secondary/60 text-[11px] font-bold text-foreground [&>span]:truncate'

const itemCategory = (ing: any): InventoryCategoryId =>
  ing?.category || categoryForIngredient(ing?.id || '')

const itemStorage = (ing: any): InventoryStorageId =>
  ing?.storage || storageForIngredient(ing?.id || '')

const fmtQty = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

const typeMeta: Record<string, { label: string; cls: string }> = {
  PURCHASE: { label: 'شراء', cls: 'bg-green-500/10 text-green-600' },
  CONSUMPTION: { label: 'بيع', cls: 'bg-red-500/10 text-red-600' },
  WASTE: { label: 'تالف', cls: 'bg-amber-500/10 text-amber-600' },
  ADJUSTMENT: { label: 'تسوية', cls: 'bg-blue-500/10 text-blue-600' },
}

export function InventoryPage() {
  const ingredients = useInventoryStore((s) => s.allIngredients)
  const alerts = useInventoryStore((s) => s.alerts)
  const fetchIngredients = useInventoryStore((s) => s.fetchIngredients)
  const fetchAlerts = useInventoryStore((s) => s.fetchAlerts)
  const recordWaste = useInventoryStore((s) => s.recordWaste)
  const adjust = useInventoryStore((s) => s.adjust)
  const fetchLedger = useInventoryStore((s) => s.fetchLedger)
  const removeIngredient = useInventoryStore((s) => s.removeIngredient)
  const setIngredientActive = useInventoryStore((s) => s.setIngredientActive)

  const [invTab, setInvTab] = useState<'ingredients' | 'consumption' | 'sub-recipes'>('ingredients')
  const [ingDialog, setIngDialog] = useState<{ ingredient: any | null } | null>(null)
  const [restockTarget, setRestockTarget] = useState<any | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [view, setView] = useState<ViewMode>('table')
  const [statusFilter, setStatusFilter] = useState<'low' | 'high' | 'ok' | 'noCost' | 'unused' | 'inactive' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [linkedFor, setLinkedFor] = useState<any | null>(null)
  const [linkedProducts, setLinkedProducts] = useState<{ id: string; name: string; emoji: string; active: boolean; inBase: boolean; links: string[] }[]>([])
  const [linkedLoading, setLinkedLoading] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [storageFilter, setStorageFilter] = useState<string | null>(null)
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null)
  const [movesFor, setMovesFor] = useState<string | null>(null)
  const [ledger, setLedger] = useState<(InventoryLedger & { total: number; page: number; pageSize: number; totalPages: number }) | null>(null)
  const [recType, setRecType] = useState<'WASTE' | 'ADJUSTMENT'>('WASTE')
  const [recQty, setRecQty] = useState('')
  const [recNote, setRecNote] = useState('')
  const [lastPpv, setLastPpv] = useState<{ name: string; ppv: number } | null>(null)
  const [movTypeFilter, setMovTypeFilter] = useState<string | null>(null)
  const [movFrom, setMovFrom] = useState(monthStart())
  const [movTo, setMovTo] = useState(today())
  const [movPage, setMovPage] = useState(1)

  useEffect(() => { fetchIngredients(); fetchAlerts() }, [])

  const activeIngredients = ingredients.filter((i) => i.active)
  const inactiveCount = ingredients.length - activeIngredients.length
  const linkedBaseProducts = linkedProducts.filter((p) => p.inBase)
  const linkedOptionalProducts = linkedProducts.filter((p) => !p.inBase)

  const alertIds = new Set(alerts.map(a => a.id))
  const highStockIds = new Set(
    activeIngredients
      .filter((ing) => Number(ing.minStock) > 0 && Number(ing.stockQuantity) > Number(ing.minStock) * 5)
      .map((ing) => ing.id),
  )

  const orderedIngredients = [...ingredients].sort((a, b) => {
    const rank = (ing: any) => !ing.active ? 3 : alertIds.has(ing.id) ? 0 : highStockIds.has(ing.id) ? 2 : 1
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'ar')
  })
  const suppliers = [...new Set(ingredients.map(i => i.supplier).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'ar'))
  const unusedCount = activeIngredients.filter(i => !Number(i.productCount)).length
  const hasActiveFilters = !!(categoryFilter || statusFilter || storageFilter || supplierFilter)

  const list = useListControls({
    items: orderedIngredients,
    searchText: (ing) => `${ing.name} ${categoryLabel(itemCategory(ing))} ${storageLabel(itemStorage(ing))} ${ing.supplier || ''} ${unitLabel[ing.unit] || ''}`,
    filter: (ing) => {
      if (categoryFilter && itemCategory(ing) !== categoryFilter) return false
      if (storageFilter && itemStorage(ing) !== storageFilter) return false
      if (supplierFilter === '__none__') {
        if (ing.supplier) return false
      } else if (supplierFilter && ing.supplier !== supplierFilter) {
        return false
      }
      if (statusFilter === 'inactive') return !ing.active
      if (!ing.active) return !statusFilter
      if (statusFilter === 'noCost') return !(Number(ing.costPerUnit) > 0)
      if (statusFilter === 'unused') return !(Number(ing.productCount) > 0)
      if (statusFilter === 'low') return alertIds.has(ing.id)
      if (statusFilter === 'high') return highStockIds.has(ing.id)
      if (statusFilter === 'ok') return !alertIds.has(ing.id) && !highStockIds.has(ing.id)
      return true
    },
    pageSize: 12,
  })

  const handleToggleActive = async (ing: any) => {
    try {
      await setIngredientActive(ing.id, !ing.active)
      toast({ title: ing.active ? 'تم تعطيل المادة' : 'تم تفعيل المادة', description: ing.name, variant: 'success' })
    } catch (err: any) {
      toast({ title: err?.message || 'فشل تحديث حالة المادة', variant: 'error' })
    }
  }

  const handleDeleteIng = async ({ hard }: { hard: boolean }) => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      if (hard) await removeIngredient(target.id, { hard: true })
      else await setIngredientActive(target.id, false)
      toast({ title: hard ? 'تم الحذف النهائي للمادة' : 'تم تعطيل المادة', description: target.name, variant: 'success' })
    } catch (err: any) {
      toast({ title: err?.message || 'فشل حذف المادة', variant: 'error' })
    }
  }

  const openLinkedProducts = async (ing: any) => {
    setLinkedFor(ing)
    setLinkedProducts([])
    setLinkedLoading(true)
    try {
      setLinkedProducts(await window.api.inventory.listIngredientProducts(ing.id))
    } catch (err: any) {
      toast({ title: err?.message || 'فشل تحميل المنتجات المرتبطة', variant: 'error' })
    } finally {
      setLinkedLoading(false)
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

  const openMoves = async (ingId: string, opts?: { type?: string; from?: string; to?: string }) => {
    setMovesFor(ingId)
    setMovTypeFilter(opts?.type ?? null); setMovFrom(opts?.from ?? ''); setMovTo(opts?.to ?? ''); setMovPage(1)
    setLedger(await fetchLedger(ingId, {
      page: 1, pageSize: 20,
      ...(opts?.type ? { type: opts.type } : {}),
      ...(opts?.from ? { from: opts.from } : {}),
      ...(opts?.to ? { to: opts.to } : {}),
    }))
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

  const renderLinkedProduct = (p: { id: string; name: string; emoji: string; active: boolean; inBase: boolean; links: string[] }) => (
    <div key={p.id} className="rounded-2xl bg-secondary/50 p-3 flex items-start gap-3">
      <Emoji className="text-xl">{p.emoji}</Emoji>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("text-sm font-bold truncate", !p.active && "text-muted-foreground line-through")}>{p.name}</p>
          {!p.active && <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">مخفي</span>}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {p.links.map((link) => (
            <span key={link} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-background/60 text-muted-foreground">{link}</span>
          ))}
        </div>
      </div>
    </div>
  )

  const columns: DataColumn<any>[] = [
    {
      key: 'name', label: 'المادة', render: (ing) => (
        <div className="flex items-center gap-2">
          <Package className={cn("h-4 w-4", !ing.active ? "text-muted-foreground/40" : alertIds.has(ing.id) ? "text-yellow-500" : "text-muted-foreground")} />
          <span className={cn("font-bold", !ing.active && "text-muted-foreground line-through")}>{ing.name}</span>
          {!ing.active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">معطّل</span>}
          {ing.active && alertIds.has(ing.id) && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500">⚠️ تحت الحد</span>}
        </div>
      ),
    },
    {
      key: 'category', label: 'القسم', render: (ing) => {
        const category = itemCategory(ing)
        return (
          <div className="flex flex-col items-start gap-1">
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap", CATEGORY_TONES[category])}>
              {categoryLabel(category)}
            </span>
            <span className="text-[9px] text-muted-foreground">{storageLabel(itemStorage(ing))}</span>
          </div>
        )
      },
    },
    {
      key: 'products', label: 'منتجات', sortValue: (ing: any) => Number(ing.recipeProductCount) || 0, render: (ing) => {
        const base = Number(ing.recipeProductCount) || 0
        const optional = Number(ing.optionalProductCount) || 0
        if (base > 0) {
          return (
            <div className="flex flex-col items-start gap-0.5">
              <button
                type="button"
                onClick={() => openLinkedProducts(ing)}
                title="عرض المنتجات المرتبطة"
                className="font-bold text-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-4 hover:text-primary transition-colors cursor-pointer"
              >
                {base} منتج
              </button>
              {optional > 0 && <span className="text-[9px] font-bold text-muted-foreground">+{optional} كإضافة</span>}
            </div>
          )
        }
        if (optional > 0) {
          return (
            <button
              type="button"
              onClick={() => openLinkedProducts(ing)}
              title="عرض المنتجات المرتبطة"
              className="text-[10px] font-bold text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:text-primary transition-colors cursor-pointer"
            >
              كإضافة في {optional}
            </button>
          )
        }
        return <span className="text-[10px] font-bold text-orange-400">غير مرتبط</span>
      },
    },
    {
      key: 'stock', label: 'المخزون', sortValue: (ing: any) => ing.stockQuantity, render: (ing) => {
        const pack = Number(ing.purchaseQty) || 1
        const packs = pack > 1 ? Number(ing.stockQuantity) / pack : null
        const high = highStockIds.has(ing.id)
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-bold flex items-center gap-1.5">
              {fmtQty(ing.stockQuantity)} {unitLabel[ing.unit] || ing.unit}
              {high && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-500">مرتفع</span>}
            </span>
            {packs != null && <span className="text-[10px] text-muted-foreground">≈ {fmtQty(packs)} عبوة</span>}
            {ing.active && alertIds.has(ing.id) && (
              <span className="text-[10px] font-bold text-yellow-500">ناقص {fmtQty(Number(ing.minStock) - Number(ing.stockQuantity))} {unitLabel[ing.unit] || ing.unit}</span>
            )}
          </div>
        )
      },
    },
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
          <Button variant="ghost" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => openMoves(ing.id)}><History className="h-4 w-4" /> السجل</Button>
          <Button variant="ghost" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => setIngDialog({ ingredient: ing })}><Pencil className="h-4 w-4" /> تعديل</Button>
          {ing.active && (
            <Button variant="outline" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => setRestockTarget(ing)}>
              <Plus className="h-4 w-4" /> تعبئة
            </Button>
          )}
          <Button
            variant="ghost"
            size="touchIcon"
            title={ing.active ? 'تعطيل المادة' : 'تفعيل المادة'}
            onClick={() => handleToggleActive(ing)}
            className={cn("rounded-xl", ing.active ? "text-muted-foreground hover:text-foreground" : "text-green-500 hover:text-green-400")}
          >
            {ing.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="touchIcon" title="حذف المادة" onClick={() => setDeleteTarget(ing)} className="rounded-xl text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),

    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-black">المخزون</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
            title="دليل استخدام المخزون"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
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
              onClick={() => setInvTab('consumption')}
              className={cn("px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer", invTab === 'consumption' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              الاستهلاك
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
        {invTab === 'ingredients' && (
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setIngDialog({ ingredient: null })}>
              <Plus className="h-4 w-4" /> إضافة مادة
            </Button>
          </div>
        )}
        {invTab === 'sub-recipes' && (
          <p className="text-[11px] text-muted-foreground">مكونات مُحضَّرة تُعاد جاهزة للاستخدام داخل الوصفات</p>
        )}
      </div>

      {invTab === 'sub-recipes' ? (
        <SubRecipesSection />
      ) : invTab === 'consumption' ? (
        <ConsumptionSection onOpenLedger={(id, opts) => void openMoves(id, opts)} />
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

      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث بالاسم أو القسم أو المورد..."
        view={view}
        onViewChange={setView}
      >
        <Select
          value={categoryFilter ?? 'all'}
          onValueChange={(v) => { setCategoryFilter(v === 'all' ? null : v); list.setPage(1) }}
        >
          <SelectTrigger className={filterTriggerClass} title="القسم">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام ({ingredients.length})</SelectItem>
            {INVENTORY_CATEGORIES.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.label} ({ingredients.filter(i => itemCategory(i) === c.id).length})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={storageFilter ?? 'all'}
          onValueChange={(v) => { setStorageFilter(v === 'all' ? null : v); list.setPage(1) }}
        >
          <SelectTrigger className={filterTriggerClass} title="التخزين">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التخزين</SelectItem>
            {STORAGE_OPTIONS.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter ?? 'all'}
          onValueChange={(v) => { setStatusFilter((v === 'all' ? null : v) as typeof statusFilter); list.setPage(1) }}
        >
          <SelectTrigger className={filterTriggerClass} title="الحالة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="low">تحت الحد ({alerts.length})</SelectItem>
            <SelectItem value="high">مخزون مرتفع ({highStockIds.size})</SelectItem>
            <SelectItem value="ok">طبيعي</SelectItem>
            <SelectItem value="noCost">بدون تكلفة</SelectItem>
            <SelectItem value="unused">غير مرتبط ({unusedCount})</SelectItem>
            <SelectItem value="inactive">معطّل ({inactiveCount})</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={supplierFilter ?? 'all'}
          onValueChange={(v) => { setSupplierFilter(v === 'all' ? null : v); list.setPage(1) }}
        >
          <SelectTrigger className={filterTriggerClass} title="المورد">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموردين</SelectItem>
            <SelectItem value="__none__">بدون مورد</SelectItem>
            {suppliers.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setCategoryFilter(null); setStatusFilter(null); setStorageFilter(null)
              setSupplierFilter(null); list.setPage(1)
            }}
            className="h-8 px-3 rounded-full text-[11px] font-bold text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          >
            مسح
          </button>
        )}
      </ListToolbar>

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable
            columns={columns}
            data={list.items}
            keyExtractor={(ing) => ing.id}
            rowClassName={(ing) => !ing.active ? "bg-secondary/20" : alertIds.has(ing.id) ? "bg-yellow-500/5" : highStockIds.has(ing.id) ? "bg-orange-500/5" : ""}
            sort={list.sort}
            onSortChange={list.setSort}
          />
        </div>
      ) : (
        <ScrollArea className="flex-1 p-5">
          <div className="space-y-4">
            {INVENTORY_CATEGORIES.map(cat => {
              const items = list.items.filter(ing => itemCategory(ing) === cat.id)
              if (items.length === 0) return null
              return (
                <div key={cat.id} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full", CATEGORY_TONES[cat.id])}>{cat.label}</span>
                      <span className="text-[10px] text-muted-foreground font-bold">{items.length} مادة</span>
                    </div>
                  </div>
                  {items.map(ing => {
              const isLow = alertIds.has(ing.id)
              const isHigh = highStockIds.has(ing.id)
              const pack = Number(ing.purchaseQty) || 1
              const packs = pack > 1 ? Number(ing.stockQuantity) / pack : null
              const percentage = ing.minStock > 0 ? (ing.stockQuantity / (ing.minStock * 5)) * 100 : 100
              return (
                <div key={ing.id} className={cn("border-2 rounded-xl bg-card p-4 flex items-center gap-4", !ing.active ? "opacity-60" : isLow ? "border-yellow-500/30" : isHigh && "border-orange-500/30")}>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isHigh ? "bg-orange-500/10" : isLow ? "bg-yellow-500/10" : "bg-secondary")}>
                    <Package className={cn("h-5 w-5", isHigh ? "text-orange-500" : isLow ? "text-yellow-500" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold flex items-center gap-1.5">
                      {ing.name}
                      {!ing.active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">معطّل</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{storageLabel(itemStorage(ing))}</p>
                    {Number(ing.recipeProductCount) > 0 ? (
                      <button
                        type="button"
                        onClick={() => openLinkedProducts(ing)}
                        title="عرض المنتجات المرتبطة"
                        className="text-[10px] font-bold mt-0.5 text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:text-primary transition-colors cursor-pointer"
                      >
                        مرتبط بـ {ing.recipeProductCount} منتج
                        {Number(ing.optionalProductCount) > 0 ? ` · +${ing.optionalProductCount} كإضافة` : ''}
                      </button>
                    ) : Number(ing.optionalProductCount) > 0 ? (
                      <button
                        type="button"
                        onClick={() => openLinkedProducts(ing)}
                        title="عرض المنتجات المرتبطة"
                        className="text-[10px] font-bold mt-0.5 text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:text-primary transition-colors cursor-pointer"
                      >
                        كإضافة في {ing.optionalProductCount} منتج
                      </button>
                    ) : (
                      <p className="text-[10px] font-bold mt-0.5 text-orange-400">غير مرتبط بأي منتج</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", isHigh ? "bg-orange-500" : isLow ? "bg-yellow-500" : "bg-primary")} style={{ width: `${Math.min(percentage, 100)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-muted-foreground w-24 text-left">{fmtQty(ing.stockQuantity)} {ing.unit}</span>
                    </div>
                    {packs != null && <p className="text-[10px] text-muted-foreground mt-0.5">≈ {fmtQty(packs)} عبوة</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">الحد الأدنى: {ing.minStock} {ing.unit}</p>
                    {ing.active && isLow && <p className="text-[10px] text-yellow-500 font-bold mt-0.5">تحت الحد الأدنى — ناقص {fmtQty(Number(ing.minStock) - Number(ing.stockQuantity))} {unitLabel[ing.unit] || ing.unit}</p>}
                    {isHigh && <p className="text-[10px] text-orange-500 font-bold mt-0.5">مخزون مرتفع</p>}
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
                    <Button variant="ghost" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => setIngDialog({ ingredient: ing })}><Pencil className="h-4 w-4" /> تعديل</Button>
                    {ing.active && (
                      <Button variant="outline" className="rounded-xl h-11 px-3 text-xs font-bold gap-1.5" onClick={() => setRestockTarget(ing)}>
                        <Plus className="h-4 w-4" /> تعبئة
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="touchIcon"
                      title={ing.active ? 'تعطيل المادة' : 'تفعيل المادة'}
                      onClick={() => handleToggleActive(ing)}
                      className={cn("rounded-xl", ing.active ? "text-muted-foreground hover:text-foreground" : "text-green-500 hover:text-green-400")}
                    >
                      {ing.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="touchIcon" title="حذف المادة" onClick={() => setDeleteTarget(ing)} className="rounded-xl text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="حذف المادة"
        description={deleteTarget ? `تعطيل «${deleteTarget.name}» يخفيه من القوائم والوصفات الجديدة مع الحفاظ على سجل الحركات.` : undefined}
        confirmLabel="تعطيل"
        allowHardDelete
        hardDeleteDescription="يحذف المادة من قاعدة البيانات نهائياً. متاح فقط لو مفيش حركات مخزون أو ارتباطات بوصفات."
        onConfirm={handleDeleteIng}
        onCancel={() => setDeleteTarget(null)}
      />

      {ingDialog && (
        <IngredientDialog ingredient={ingDialog.ingredient} onClose={() => setIngDialog(null)} />
      )}

      {restockTarget && (
        <RestockDialog
          ingredient={restockTarget}
          onClose={() => setRestockTarget(null)}
          onDone={({ name, ppv }) => { if (ppv != null) setLastPpv({ name, ppv }) }}
        />
      )}

      <InventoryHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {linkedFor && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setLinkedFor(null)}>
          <div
            dir="rtl"
            className="bg-card border-2 rounded-3xl shadow-2xl w-[460px] max-w-[92vw] max-h-[80vh] flex flex-col overflow-hidden animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b">
              <div className="min-w-0">
                <h3 className="font-black text-base">المنتجات المرتبطة</h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  <Emoji>{linkedFor.emoji}</Emoji> {linkedFor.name} ·{' '}
                  {linkedLoading ? '…' : `${linkedBaseProducts.length} داخل الوصفة · ${linkedOptionalProducts.length} كإضافة`}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={() => setLinkedFor(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-3 overflow-y-auto space-y-3">
              {linkedLoading ? (
                <p className="py-8 text-center text-xs text-muted-foreground">جارٍ التحميل…</p>
              ) : linkedProducts.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">لا توجد منتجات مرتبطة</p>
              ) : (
                <>
                  {linkedBaseProducts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-1 text-[10px] font-black text-muted-foreground">داخل وصفة المنتج ({linkedBaseProducts.length})</p>
                      {linkedBaseProducts.map(renderLinkedProduct)}
                    </div>
                  )}
                  {linkedOptionalProducts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-1 text-[10px] font-black text-muted-foreground">متاح كإضافة أو خيار ({linkedOptionalProducts.length})</p>
                      {linkedOptionalProducts.map(renderLinkedProduct)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Inventory movements drawer */}
      {movesFor && ledger && (
        <div className="fixed inset-0 z-50" onClick={() => setMovesFor(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />
          <div className="absolute top-0 right-0 h-full w-full max-w-[44rem] border-l border-border bg-card shadow-2xl flex flex-col animate-slide-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="font-black text-lg">حركة المخزون</h3>
                {ledger.ingredient && <p className="text-xs text-muted-foreground"><Emoji>{ledger.ingredient.emoji}</Emoji> {ledger.ingredient.name} — {unitLabel[ledger.ingredient.unit] || ledger.ingredient.unit} · الرصيد {ledger.currentStock}</p>}
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
