import { useEffect, useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import type { ConsumptionRow, ConsumptionSummary } from '@/services/inventory/inventory.types'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'
import { CalendarDays, Calculator, Flame, History, Package, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { daysAgo, monthStart, today, weekStart } from '@/lib/dates'
import { categoryLabel, storageLabel, type InventoryCategoryId } from '@/lib/inventory-taxonomy'
import { BackfillConsumptionDialog } from './BackfillConsumptionDialog'

const unitLabel: Record<string, string> = { g: 'جرام', kg: 'كيلو', ml: 'مليلتر', l: 'لتر', pcs: 'قطعة' }

const PRESETS = [
  { id: 'today', label: 'اليوم', range: () => ({ from: today(), to: today() }) },
  { id: '7d', label: 'آخر 7 أيام', range: () => ({ from: daysAgo(6), to: today() }) },
  { id: 'week', label: 'هذا الأسبوع', range: () => ({ from: weekStart(), to: today() }) },
  { id: 'month', label: 'هذا الشهر', range: () => ({ from: monthStart(), to: today() }) },
  { id: '30d', label: 'آخر 30 يوم', range: () => ({ from: daysAgo(29), to: today() }) },
]

const filterTriggerClass = 'h-8 w-auto gap-1 px-3 rounded-full bg-secondary/60 text-[11px] font-bold text-foreground [&>span]:truncate'

const fmtQty = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`
}

export function ConsumptionSection({ onOpenLedger }: {
  onOpenLedger: (ingredientId: string, opts?: { type?: string; from?: string; to?: string }) => void
}) {
  const fetchConsumption = useInventoryStore((s) => s.fetchConsumption)
  const [preset, setPreset] = useState('month')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [summary, setSummary] = useState<ConsumptionSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backfillOpen, setBackfillOpen] = useState(false)

  const load = async (f: string, t: string) => {
    setLoading(true)
    setError(null)
    try {
      setSummary(await fetchConsumption(f || undefined, t || undefined))
    } catch (err: any) {
      setError(err?.message || 'فشل تحميل الاستهلاك')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(monthStart(), today()) }, [])

  const applyPreset = (id: string) => {
    setPreset(id)
    if (id === 'custom') return
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    const range = p.range()
    setFrom(range.from)
    setTo(range.to)
    void load(range.from, range.to)
  }

  const applyCustom = (f: string, t: string) => {
    if (!f || !t) return
    if (f > t) {
      setTo(f)
      void load(f, f)
      return
    }
    void load(f, t)
  }

  const list = useListControls({
    items: summary?.rows ?? [],
    searchText: (r) => `${r.name} ${categoryLabel(r.category)} ${storageLabel(r.storage)} ${unitLabel[r.unit] || ''}`,
    pageSize: 10,
  })

  const columns: DataColumn<ConsumptionRow>[] = [
    {
      key: 'name', label: 'المادة', render: (r) => (
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className={cn("text-sm font-bold", !r.active && "text-muted-foreground line-through")}>{r.name}</p>
            <p className="text-[10px] text-muted-foreground">{categoryLabel(r.category as InventoryCategoryId)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'consumed', label: 'المستهلك', sortValue: (r) => r.consumed, render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-bold">{fmtQty(r.consumed)} {unitLabel[r.unit] || r.unit}</span>
          {r.orderCount > 0 && <span className="text-[10px] text-muted-foreground">من {r.orderCount} طلب</span>}
        </div>
      ),
    },
    {
      key: 'waste', label: 'تالف', sortValue: (r) => r.waste, render: (r) => r.waste > 0 ? (
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-amber-400">{fmtQty(r.waste)} {unitLabel[r.unit] || r.unit}</span>
          <span className="text-[10px] text-muted-foreground">{fmtMoney(r.wasteCost)} ج.م</span>
        </div>
      ) : <span className="text-[11px] text-muted-foreground">—</span>,
    },
    { key: 'cost', label: 'التكلفة', sortValue: (r) => r.cost, render: (r) => <span className="font-black text-primary">{fmtMoney(r.cost)} ج.م</span> },
    {
      key: 'avg', label: 'المتوسط اليومي', sortValue: (r) => r.avgDaily, render: (r) => (
        <span className="font-bold">{fmtQty(r.avgDaily)} <span className="text-[10px] font-medium text-muted-foreground">{unitLabel[r.unit] || r.unit}/يوم</span></span>
      ),
    },
    {
      key: 'cover', label: 'تغطية المخزون', sortValue: (r) => r.daysCover ?? Number.POSITIVE_INFINITY, render: (r) => {
        if (r.daysCover == null) return <span className="text-[11px] text-muted-foreground">—</span>
        const days = Math.round(r.daysCover)
        return (
          <span className={cn("font-bold", days < 7 ? "text-red-400" : days < 14 ? "text-yellow-400" : "text-green-400")}>
            {days} يوم
          </span>
        )
      },
    },
    {
      key: 'last', label: 'آخر استهلاك', sortValue: (r) => r.lastConsumedAt || '', render: (r) => (
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{r.lastConsumedAt ? fmtWhen(r.lastConsumedAt) : '—'}</span>
      ),
    },
    {
      key: 'actions', label: 'إجراءات', render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg gap-1.5 text-xs font-bold"
          onClick={() => onOpenLedger(r.ingredientId, { type: 'CONSUMPTION', from, to })}
        >
          <History className="h-3.5 w-3.5" /> السجل
        </Button>
      ),
    },
  ]

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث بالاسم أو القسم..."
      >
        <Select value={preset} onValueChange={applyPreset}>
          <SelectTrigger className={filterTriggerClass} title="فترة المتابعة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
            <SelectItem value="custom">مخصص</SelectItem>
          </SelectContent>
        </Select>
        {preset === 'custom' && (
          <>
            <DatePicker value={from} onChange={(v) => { setFrom(v); applyCustom(v, to) }} placeholder="من" className="w-36" />
            <span className="text-[10px] text-muted-foreground">إلى</span>
            <DatePicker value={to} onChange={(v) => { setTo(v); applyCustom(from, v) }} placeholder="إلى" className="w-36" />
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-full gap-1.5 text-[11px] font-bold"
          onClick={() => setBackfillOpen(true)}
          title="احتساب استهلاك الأوردرات القديمة اللي مالهاش حركة"
        >
          <Calculator className="h-3.5 w-3.5" /> احتساب قديم
        </Button>
      </ListToolbar>

      {(summary || error) && (
        <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
          {summary && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-bold">
                <TrendingDown className="h-3.5 w-3.5 text-primary" />
                تكلفة الاستهلاك <b className="text-primary">{fmtMoney(summary.totals.cost)} ج.م</b>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-bold">
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                تالف <b className="text-amber-400">{fmtMoney(summary.totals.wasteCost)} ج.م</b>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-bold">
                {summary.totals.ingredients} مادة مستهلكة
              </span>
              {summary.days != null && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" /> {summary.days} يوم
                </span>
              )}
            </>
          )}
          {error && <span className="text-[11px] font-bold text-destructive">{error}</span>}
        </div>
      )}

      <div className="flex-1 p-5 overflow-auto">
        {loading && !summary ? (
          <p className="py-10 text-center text-xs text-muted-foreground animate-pulse">جارٍ تحميل الاستهلاك…</p>
        ) : (
          <DataTable
            columns={columns}
            data={list.items}
            keyExtractor={(r) => r.ingredientId}
            emptyText="مفيش استهلاك مسجل في الفترة دي"
            sort={list.sort}
            onSortChange={list.setSort}
            exportName="ingredient-consumption"
          />
        )}
      </div>

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />

      <BackfillConsumptionDialog
        open={backfillOpen}
        onClose={() => setBackfillOpen(false)}
        onDone={() => void load(from, to)}
      />
    </div>
  )
}
