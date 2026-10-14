import { useEffect, useState } from 'react'
import { useReportStore } from '@/services/report/report.store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DatePicker } from '@/components/ui/date-picker'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ChartContainer, ChartTooltip, chartColor } from '@/components/ui/chart'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { LucideIcon } from 'lucide-react'
import {
  TrendingUp, ShoppingBag, DollarSign, BarChart3, Package, ArrowDownRight, ArrowUpRight,
  Receipt, Wallet, Hourglass, Layers, CreditCard, CalendarDays, Filter, Tag,
  AlertTriangle, Users, Target, CalendarClock, Boxes, ShieldAlert, TrendingDown, Percent,
  RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Lock, Unlock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable, sortRows, type SortState } from '@/components/ui/data-table'
import { Emoji } from '@/components/Emoji'

const pad = (n: number) => String(n).padStart(2, '0')
const fmtLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = () => fmtLocal(new Date())
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return fmtLocal(d) }
const monthStart = () => fmtLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return fmtLocal(d) }

const formatDuration = (hours: number): string => {
  if (hours < 1 / 60) return '0'
  if (hours < 1) return `${Math.round(hours * 60)} دقيقة`
  if (hours < 24) return `${Math.round(hours * 10) / 10} ساعة`
  return `${Math.round(hours / 24 * 10) / 10} يوم`
}

type Range = { from?: string; to?: string }

const PRESETS: { id: string; label: string; days: number; range: () => Range }[] = [
  { id: 'today', label: 'اليوم', days: 7, range: () => ({ from: today(), to: today() }) },
  { id: 'yesterday', label: 'أمس', days: 7, range: () => ({ from: daysAgo(1), to: daysAgo(1) }) },
  { id: '7d', label: 'آخر 7 أيام', days: 7, range: () => ({ from: daysAgo(6), to: today() }) },
  { id: 'week', label: 'هذا الأسبوع', days: 7, range: () => ({ from: weekStart(), to: today() }) },
  { id: 'month', label: 'هذا الشهر', days: 30, range: () => ({ from: monthStart(), to: today() }) },
  { id: '30d', label: 'آخر 30 يوم', days: 30, range: () => ({ from: daysAgo(29), to: today() }) },
  { id: 'all', label: 'الكل', days: 90, range: () => ({ from: undefined, to: undefined }) },
]

const PAY_ICONS: Record<string, string> = { cash: 'نقدي', card: 'بطاقة', visa: 'فيزا', 'digital-wallet': 'محفظة', 'other': 'أخرى' }
const PAY_LABELS: Record<string, string> = { cash: 'نقدي', card: 'بطاقة', visa: 'فيزا', 'digital-wallet': 'محفظة إلكترونية' }
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const PAGE_SIZE = 10

type TabId = 'overview' | 'profit' | 'inventory' | 'staff' | 'discounts' | 'log'

const TAB_ITEMS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: BarChart3 },
  { id: 'profit', label: 'الأرباح', icon: Wallet },
  { id: 'inventory', label: 'المخزون', icon: Boxes },
  { id: 'staff', label: 'الموظفون', icon: Users },
  { id: 'discounts', label: 'الخصومات', icon: Tag },
  { id: 'log', label: 'المعاملات', icon: Receipt },
]

const ANAL_CARDS: { id: string; tab: TabId; label: string }[] = [
  { id: 'sales-trend', tab: 'overview', label: 'اتجاه المبيعات' },
  { id: 'abc-xyz', tab: 'inventory', label: 'ABC/XYZ' },
  { id: 'inventory-turnover', tab: 'inventory', label: 'دوران المخزون' },
  { id: 'ppv', tab: 'inventory', label: 'انحراف التكلفة' },
  { id: 'dio', tab: 'inventory', label: 'أيام التغطية' },
]

export const AXI_TICK = { fontSize: 9, fill: 'rgba(148,163,184,0.85)' }
export const GRID_STROKE = 'rgba(148,163,184,0.15)'
export const CURSOR_FILL = 'rgba(148,163,184,0.08)'

export const shortName = (n: string) => (n.length > 10 ? n.slice(0, 10) + '…' : n)

export function Reports() {
  const {
    dashboard, hourly, topItems, categoryRevenue, addonStats, ticketDist, orderTypeSplit,
    revenueTrend, paymentMethods, profitSummary, transactions, shiftSummary, laborSummary, voidSummary,
    abcXyz, turnover, ppv, salesTrend, daysOnHand, discountSummary, loading, refreshAll, refreshRevenueTrend, refreshSalesTrend,
  } = useReportStore()

  const [tab, setTab] = useState<TabId>('overview')
  const [active, setActive] = useState<string>('7d')
  const [trendDays, setTrendDays] = useState(7)
  const [range, setRange] = useState<Range>({ from: daysAgo(6), to: today() })
  const [abcSort, setAbcSort] = useState<SortState<any> | null>(null)
  const [turnoverSort, setTurnoverSort] = useState<SortState<any> | null>(null)
  const [ppvSort, setPpvSort] = useState<SortState<any> | null>(null)
  const [dioSort, setDioSort] = useState<SortState<any> | null>(null)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [txPage, setTxPage] = useState(0)
  const [txStatus, setTxStatus] = useState('')
  const [reportMenuOpen, setReportMenuOpen] = useState(true)

  const load = (from?: string, to?: string, days = 7) => {
    refreshAll(from, to)
    refreshRevenueTrend(days)
    refreshSalesTrend({ days: 60, forecastDays: 30 })
    setTxPage(0)
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => { load(daysAgo(6), today(), 7) }, [])

  const applyPreset = (id: string) => {
    const p = PRESETS.find(x => x.id === id)!
    const r = p.range()
    setActive(id)
    setTrendDays(p.days)
    setRange(r)
    load(r.from, r.to, p.days)
  }

  const applyCustom = () => {
    if (!customFrom || !customTo) return
    if (customFrom > customTo) { setCustomTo(customFrom); return }
    const len = Math.max(7, Math.min(60, Math.round((new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86400000) + 1))
    setActive('custom')
    setTrendDays(len)
    setRange({ from: customFrom, to: customTo })
    load(customFrom, customTo, len)
  }

  const goToAnalysis = (id: string, targetTab: TabId, hasData: boolean) => {
    if (!hasData) return
    setTab(targetTab)
    setTimeout(() => scrollTo(id), 60)
  }

  const isSingleDay = range.from && range.to && range.from === range.to
  const hasOrders = (dashboard?.totalOrders ?? 0) > 0
  const hasAny = hasOrders || (dashboard?.cancelledOrders ?? 0) > 0

  const filteredTransactions = txStatus
    ? transactions.filter(t => t.status === txStatus)
    : transactions
  const totalTx = filteredTransactions.length
  const pages = Math.max(1, Math.ceil(totalTx / PAGE_SIZE))
  const page = Math.min(txPage, pages - 1)
  const pageRows = filteredTransactions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  /* ── chart palette & data ─────────────────────────────────────────── */
  const primary = chartColor('--color-chart-1', 'oklch(0.78 0.16 85)')
  const green = '#22c55e'
  const red = '#ef4444'
  const amber = '#eab308'
  const sky = '#38bdf8'
  const mutedBar = 'rgba(148,163,184,0.18)'
  const forecastFill = 'rgba(56,189,248,0.45)'
  const pal = [primary, 'oklch(0.65 0.2 150)', 'oklch(0.6 0.18 250)', 'oklch(0.65 0.2 300)', sky]

  const trendData = (revenueTrend || []).map(d => ({ label: d.date.slice(5), revenue: d.revenue || 0 }))
  const hourData = isSingleDay ? (hourly || []).map(h => ({ hour: String(h.hour), orderCount: h.orderCount, c: h.orderCount > 0 ? sky : mutedBar })) : []
  const hasHourly = isSingleDay && hourData.some(h => h.orderCount > 0)

  const trendMerged = salesTrend
    ? [
        ...salesTrend.historical.slice(-14).map(h => ({ label: h.date.slice(5), revenue: h.revenue || 0, c: primary })),
        ...salesTrend.forecast.slice(0, 14).map(f => ({ label: f.date.slice(5), revenue: f.revenue || 0, c: forecastFill })),
      ]
    : []

  const toData = (turnover?.rows || []).slice(0, 10).map(r => ({
    name: r.name,
    turnover: Math.round(r.turnover * 100) / 100,
    c: r.turnover >= 6 ? green : r.turnover >= 2 ? amber : red,
  }))

  const ppvData = (ppv?.rows || []).slice(0, 12).map(r => ({
    name: r.name,
    ppv: Math.round(r.ppv * 100) / 100,
    c: r.ppv < 0 ? green : r.ppv > 0 ? red : mutedBar,
  }))

  // Only rows with measured consumption make a meaningful bar —
  // rows without usage would all sit at 0 days. The handler
  // returns lowest coverage first, so the slice keeps the
  // most critical items on the chart.
  const dioData = (daysOnHand?.rows || [])
    .filter(r => r.dio != null)
    .slice(0, 12)
    .map(r => ({
      name: r.name,
      dio: r.dio ?? 0,
      c: r.status === 'critical' ? red : r.status === 'low' ? amber : green,
    }))

  const payData = (paymentMethods || []).map((m, i) => ({
    name: PAY_LABELS[m.method] || m.method,
    value: m.total,
    count: m.count,
    c: pal[i % pal.length],
  }))
  const payTotal = payData.reduce((s, x) => s + x.value, 0) || 1

  const otData = orderTypeSplit
    ? [
        { name: 'توصيل', value: orderTypeSplit.delivery.count, revenue: orderTypeSplit.delivery.revenue, pct: orderTypeSplit.delivery.percentage, c: primary },
        { name: 'صالة', value: orderTypeSplit.dineIn.count, revenue: orderTypeSplit.dineIn.revenue, pct: orderTypeSplit.dineIn.percentage, c: sky },
        ...(orderTypeSplit.takeaway?.count > 0 ? [{ name: 'تيك أوي', value: orderTypeSplit.takeaway.count, revenue: orderTypeSplit.takeaway.revenue, pct: orderTypeSplit.takeaway.percentage, c: green }] : []),
      ]
    : []
  const otTotal = otData.reduce((s, x) => s + x.value, 0) || 1

  const abcCounts = abcXyz
    ? (['A', 'B', 'C'] as const).map((cls) => {
        const count = (['X', 'Y', 'Z'] as const).reduce((s, xyz) => s + (abcXyz.matrixCounts[cls + xyz] || 0), 0)
        return { name: `فئة ${cls}`, count, c: cls === 'A' ? green : cls === 'B' ? sky : 'rgba(148,163,184,0.55)' }
      })
    : []
  const abcTotal = abcCounts.reduce((s, x) => s + x.count, 0) || 1

  const hasInventory = !!(abcXyz?.products.length || turnover?.rows.length || ppv?.rows.length || daysOnHand?.rows.length)
  const hasStaff = !!(shiftSummary?.totalShifts || laborSummary?.staff.length || voidSummary && (voidSummary.cancelCount || voidSummary.refundCount || voidSummary.discountCount))

  // Profit chart data
  const profitData = profitSummary ? [
    { name: 'إيراد', value: profitSummary.revenue, c: green },
    { name: 'تكلفة', value: profitSummary.costOfGoods, c: red },
    { name: 'ربح', value: Math.max(0, profitSummary.grossProfit), c: primary },
    { name: 'مصروفات', value: profitSummary.totalExpenses, c: amber },
    { name: 'صافي', value: profitSummary.netProfit, c: profitSummary.netProfit >= 0 ? green : red },
  ].filter(d => d.value > 0) : []

  // Employee sales chart data
  const staffSalesData = laborSummary?.staff?.length
    ? laborSummary.staff.map((s: any) => ({
        name: shortName(s.name),
        sales: s.sales,
        orders: s.orderCount,
        c: s.sales > 0 ? primary : mutedBar,
      }))
    : []

  // Void breakdown pie data
  const voidPieData = voidSummary && (voidSummary.cancelCount > 0 || voidSummary.refundCount > 0 || voidSummary.discountCount > 0)
    ? [
        { name: 'ملغاة', value: voidSummary.cancelCount, c: red },
        { name: 'مستردة', value: voidSummary.refundCount, c: amber },
        { name: 'بخصم', value: voidSummary.discountCount, c: sky },
      ].filter(d => d.value > 0)
    : []

  // Transaction status pie data
  const txStatusData = transactions.length > 0
    ? [
        { name: 'مكتملة', value: transactions.filter(t => t.status === 'COMPLETED').length, c: green },
        { name: 'مستردة', value: transactions.filter(t => t.status === 'REFUNDED').length, c: amber },
        { name: 'ملغاة', value: transactions.filter(t => t.status === 'CANCELLED').length, c: red },
      ].filter(d => d.value > 0)
    : []
  const txTotal = txStatusData.reduce((s, x) => s + x.value, 0) || 1

  // Transaction payment method bar data
  const txPayData = transactions.length > 0
    ? (() => {
        const byPay: Record<string, { count: number; total: number }> = {}
        for (const t of transactions) {
          if (t.status === 'CANCELLED') continue
          const key = t.paymentType || 'cash'
          if (!byPay[key]) byPay[key] = { count: 0, total: 0 }
          byPay[key].count++
          byPay[key].total += t.total
        }
        return Object.entries(byPay).map(([method, d], i) => ({
          name: PAY_LABELS[method] || method,
          count: d.count,
          total: d.total,
          c: pal[i % pal.length],
        }))
      })()
    : []

  return (
    <ScrollArea className="h-full">
      <div className="p-5 space-y-5">

        {/* ═══ Header ═══ */}
        <div className="sticky top-0 z-10 -mx-5 px-5 pb-4 bg-background/95 backdrop-blur border-b space-y-3">
          <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/25">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black leading-tight">التقارير</h2>
                  <p className="text-[10px] text-muted-foreground font-bold">نظرة شاملة على الأداء والربحية والمخزون</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-2 rounded-full bg-card border border-border text-[11px] font-bold flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  {range.from && range.to
                    ? (range.from === range.to ? range.from : `${range.from} ← ${range.to}`)
                    : 'كل الفترات'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => load(range.from, range.to, trendDays)}
                    title="تحديث البيانات"
                    className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setReportMenuOpen(open => !open)}
                    title={reportMenuOpen ? 'طي خيارات التقارير' : 'فتح خيارات التقارير'}
                    aria-expanded={reportMenuOpen}
                    className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', reportMenuOpen && 'rotate-180')} />
                  </button>
                </div>
              </div>
            </div>

            {reportMenuOpen && <>
            {/* Section navigation */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1 rounded-xl border border-border bg-card p-1">
              {TAB_ITEMS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-black transition-all cursor-pointer",
                    tab === t.id
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer border",
                    active === p.id
                      ? "bg-card text-primary border-primary shadow-sm shadow-primary/15"
                      : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                  )}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={applyCustom}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer border",
                  active === 'custom'
                    ? "bg-card text-primary border-primary shadow-sm shadow-primary/15"
                    : "bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <span className="flex items-center gap-1"><Filter className="h-3 w-3" />فترة مخصصة</span>
              </button>
            </div>

            {/* Custom range */}
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker value={customFrom} onChange={setCustomFrom} placeholder="من تاريخ" className="w-44" />
              <span className="text-xs text-muted-foreground">←</span>
              <DatePicker value={customTo} onChange={setCustomTo} placeholder="إلى تاريخ" className="w-44" />
              <button
                onClick={applyCustom}
                className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold cursor-pointer hover:opacity-90 transition-opacity"
              >
                تطبيق
              </button>
              <button
                onClick={() => { setCustomFrom(''); setCustomTo(''); applyPreset('today') }}
                className="h-11 px-4 rounded-xl bg-card/70 text-sm font-bold text-muted-foreground cursor-pointer hover:text-foreground transition-colors border border-border"
              >
                مسح
              </button>
            </div>

            {/* Analytics quick-nav (relevant tabs only) */}
            <div className={cn("flex flex-wrap items-center gap-1.5", tab !== 'overview' && tab !== 'inventory' && "hidden")}>
              <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                <Target className="h-3 w-3" /> التحليلات:
              </span>
              {ANAL_CARDS.map(a => (
                <button
                  key={a.id}
                  onClick={() => goToAnalysis(a.id, a.tab, a.tab === 'overview' ? !!salesTrend : hasInventory)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors cursor-pointer border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50"
                >
                  {a.label}
                </button>
              ))}
            </div>
            </>}
          </div>
        </div>

        {loading && (
          <div className="text-center text-xs text-muted-foreground animate-pulse">جاري التحميل...</div>
        )}

        {!hasAny && !loading && dashboard && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
            <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center">
              <Package className="h-7 w-7 opacity-40" />
            </div>
            <p className="text-sm font-bold">لا توجد طلبات في هذه الفترة</p>
            <p className="text-[11px] text-muted-foreground">جرّب فترة أخرى أو أنشئ طلبات جديدة</p>
          </div>
        )}

        {/* ════════════════ TAB: نظرة عامة ════════════════ */}
        {tab === 'overview' && (
          <>
            {/* KPI row */}
            {dashboard && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={<ShoppingBag className="h-5 w-5" />} label="إجمالي الطلبات" value={`${dashboard.totalOrders}`} color="bg-primary/10 text-primary" />
                <StatCard icon={<DollarSign className="h-5 w-5" />} label="الإيرادات" value={`${dashboard.totalRevenue.toFixed(0)} ج.م`} color="bg-green-500/10 text-green-400" />
                <StatCard icon={<TrendingUp className="h-5 w-5" />} label="متوسط الطلب" value={`${dashboard.avgOrderValue.toFixed(0)} ج.م`} color="bg-blue-500/10 text-blue-400" />
                <StatCard icon={<Package className="h-5 w-5" />} label="الملغيات / المستردات" value={`${dashboard.cancelledOrders} / ${dashboard.refundedOrders || 0}`} color="bg-red-500/10 text-red-400" />
              </div>
            )}

            {/* Revenue trend + hourly */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {revenueTrend.length > 0 && (
                <Section icon={<TrendingUp className="h-4 w-4 text-primary" />} title="مسار الإيرادات" className={hasHourly ? "lg:col-span-1" : "lg:col-span-2"}>
                  <div className="h-52">
                    <ChartContainer className="h-full">
                      <AreaChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={primary} stopOpacity={0.45} />
                            <stop offset="100%" stopColor={primary} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={AXI_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" reversed />
                        <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v}`} />
                        <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="currency" />} />
                        <Area type="monotone" dataKey="revenue" stroke={primary} strokeWidth={2} fill="url(#revArea)" />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground font-bold">
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-primary/70" /> الإيراد اليومي</span>
                    <span>أعلى {Math.max(...trendData.map(d => d.revenue), 0).toFixed(0)} ج.م / يوم</span>
                  </div>
                </Section>
              )}

              {hasHourly && (
                <Section icon={<Hourglass className="h-4 w-4 text-primary" />} title="توزيع الطلبات بالساعة" className="lg:col-span-1">
                  <div className="h-52">
                    <ChartContainer className="h-full">
                      <BarChart data={hourData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="hour" tick={AXI_TICK} axisLine={false} tickLine={false} interval={1} reversed />
                        <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                        <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="number" nameFormatter={() => 'الطلبات'} />} />
                        <Bar dataKey="orderCount" radius={[4, 4, 0, 0]}>
                          {hourData.map((h, i) => <Cell key={i} fill={h.c} />)}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </div>
                </Section>
              )}
            </div>

            {/* Sales trend & forecast */}
            {salesTrend && (
              <Section id="sales-trend" scroll icon={<TrendingUp className="h-4 w-4 text-primary" />} title="اتجاه المبيعات والتوقعات" action={<span className="text-[10px] font-bold text-muted-foreground">{salesTrend.days} يوم فعلي · {salesTrend.forecastDays} يوم متوقع</span>}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <MiniStat label="الإيراد الأساسي / يوم" value={`${salesTrend.baseDailyRevenue.toFixed(0)} ج.م`} tone="text-primary" />
                  <MiniStat label="متوسط 30 يوم" value={`${salesTrend.avgDailyRevenue30.toFixed(0)} ج.م`} tone="text-blue-400" />
                  <MiniStat label="متوسط 60 يوم" value={`${salesTrend.avgDailyRevenue60.toFixed(0)} ج.م`} tone="text-green-400" />
                  <MiniStat label="متوسط 90 يوم" value={`${salesTrend.avgDailyRevenue90.toFixed(0)} ج.م`} tone="text-yellow-400" />
                </div>

                {trendMerged.length > 0 && (
                  <div className="h-52 mt-4">
                    <ChartContainer className="h-full">
                      <BarChart data={trendMerged} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={AXI_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" reversed />
                        <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v}`} />
                        <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="currency" labelFormatter={l => `${l}`} />} />
                        <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
                          {trendMerged.map((d, i) => <Cell key={i} fill={d.c} />)}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </div>
                )}
                {trendMerged.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-8">لا توجد بيانات كافية للتوقع</p>}

                {salesTrend.weekdayFactors.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-bold text-muted-foreground mb-2">عوامل أيام الأسبوع:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {salesTrend.weekdayFactors.map(w => (
                        <span key={w.weekday} className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold border", w.factor >= 1 ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-red-500/10 text-red-400 border-red-500/20")}>
                          {WEEKDAYS[w.weekday]} {w.factor.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {salesTrend.items.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-bold text-muted-foreground mb-2">أفضل المنتجات قيمةً (توقع 30 يوم):</p>
                    <div className="space-y-1.5">
                      {salesTrend.items.slice(0, 8).map((it, i) => (
                        <div key={i} className="flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2">
                          <Emoji className="text-lg w-7 text-center">{it.emoji}</Emoji>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs">
                              <span className="font-bold truncate">{it.name}</span>
                              <span className={cn("font-black flex items-center gap-0.5", it.trend > 0 ? "text-green-400" : it.trend < 0 ? "text-red-400" : "text-muted-foreground")}>
                                {it.trend > 0 ? <TrendingUp className="h-3 w-3" /> : it.trend < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                                {it.trend > 0 ? '+' : ''}{Math.round(it.trend)}%
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                              أساسي {it.baseDailyQty.toFixed(1)}/يوم · آخر 7 أيام {it.last7Qty.toFixed(1)}/يوم · توقع {it.forecast30d.toFixed(0)} وحدة
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Order type + payments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {otData.length > 0 && (
                <Section icon={<ShoppingBag className="h-4 w-4 text-primary" />} title="نوع الطلب">
                  <div className="h-44">
                    <ChartContainer className="h-full">
                      <PieChart>
                        <Pie data={otData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
                          {otData.map((e, i) => <Cell key={i} fill={e.c} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip kind="number" labelFormatter={l => `${l}`} nameFormatter={n => `طلبات ${n}`} />} />
                      </PieChart>
                    </ChartContainer>
                  </div>
                  <div className="mt-2 space-y-2">
                    {otData.map(e => (
                      <div key={e.name} className="flex items-center gap-2 text-[11px]">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.c }} />
                        <span className="font-bold flex-1">{e.name} ({e.value})</span>
                        <span className="text-muted-foreground font-medium">{e.revenue.toFixed(0)} ج.م · {e.pct.toFixed(0)}%</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground font-bold">إجمالي {otTotal} طلب</p>
                  </div>
                </Section>
              )}

              {payData.length > 0 && (
                <Section icon={<CreditCard className="h-4 w-4 text-primary" />} title="طرق الدفع">
                  <div className="h-44">
                    <ChartContainer className="h-full">
                      <PieChart>
                        <Pie data={payData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
                          {payData.map((e, i) => <Cell key={i} fill={e.c} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip kind="currency" labelFormatter={l => `${l}`} />} />
                      </PieChart>
                    </ChartContainer>
                  </div>
                  <div className="mt-2 space-y-2">
                    {payData.map(e => (
                      <div key={e.name} className="flex items-center gap-2 text-[11px]">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.c }} />
                        <span className="font-bold flex-1">{e.name} ({e.count})</span>
                        <span className="text-muted-foreground font-medium">{((e.value / payTotal) * 100).toFixed(0)}%</span>
                        <span className="font-black text-primary w-16 text-left">{e.value.toFixed(0)} ج.م</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            {/* Top items + categories */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {topItems.length > 0 && (
                <Section icon={<TrendingUp className="h-4 w-4 text-primary" />} title="الأكثر طلباً">
                  <div className="space-y-2">
                    {topItems.map((item, i) => {
                      const maxCount = topItems[0]?.totalQuantity || 1
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <Emoji className="text-lg w-8 text-center">{item.emoji}</Emoji>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-bold">{item.name}</span>
                              <span className="text-muted-foreground font-medium">{item.totalQuantity}×</span>
                            </div>
                            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(item.totalQuantity / maxCount) * 100}%` }} />
                            </div>
                          </div>
                          <span className="text-xs font-bold text-primary w-16 text-left">{item.totalRevenue.toFixed(0)} ج.م</span>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}

              {categoryRevenue.length > 0 && (
                <Section icon={<Boxes className="h-4 w-4 text-primary" />} title="الإيرادات حسب القسم">
                  <div className="space-y-2">
                    {categoryRevenue.map(cat => {
                      const maxRev = categoryRevenue[0]?.totalRevenue || 1
                      return (
                        <div key={cat.categoryId} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-bold">{cat.name}</span>
                              <span className="text-muted-foreground font-medium">{cat.totalRevenue.toFixed(0)} ج.م</span>
                            </div>
                            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${(cat.totalRevenue / maxRev) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}
            </div>

            {/* Ticket dist + addons */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {ticketDist.length > 0 && (
                <Section icon={<Layers className="h-4 w-4 text-primary" />} title="توزيع قيمة الفاتورة">
                  <div className="space-y-2">
                    {ticketDist.map(t => (
                      <div key={t.range} className="flex items-center gap-3">
                        <span className="text-[11px] font-bold w-12 text-muted-foreground">{t.range}</span>
                        <div className="flex-1">
                          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full bg-blue-500/70 rounded-full" style={{ width: `${Math.min(t.percentage, 100)}%` }} />
                          </div>
                        </div>
                        <span className="text-[11px] font-bold w-8 text-left">{t.count}</span>
                        <span className="text-[10px] text-muted-foreground w-10 text-left">{t.percentage.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {addonStats.length > 0 && (
                <Section icon={<Package className="h-4 w-4 text-primary" />} title="الإضافات الأكثر مبيعاً">
                  <div className="space-y-2">
                    {addonStats.slice(0, 8).map((a, i) => {
                      const maxQty = addonStats[0]?.totalQuantity || 1
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <Emoji className="text-lg w-7 text-center">{a.emoji}</Emoji>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-bold">{a.name}</span>
                              <span className="text-muted-foreground font-medium">{a.totalQuantity}×</span>
                            </div>
                            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                              <div className="h-full bg-yellow-500/70 rounded-full" style={{ width: `${(a.totalQuantity / maxQty) * 100}%` }} />
                            </div>
                          </div>
                          <span className="text-xs font-bold text-primary w-14 text-left">{a.totalRevenue.toFixed(0)} ج.م</span>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}
            </div>
          </>
        )}

        {/* ════════════════ TAB: الأرباح ════════════════ */}
        {tab === 'profit' && (
          <>
            {profitSummary ? (
              <Section icon={<Wallet className="h-4 w-4 text-primary" />} title="تحليل الأرباح">
                {profitData.length > 0 && (
                  <div className="h-48 mb-4">
                    <ChartContainer className="h-full">
                      <BarChart data={profitData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={AXI_TICK} axisLine={false} tickLine={false} reversed />
                        <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v}`} />
                        <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="currency" />} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {profitData.map((d, i) => <Cell key={i} fill={d.c} />)}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </div>
                )}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">الإيرادات</span>
                    </div>
                    <span className="font-black text-green-400">{profitSummary.revenue.toFixed(0)} ج.م</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="h-4 w-4 text-red-400" />
                      <span className="text-sm font-medium">تكلفة البضاعة</span>
                    </div>
                    <span className="font-black text-red-400">-{profitSummary.costOfGoods.toFixed(0)} ج.م</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between bg-green-500/5 rounded-xl p-3">
                    <span className="text-sm font-bold">إجمالي الربح</span>
                    <span className={cn("font-black text-lg", profitSummary.grossProfit >= 0 ? "text-green-400" : "text-red-400")}>{profitSummary.grossProfit.toFixed(0)} ج.م</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-red-400" />
                      <span className="text-sm font-medium">المصروفات الثابتة</span>
                    </div>
                    <span className="font-black text-red-400">-{profitSummary.totalExpenses.toFixed(0)} ج.م</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">رسوم توصيل</p>
                      <p className="text-xs font-bold text-primary">{profitSummary.deliveryFees.toFixed(0)} ج.م</p>
                    </div>
                    <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">خصومات</p>
                      <p className="text-xs font-bold text-yellow-400">{profitSummary.discounts.toFixed(0)} ج.م</p>
                    </div>
                    <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">ضريبة محصلة</p>
                      <p className="text-xs font-bold text-blue-400">{profitSummary.taxCollected.toFixed(0)} ج.م</p>
                    </div>
                    <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground mb-0.5">مسترد</p>
                      <p className="text-xs font-bold text-orange-400">{(profitSummary.totalRefunded || 0).toFixed(0)} ج.م</p>
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className={cn("flex items-center justify-between rounded-xl p-4", profitSummary.netProfit >= 0 ? "bg-green-500/10 border-2 border-green-500/20" : "bg-red-500/10 border-2 border-red-500/20")}>
                    <div className="flex items-center gap-2">
                      <Wallet className={cn("h-5 w-5", profitSummary.netProfit >= 0 ? "text-green-500" : "text-red-500")} />
                      <span className="font-black">صافي الربح</span>
                    </div>
                    <span className={cn("font-black text-2xl", profitSummary.netProfit >= 0 ? "text-green-400" : "text-red-400")}>{profitSummary.netProfit.toFixed(0)} <span className="text-sm">ج.م</span></span>
                  </div>
                </div>
              </Section>
            ) : (
              <TabEmpty icon={Wallet} title="لا توجد بيانات أرباح" sub="سلّم ورديات أو أنشئ طلبات في هذه الفترة لعرض الربحية" />
            )}
          </>
        )}

        {/* ════════════════ TAB: المخزون ════════════════ */}
        {tab === 'inventory' && (
          <>
            {hasInventory ? (
              <>
                {/* ABC/XYZ */}
                {abcXyz && abcXyz.products.length > 0 && (
                  <Section id="abc-xyz" scroll icon={<Target className="h-4 w-4 text-primary" />} title="تحليل ABC/XYZ"
                    action={<span className="text-[10px] font-bold text-muted-foreground">إجمالي الإيرادات: {abcXyz.totalRevenue.toFixed(0)} ج.م · {abcXyz.totalProducts} منتج</span>}>
                    <div className="px-3 py-2 rounded-xl bg-secondary/50 text-[10px] font-medium text-muted-foreground leading-relaxed mb-4">
                      ABC = أهمية الإيرادات (A ≤ 70%، B ≤ 90%) · XYZ = ثبات الطلب اليومي (X ثابت، Z متقلب).
                      اصنع مخزون أمان أعلى لأصناف <b className="text-red-400">AZ/BZ</b> وراقبها باستمرار.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5">
                      {abcCounts.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground mb-1">توزيع المنتجات حسب الفئة:</p>
                          <div className="h-44">
                            <ChartContainer className="h-full">
                              <PieChart>
                                <Pie data={abcCounts} dataKey="count" nameKey="name" innerRadius={46} outerRadius={70} paddingAngle={3}>
                                  {abcCounts.map((e, i) => <Cell key={i} fill={e.c} />)}
                                </Pie>
                                <Tooltip content={<ChartTooltip kind="number" labelFormatter={l => `${l}`} nameFormatter={n => `منتجات ${n}`} />} />
                              </PieChart>
                            </ChartContainer>
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {abcCounts.map(e => (
                              <div key={e.name} className="flex items-center gap-2 text-[11px]">
                                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.c }} />
                                <span className="font-bold flex-1">{e.name}</span>
                                <span className="text-muted-foreground font-bold">{e.count} · {((e.count / abcTotal) * 100).toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground mb-1">مصفوفة الإستراتيجية:</p>
                        <div className="grid grid-cols-3 lg:grid-cols-9 gap-2">
                          {['A', 'B', 'C'].map(abc => (
                            ['X', 'Y', 'Z'].map(xyz => {
                              const key = abc + xyz
                              const count = abcXyz.matrixCounts[key] || 0
                              const policy = abcXyz.policies[key]
                              const cls = abc === 'A'
                                ? "border-emerald-500/40 bg-emerald-500/10"
                                : abc === 'B'
                                  ? "border-sky-500/40 bg-sky-500/10"
                                  : "border-slate-500/40 bg-slate-500/10"
                              return (
                                <div key={key} className={`rounded-xl border-2 p-2.5 text-center min-h-[6.5rem] flex flex-col items-center justify-center gap-1 ${cls}`}>
                                  <div className="flex items-center gap-1">
                                    <span className={`text-xs font-black ${abc === 'A' ? 'text-emerald-400' : abc === 'B' ? 'text-sky-400' : 'text-slate-300'}`}>{abc}{xyz}</span>
                                    <span className="text-[10px] font-black text-foreground">{count}</span>
                                  </div>
                                  <p className="text-[8px] leading-tight text-muted-foreground">{policy}</p>
                                </div>
                              )
                            })
                          ))}
                        </div>
                      </div>
                    </div>

                    <DataTable
                      columns={[
                        { key: 'name', label: 'المنتج', sortValue: (p: any) => p.name, render: (p: any) => <span className="font-bold"><Emoji>{p.emoji}</Emoji> {p.name}</span> },
                        { key: 'revenue', label: 'الإيرادات', sortValue: (p: any) => p.revenue, render: (p: any) => <span className="font-black">{p.revenue.toFixed(0)} ج.م</span> },
                        { key: 'qty', label: 'الكمية', sortValue: (p: any) => p.qty, render: (p: any) => p.qty },
                        { key: 'share', label: 'الحصة', sortValue: (p: any) => p.share, render: (p: any) => `${(p.share * 100).toFixed(0)}%` },
                        { key: 'cv', label: 'معامل التباين', sortValue: (p: any) => p.cv, render: (p: any) => p.cv != null ? `${(p.cv * 100).toFixed(0)}%` : '—' },
                        {
                          key: 'class', label: 'التصنيف', sortValue: (p: any) => `${p.abc}${p.xyz}`,
                          render: (p: any) => (
                            <span className={cn("text-[10px] font-black rounded-full px-2 py-0.5",
                              p.abc === 'A' && "bg-emerald-500/10 text-emerald-400",
                              p.abc === 'B' && "bg-sky-500/10 text-sky-400",
                              p.abc === 'C' && "bg-slate-500/10 text-slate-300")}>
                              {p.abc}{p.xyz}
                            </span>
                          )
                        },
                      ]}
                      data={sortRows(abcXyz.products, abcSort)}
                      keyExtractor={(p: any) => p.productId}
                      sort={abcSort}
                      onSortChange={setAbcSort}
                      exportName="abc-xyz"
                      className="mt-4"
                    />
                  </Section>
                )}

                {/* Inventory turnover */}
                {turnover && turnover.rows.length > 0 && (
                  <Section id="inventory-turnover" scroll icon={<RefreshCw className="h-4 w-4 text-primary" />} title="دوران المخزون"
                    action={
                      <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                        <span>COGS: <b className="text-foreground">{turnover.totalCogs.toFixed(0)} ج.م</b></span>
                        <span>متوسط القيمة: <b className="text-foreground">{turnover.totalAvgStockValue.toFixed(0)} ج.م</b></span>
                        <span>الدوران المرجّح: <b className="text-primary">{turnover.weightedTurnover.toFixed(2)}×</b></span>
                      </div>
                    }>
                    <div className="text-[10px] font-medium text-muted-foreground mb-3">
                      نسبة تكلفة البضاعة المباعة إلى متوسط قيمة المخزون خلال الفترة. النسبة المثالية بين 6 و 12 مرة سنويّاً للخامات سريعة التلف.
                    </div>
                    <Tabs defaultValue="chart">
                      <TabsList>
                        <TabsTrigger value="chart">الرسم البياني</TabsTrigger>
                        <TabsTrigger value="table">الجدول التفصيلي</TabsTrigger>
                      </TabsList>
                      <TabsContent value="chart">
                        {toData.length > 0 ? (
                          <div className="h-56">
                            <ChartContainer className="h-full">
                              <BarChart data={toData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                                <XAxis dataKey="name" tick={AXI_TICK} axisLine={false} tickLine={false} interval={0} tickFormatter={shortName} reversed />
                                <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={34} tickFormatter={(v: number) => `${v}×`} />
                                <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="multiplier" nameFormatter={() => 'الدوران'} />} />
                                <Bar dataKey="turnover" radius={[4, 4, 0, 0]}>
                                  {toData.map((d, i) => <Cell key={i} fill={d.c} />)}
                                </Bar>
                              </BarChart>
                            </ChartContainer>
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground text-center py-8">لا توجد بيانات دوران في هذه الفترة</p>
                        )}
                      </TabsContent>
                      <TabsContent value="table">
                        <DataTable
                          columns={[
                            { key: 'name', label: 'المكوّن', sortValue: (r: any) => r.name, render: (r: any) => <span className="font-bold">{r.name}</span> },
                            { key: 'supplier', label: 'المورد', sortValue: (r: any) => r.supplier || null, render: (r: any) => r.supplier || '—' },
                            { key: 'unitCost', label: 'سعر الوحدة', sortValue: (r: any) => r.unitCost, render: (r: any) => `${r.unitCost.toFixed(2)} ج.م` },
                            { key: 'consumptionUnits', label: 'الاستهلاك', sortValue: (r: any) => r.consumptionUnits, render: (r: any) => `${r.consumptionUnits.toFixed(1)} {r.unit}` },
                            { key: 'cogsPeriod', label: 'التكلفة (COGS)', sortValue: (r: any) => r.cogsPeriod, render: (r: any) => <span className="font-bold">{r.cogsPeriod.toFixed(0)} ج.م</span> },
                            { key: 'avgStockValue', label: 'متوسط المخزون', sortValue: (r: any) => r.avgStockValue, render: (r: any) => `${r.avgStockValue.toFixed(0)} ج.م` },
                            { key: 'stockValueCurrent', label: 'القيمة الحالية', sortValue: (r: any) => r.stockValueCurrent, render: (r: any) => `${r.stockValueCurrent.toFixed(0)} ج.م` },
                            {
                              key: 'turnover', label: 'الدوران', sortValue: (r: any) => r.turnover,
                              render: (r: any) => (
                                <span className={cn("text-[10px] font-black rounded-full px-2 py-0.5",
                                  r.turnover >= 6 ? "bg-green-500/10 text-green-400" : r.turnover >= 2 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400")}>
                                  {r.turnover.toFixed(2)}×
                                </span>
                              )
                            },
                          ]}
                          data={sortRows(turnover.rows, turnoverSort)}
                          keyExtractor={(r: any) => r.ingredientId}
                          sort={turnoverSort}
                          onSortChange={setTurnoverSort}
                          exportName="inventory-turnover"
                        />
                      </TabsContent>
                    </Tabs>
                  </Section>
                )}

                {/* PPV — shown even when empty so the analysis
                    is discoverable: it needs purchase records */}
                {ppv && (
                  <Section id="ppv" scroll icon={<ShieldAlert className="h-4 w-4 text-primary" />} title="انحراف التكلفة (PPV)"
                    action={
                      <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                        <span>الإنفاق: <b className="text-foreground">{ppv.totalSpend.toFixed(0)} ج.م</b></span>
                        <span className={cn(ppv.totalPPV > 0 ? "text-red-400" : "text-green-400")}>الانحراف: {ppv.totalPPV.toFixed(0)} ج.م</span>
                        {ppv.highConcentrationCount > 0 && <span className="text-red-400">مورد واحد: {ppv.highConcentrationCount}</span>}
                      </div>
                    }>
                    <div className="text-[10px] font-medium text-muted-foreground mb-3">
                      مقارنة التكلفة الفعلية عند التوريد بالتكلفة القياسية المخططة. انحراف أقل من الصفر = شراء أرخص من الخطة، وأكبر من الصفر = زيادة تكلفة تحتاج مراجعة.
                    </div>
                    <Tabs defaultValue="chart">
                      <TabsList>
                        <TabsTrigger value="chart">الرسم البياني</TabsTrigger>
                        <TabsTrigger value="table">الجدول التفصيلي</TabsTrigger>
                      </TabsList>
                      <TabsContent value="chart">
                        {ppvData.length > 0 ? (
                          <div className="h-56">
                            <ChartContainer className="h-full">
                              <BarChart data={ppvData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                                <XAxis dataKey="name" tick={AXI_TICK} axisLine={false} tickLine={false} interval={0} tickFormatter={shortName} reversed />
                                <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={44} />
                                <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="currency" nameFormatter={() => 'الانحراف'} />} />
                                <Bar dataKey="ppv" radius={[4, 4, 0, 0]}>
                                  {ppvData.map((d, i) => <Cell key={i} fill={d.c} />)}
                                </Bar>
                              </BarChart>
                            </ChartContainer>
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground text-center py-8">لا توجد بيانات انحراف في هذه الفترة</p>
                        )}
                      </TabsContent>
                      <TabsContent value="table">
                        <DataTable
                          columns={[
                            { key: 'name', label: 'المكوّن', sortValue: (r: any) => r.name, render: (r: any) => <span className="font-bold">{r.name}</span> },
                            { key: 'plannedCost', label: 'الخطة', sortValue: (r: any) => r.plannedCost, render: (r: any) => r.plannedCost.toFixed(2) },
                            { key: 'currentCost', label: 'الحالي', sortValue: (r: any) => r.currentCost, render: (r: any) => r.currentCost.toFixed(2) },
                            { key: 'standardCost', label: 'المعياري', sortValue: (r: any) => r.standardCost, render: (r: any) => r.standardCost.toFixed(2) },
                            { key: 'purchases', label: 'المشتريات', sortValue: (r: any) => r.purchases, render: (r: any) => r.purchases },
                            { key: 'qty', label: 'الكمية', sortValue: (r: any) => Math.abs(r.qty), render: (r: any) => `${Math.abs(r.qty).toFixed(1)} ${r.unit}` },
                            { key: 'spend', label: 'الإنفاق', sortValue: (r: any) => r.spend, render: (r: any) => <span className="font-bold">{r.spend.toFixed(0)} ج.م</span> },
                            { key: 'ppv', label: 'الانحراف', sortValue: (r: any) => r.ppv, render: (r: any) => <span className={cn("font-black", r.ppv < 0 ? "text-green-400" : "text-red-400")}>{r.ppv.toFixed(0)} ج.م</span> },
                            { key: 'ppvPct', label: '%', sortValue: (r: any) => r.ppvPct, render: (r: any) => <span className={cn("font-bold", r.ppvPct < 0 ? "text-green-400" : "text-red-400")}>{r.ppvPct.toFixed(1)}%</span> },
                          ]}
                          data={sortRows(ppv.rows, ppvSort)}
                          keyExtractor={(r: any) => r.ingredientId}
                          sort={ppvSort}
                          onSortChange={setPpvSort}
                          exportName="cost-variance"
                          emptyText="لا توجد مشتريات في هذه الفترة — سجّل عمليات توريد لقياس انحراف التكلفة"
                        />
                      </TabsContent>
                    </Tabs>
                  </Section>
                )}

                {/* Days on hand */}
                {daysOnHand && daysOnHand.rows.length > 0 && (
                  <Section id="dio" scroll icon={<CalendarClock className="h-4 w-4 text-primary" />} title="أيام التغطية (Days On Hand)">
                    <div className="text-[10px] font-medium text-muted-foreground mb-3">
                      عدد الأيام التي يكفيها المخزون الحالي بمتوسط الاستهلاك اليومي. الأخضر = آمن، الأصفر = منخفض، الأحمر = حرج.
                    </div>
                    <Tabs defaultValue="chart">
                      <TabsList>
                        <TabsTrigger value="chart">الرسم البياني</TabsTrigger>
                        <TabsTrigger value="table">الجدول التفصيلي</TabsTrigger>
                      </TabsList>
                      <TabsContent value="chart">
                        <div className="h-56">
                          <ChartContainer className="h-full">
                            <BarChart data={dioData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                              <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={AXI_TICK} axisLine={false} tickLine={false} interval={0} tickFormatter={shortName} reversed />
                              <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={34} tickFormatter={(v: number) => `${v} يوم`} />
                              <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="number" nameFormatter={() => 'التغطية (أيام)'} />} />
                              <Bar dataKey="dio" radius={[4, 4, 0, 0]}>
                                {dioData.map((d, i) => <Cell key={i} fill={d.c} />)}
                              </Bar>
                            </BarChart>
                          </ChartContainer>
                        </div>
                      </TabsContent>
                      <TabsContent value="table">
                        <DataTable
                          columns={[
                            { key: 'name', label: 'المكوّن', sortValue: (r: any) => r.name, render: (r: any) => <span className="font-bold">{r.name}</span> },
                            {
                              key: 'supplier', label: 'المورد', sortValue: (r: any) => r.supplier || null,
                              render: (r: any) => {
                                const risky = (r.supplierRatio ?? 0) > 0.7
                                return (
                                  <span>
                                    {r.supplier}
                                    {r.supplier && (r.secondarySupplier
                                      ? <span className="text-muted-foreground"> / {r.secondarySupplier}</span>
                                      : risky && <span className="text-orange-400 font-bold"> (بدون مورد ثانٍ)</span>)}
                                  </span>
                                )
                              }
                            },
                            { key: 'stock', label: 'المخزون', sortValue: (r: any) => r.stock, render: (r: any) => <span className="font-bold">{r.stock} {r.unit}</span> },
                            { key: 'minStock', label: 'الحد الأدنى', sortValue: (r: any) => r.minStock, render: (r: any) => `${r.minStock} {r.unit}` },
                            { key: 'avgDailyUse', label: 'الاستهلاك اليومي', sortValue: (r: any) => r.avgDailyUse, render: (r: any) => r.avgDailyUse.toFixed(1) },
                            { key: 'dio', label: 'التغطية', sortValue: (r: any) => r.dio, render: (r: any) => <span className="font-black">{r.dio != null ? `${r.dio.toFixed(0)} يوم` : '—'}</span> },
                            {
                              key: 'status', label: 'الحالة',
                              sortValue: (r: any) => ({ critical: 0, low: 1, ok: 2 } as Record<string, number>)[r.status] ?? 3,
                              render: (r: any) => r.status === 'critical'
                                ? <span className="text-[10px] font-bold bg-red-500/10 text-red-500 rounded-full px-2 py-0.5">حرج</span>
                                : r.status === 'low'
                                  ? <span className="text-[10px] font-bold bg-yellow-500/10 text-yellow-400 rounded-full px-2 py-0.5">منخفض</span>
                                  : <span className="text-[10px] font-bold bg-green-500/10 text-green-400 rounded-full px-2 py-0.5">جيد</span>
                            },
                          ]}
                          data={sortRows(daysOnHand.rows, dioSort)}
                          keyExtractor={(r: any) => r.ingredientId}
                          sort={dioSort}
                          onSortChange={setDioSort}
                          exportName="days-on-hand"
                        />
                      </TabsContent>
                    </Tabs>

                    {daysOnHand.concentrations.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground">تركّز الموردين (خطر الاعتماد على مورد واحد):</p>
                        {daysOnHand.concentrations.map((c: any, i: number) => (
                          <div key={i} className="bg-secondary/40 rounded-xl px-3 py-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold">{daysOnHand.rows.find(r => r.ingredientId === c.ingredientId)?.name || 'مكوّن'}</span>
                              <span className={cn("text-[10px] font-bold", c.singleSupplierConcentration ? "text-red-400" : "text-yellow-400")}>
                                أعلى مورد {c.topSupplierPct.toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {c.rows.map((sr: any, j: number) => (
                                <span key={j} className="text-[10px] text-muted-foreground font-bold bg-background/60 rounded-full px-2 py-0.5">
                                  {sr.supplier}: {sr.qty} · {sr.share.toFixed(0)}%
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                )}
              </>
            ) : (
              <TabEmpty icon={Boxes} title="لا توجد بيانات مخزون كافية" sub="سجّل عمليات توريد واستهلاك في هذه الفترة لعرض تحليلات المخزون" />
            )}
          </>
        )}

        {/* ════════════════ TAB: الموظفون ════════════════ */}
        {tab === 'staff' && (
          <>
            {hasStaff ? (
              <>
                {/* Shifts */}
                {shiftSummary && shiftSummary.totalShifts > 0 && (
                  <Section icon={<Users className="h-4 w-4 text-primary" />} title="ملخص الورديات">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="bg-secondary/60 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي الورديات</p>
                        <p className="text-xl font-black text-primary">{shiftSummary.totalShifts}</p>
                        <p className="text-[9px] text-muted-foreground">{shiftSummary.closedCount} مغلقة · {shiftSummary.openCount} مفتوحة</p>
                      </div>
                      <div className="bg-secondary/60 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي الإيرادات</p>
                        <p className="text-xl font-black text-green-400">{shiftSummary.totalRevenue.toFixed(0)} <span className="text-xs">ج.م</span></p>
                        <p className="text-[9px] text-muted-foreground">متوسط {shiftSummary.avgRevenuePerShift.toFixed(0)} / وردية</p>
                      </div>
                      <div className="bg-secondary/60 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">الطلبات</p>
                        <p className="text-xl font-black text-blue-400">{shiftSummary.totalOrders}</p>
                        <p className="text-[9px] text-muted-foreground">متوسط {shiftSummary.avgOrdersPerShift.toFixed(1)} / وردية</p>
                      </div>
                      <div className={cn("rounded-xl p-3 text-center", shiftSummary.totalShorts > 0 || shiftSummary.totalOverages > 0 ? "bg-red-500/10" : "bg-green-500/10")}>
                        <p className="text-[10px] text-muted-foreground mb-0.5">الفروقات</p>
                        <p className="text-xl font-black">{shiftSummary.totalShorts + shiftSummary.totalOverages > 0 ? `-${shiftSummary.totalShorts.toFixed(0)}/+${shiftSummary.totalOverages.toFixed(0)}` : '0'}</p>
                        <p className="text-[9px] text-muted-foreground">عجز / فائض</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {shiftSummary.shifts.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between gap-2 bg-secondary/40 rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {s.status === 'open'
                              ? <Lock className="h-3 w-3 shrink-0 text-green-400" />
                              : <Unlock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            <span className="text-[11px] font-bold truncate">{s.userName}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px]">
                            <span className="text-muted-foreground">{s.orderCount} طلب</span>
                            <span className="text-muted-foreground">{s.duration}</span>
                            <span className={cn("font-black", (s.difference || 0) !== 0 ? "text-red-400" : "text-green-400")}>{s.revenue.toFixed(0)} ج.م</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Labor */}
                {laborSummary && laborSummary.staff.length > 0 && (
                  <Section icon={<Users className="h-4 w-4 text-primary" />} title="أداء الموظفين">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-secondary/60 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي المبيعات</p>
                        <p className="text-xl font-black text-green-400">{laborSummary.staff.reduce((s: number, u: any) => s + u.sales, 0).toFixed(0)} <span className="text-xs">ج.م</span></p>
                      </div>
                      <div className="bg-secondary/60 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي الطلبات</p>
                        <p className="text-xl font-black text-primary">{laborSummary.staff.reduce((s: number, u: any) => s + u.orderCount, 0)}</p>
                      </div>
                      <div className="bg-secondary/60 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">عدد الموظفين</p>
                        <p className="text-xl font-black text-blue-400">{laborSummary.staff.length}</p>
                      </div>
                    </div>
                    {staffSalesData.length > 1 && (
                      <div className="h-44 mt-3">
                        <ChartContainer className="h-full">
                          <BarChart data={staffSalesData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={AXI_TICK} axisLine={false} tickLine={false} reversed />
                            <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v}`} />
                            <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="currency" labelFormatter={l => `${l}`} nameFormatter={() => 'المبيعات'} />} />
                            <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                              {staffSalesData.map((d: any, i: number) => <Cell key={i} fill={d.c} />)}
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                      </div>
                    )}
                    <div className="mt-3 space-y-2">
                      {laborSummary.staff.map((s: any) => (
                        <div key={s.id} className="bg-secondary/40 rounded-xl px-3 py-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold">{s.name}</span>
                            <span className="text-[11px] font-black text-green-400">{s.sales.toFixed(0)} ج.م</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
                            <span>{s.orderCount} طلب</span>
                            <span>{formatDuration(s.hoursWorked)}</span>
                            <span>{s.shiftCount} وردية</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Voids */}
                {voidSummary && (voidSummary.cancelCount > 0 || voidSummary.refundCount > 0 || voidSummary.discountCount > 0) && (
                  <Section icon={<AlertTriangle className="h-4 w-4 text-primary" />} title="الملغيات والمستردات والخصومات">
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className={cn("rounded-xl p-3 text-center", voidSummary.cancelCount > 0 ? "bg-red-500/10" : "bg-secondary/60")}>
                          <p className="text-[10px] text-muted-foreground mb-0.5">ملغاة</p>
                          <p className="text-xl font-black text-red-500">{voidSummary.cancelCount}</p>
                          <p className="text-[9px] text-muted-foreground">{voidSummary.cancelAmount.toFixed(0)} ج.م</p>
                        </div>
                        <div className={cn("rounded-xl p-3 text-center", voidSummary.refundCount > 0 ? "bg-orange-500/10" : "bg-secondary/60")}>
                          <p className="text-[10px] text-muted-foreground mb-0.5">مستردة</p>
                          <p className="text-xl font-black text-orange-400">{voidSummary.refundCount}</p>
                          <p className="text-[9px] text-muted-foreground">{voidSummary.refundAmount.toFixed(0)} ج.م</p>
                        </div>
                        <div className={cn("rounded-xl p-3 text-center", voidSummary.discountCount > 0 ? "bg-yellow-500/10" : "bg-secondary/60")}>
                          <p className="text-[10px] text-muted-foreground mb-0.5">بخصم</p>
                          <p className="text-xl font-black text-yellow-400">{voidSummary.discountCount}</p>
                          <p className="text-[9px] text-muted-foreground">{voidSummary.discountAmount.toFixed(0)} ج.م</p>
                        </div>
                      </div>

                      {voidPieData.length > 0 && (
                        <div className="flex items-center gap-4">
                          <div className="h-36 w-36 shrink-0">
                            <ChartContainer className="h-full">
                              <PieChart>
                                <Pie data={voidPieData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={56} paddingAngle={3}>
                                  {voidPieData.map((e, i) => <Cell key={i} fill={e.c} />)}
                                </Pie>
                                <Tooltip content={<ChartTooltip kind="number" labelFormatter={l => `${l}`} />} />
                              </PieChart>
                            </ChartContainer>
                          </div>
                          <div className="space-y-1.5">
                            {voidPieData.map(e => (
                              <div key={e.name} className="flex items-center gap-2 text-[11px]">
                                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.c }} />
                                <span className="font-bold">{e.name}</span>
                                <span className="text-muted-foreground font-medium">{e.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {voidSummary.voidByUser.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold text-muted-foreground">حسب الموظف:</p>
                          {voidSummary.voidByUser.map((u: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-secondary/40 rounded-xl px-3 py-2">
                              <span className="text-[11px] font-bold">{u.name}</span>
                              <div className="flex items-center gap-3 text-[10px]">
                                {u.cancels > 0 && <span className="text-red-500 font-bold">{u.cancels} إلغاء ({u.cancelAmount.toFixed(0)})</span>}
                                {u.refunds > 0 && <span className="text-orange-400 font-bold">{u.refunds} استرداد ({u.refundAmount.toFixed(0)})</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {voidSummary.discountByUser.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold text-muted-foreground">الخصومات حسب الموظف:</p>
                          {voidSummary.discountByUser.map((u: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-secondary/40 rounded-xl px-3 py-2">
                              <span className="text-[11px] font-bold">{u.name}</span>
                              <span className="text-[10px] text-yellow-400 font-bold">{u.count} خصم ({u.total.toFixed(0)} ج.م)</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {(voidSummary.cancels.length > 0 || voidSummary.refunds.length > 0) && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold text-muted-foreground">أحدث العمليات:</p>
                          {[...voidSummary.cancels.map((c: any) => ({ ...c, kind: 'ملغى' })), ...voidSummary.refunds.map((r: any) => ({ ...r, kind: 'مسترد' }))].slice(0, 10).map((o: any) => (
                            <div key={o.id} className="flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2">
                              <span className={cn("text-[9px] font-bold rounded-full px-2 py-0.5", o.kind === 'ملغى' ? "bg-red-500/10 text-red-500" : "bg-orange-500/10 text-orange-400")}>{o.kind}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-bold">{o.id}</p>
                                {o.reason && <p className="text-[9px] text-muted-foreground truncate">{o.reason}</p>}
                              </div>
                              <span className="text-[11px] font-bold">{(o.refundedAmount ?? o.total).toFixed(0)} ج.م</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Section>
                )}
              </>
            ) : (
              <TabEmpty icon={Users} title="لا توجد بيانات موظفين" sub="سلّم الورديات في هذه الفترة لعرض الأداء والتكاليف" />
            )}
          </>
        )}

        {/* ════════════════ TAB: المعاملات ════════════════ */}
        {tab === 'discounts' && (
          <>
            {discountSummary && discountSummary.summary.totalDiscountOrders > 0 ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard icon={<Tag className="h-5 w-5" />} label="طلبات بخصم" value={String(discountSummary.summary.totalDiscountOrders)} color="bg-sky-500/15 text-sky-400" />
                  <StatCard icon={<DollarSign className="h-5 w-5" />} label="إجمالي الخصومات" value={`${discountSummary.summary.totalDiscountAmount.toFixed(0)} ج.م`} color="bg-red-500/15 text-red-400" />
                  <StatCard icon={<Percent className="h-5 w-5" />} label="نسبة استخدام الخصم" value={`${discountSummary.summary.discountRate.toFixed(1)}%`} color="bg-amber-500/15 text-amber-400" />
                  <StatCard icon={<TrendingDown className="h-5 w-5" />} label="نسبة الخصم من الإيراد" value={`${discountSummary.summary.discountToRevenueRatio.toFixed(1)}%`} color="bg-purple-500/15 text-purple-400" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Bar chart — discount by code */}
                  {discountSummary.codes.length > 0 && (
                    <Section icon={<BarChart3 className="h-4 w-4 text-primary" />} title="الخصم حسب الكود">
                      <div className="h-52">
                        <ChartContainer className="h-full">
                          <BarChart data={discountSummary.codes.map((c: any) => ({ name: c.code, discount: Math.round(c.totalDiscount), c: primary }))} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={AXI_TICK} axisLine={false} tickLine={false} reversed />
                            <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v}`} />
                            <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="currency" labelFormatter={l => `${l}`} nameFormatter={() => 'الخصم'} />} />
                            <Bar dataKey="discount" radius={[4, 4, 0, 0]}>
                              {discountSummary.codes.map((_: any, i: number) => <Cell key={i} fill={pal[i % pal.length]} />)}
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                      </div>
                    </Section>
                  )}

                  {/* Pie — with vs without discount */}
                  <Section icon={<Receipt className="h-4 w-4 text-primary" />} title="الطلبات مع/بدون خصم">
                    <div className="h-44">
                      <ChartContainer className="h-full">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'بخصم', value: discountSummary.summary.totalDiscountOrders, c: primary },
                              { name: 'بدون خصم', value: discountSummary.summary.totalNoDiscountOrders, c: mutedBar },
                            ]}
                            dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}
                          >
                            <Cell fill={primary} />
                            <Cell fill={mutedBar} />
                          </Pie>
                          <Tooltip content={<ChartTooltip kind="number" labelFormatter={l => `${l}`} nameFormatter={n => n || ''} />} />
                        </PieChart>
                      </ChartContainer>
                    </div>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: primary }} />
                        <span className="font-bold flex-1">بخصم ({discountSummary.summary.totalDiscountOrders})</span>
                        <span className="text-muted-foreground font-medium">{discountSummary.summary.totalDiscountOrders > 0 ? `${discountSummary.summary.avgOrderWithDiscount.toFixed(0)} ج.م متوسط` : '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: mutedBar }} />
                        <span className="font-bold flex-1">بدون خصم ({discountSummary.summary.totalNoDiscountOrders})</span>
                        <span className="text-muted-foreground font-medium">{discountSummary.summary.totalNoDiscountOrders > 0 ? `${discountSummary.summary.avgOrderWithoutDiscount.toFixed(0)} ج.م متوسط` : '—'}</span>
                      </div>
                    </div>
                  </Section>
                </div>

                {/* Code breakdown table */}
                <Section icon={<Tag className="h-4 w-4 text-primary" />} title="تفاصيل أكواد الخصم">
                  <div className="space-y-2">
                    {discountSummary.codes.map((c: any, i: number) => (
                      <div key={c.code} className="flex items-center gap-3 bg-secondary/60 rounded-xl p-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs" style={{ background: pal[i % pal.length] + '22', color: pal[i % pal.length] }}>
                          {c.code.slice(0, 3)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black font-mono">{c.code}</span>
                            <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full",
                              c.type === 'percentage' ? "bg-sky-500/10 text-sky-400" : "bg-amber-500/10 text-amber-400"
                            )}>
                              {c.type === 'percentage' ? `${c.value}%` : `${c.value} ج.م`}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {c.count} استخدام · متوسط {c.avgDiscount.toFixed(0)} ج.م · إيراد {c.totalRevenue.toFixed(0)} ج.م
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-black text-red-400">-{c.totalDiscount.toFixed(0)} ج.م</p>
                          {c.maxUses > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {c.remaining !== null && c.remaining > 0
                                ? `متبقي ${c.remaining} / ${c.maxUses}`
                                : 'نفذ الاستخدام'}
                            </p>
                          )}
                          {c.maxUses === 0 && <p className="text-[10px] text-muted-foreground">بلا حد</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Summary mini-stats */}
                <Section icon={<DollarSign className="h-4 w-4 text-primary" />} title="ملخص مالي">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MiniStat label="متوسط الخصم/طلب" value={`${discountSummary.summary.avgDiscountPerOrder.toFixed(0)} ج.م`} />
                    <MiniStat label="إيراد بخصم" value={`${discountSummary.summary.totalDiscountRevenue.toFixed(0)} ج.م`} />
                    <MiniStat label="إيراد بدون خصم" value={`${discountSummary.summary.totalNoDiscountRevenue.toFixed(0)} ج.م`} />
                    <MiniStat label="إجمالي الإيراد" value={`${discountSummary.summary.totalRevenue.toFixed(0)} ج.م`} />
                  </div>
                </Section>
              </>
            ) : (
              <TabEmpty icon={Tag} title="لا توجد خصومات في هذه الفترة" sub="استخدم أكواد الخصم لتتبع تأثيرها هنا" />
            )}
          </>
        )}

        {tab === 'log' && (
          <>
            {transactions.length > 0 ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {txStatusData.length > 0 && (
                    <Section icon={<Receipt className="h-4 w-4 text-primary" />} title="توزيع الحالات">
                      <div className="h-44">
                        <ChartContainer className="h-full">
                          <PieChart>
                            <Pie data={txStatusData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
                              {txStatusData.map((e, i) => <Cell key={i} fill={e.c} />)}
                            </Pie>
                            <Tooltip content={<ChartTooltip kind="number" labelFormatter={l => `${l}`} nameFormatter={n => `معاملات ${n}`} />} />
                          </PieChart>
                        </ChartContainer>
                      </div>
                      <div className="mt-2 space-y-2">
                        {txStatusData.map(e => (
                          <div key={e.name} className="flex items-center gap-2 text-[11px]">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.c }} />
                            <span className="font-bold flex-1">{e.name} ({e.value})</span>
                            <span className="text-muted-foreground font-medium">{((e.value / txTotal) * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                        <p className="text-[10px] text-muted-foreground font-bold">إجمالي {txTotal} معاملة</p>
                      </div>
                    </Section>
                  )}

                  {txPayData.length > 0 && (
                    <Section icon={<CreditCard className="h-4 w-4 text-primary" />} title="حسب طريقة الدفع">
                      <div className="h-44">
                        <ChartContainer className="h-full">
                          <BarChart data={txPayData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={AXI_TICK} axisLine={false} tickLine={false} reversed />
                            <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${v}`} />
                            <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="currency" labelFormatter={l => `${l}`} nameFormatter={() => 'الإيراد'} />} />
                            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                              {txPayData.map((d, i) => <Cell key={i} fill={d.c} />)}
                            </Bar>
                          </BarChart>
                        </ChartContainer>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {txPayData.map(e => (
                          <div key={e.name} className="flex items-center gap-2 text-[11px]">
                            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.c }} />
                            <span className="font-bold flex-1">{e.name} ({e.count})</span>
                            <span className="text-muted-foreground font-medium">{e.total.toFixed(0)} ج.م</span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </div>

              <Section icon={<Receipt className="h-4 w-4 text-primary" />} title="سجل المعاملات"
                action={
                  <div className="flex items-center gap-1.5">
                    {[
                      { id: '', label: 'الكل' },
                      { id: 'COMPLETED', label: 'مكتملة' },
                      { id: 'REFUNDED', label: 'مستردة' },
                      { id: 'CANCELLED', label: 'ملغاة' },
                    ].map(f => (
                      <button
                        key={f.id || 'all'}
                        onClick={() => { setTxStatus(f.id); setTxPage(0) }}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors cursor-pointer",
                          txStatus === f.id ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                }>
                <div className="divide-y divide-border -mx-4 -mb-4">
                  {pageRows.map(o => (
                    <div key={o.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                        {PAY_ICONS[o.paymentType] || 'نقدي'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black">{o.id}</span>
                          {o.customerName && <span className="text-[10px] text-muted-foreground">{o.customerName}</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                          {new Date(o.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })} · {o.orderType === 'delivery' ? 'توصيل' : o.orderType === 'takeaway' ? 'تيك أوي' : 'صالة'}
                        </div>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        o.status === 'COMPLETED' && "bg-green-500/10 text-green-400",
                        o.status === 'REFUNDED' && "bg-orange-500/10 text-orange-400",
                        o.status === 'CANCELLED' && "bg-red-500/10 text-red-400",
                      )}>
                        {o.status === 'COMPLETED' ? 'مكتمل' : o.status === 'REFUNDED' ? 'مسترد' : o.status === 'CANCELLED' ? 'ملغى' : o.status}
                      </span>
                      <span className="text-sm font-black w-20 text-left">{o.total.toFixed(0)} ج.م</span>
                    </div>
                  ))}
                  {pageRows.length === 0 && (
                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">لا توجد معاملات بهذه الحالة</div>
                  )}
                </div>

                {totalTx > PAGE_SIZE && (
                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground font-bold">إجمالي {totalTx} معاملة</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setTxPage(Math.max(0, page - 1))}
                        disabled={page === 0}
                        className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-secondary transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <span className="text-[11px] font-bold px-2">صفحة {page + 1} / {pages}</span>
                      <button
                        onClick={() => setTxPage(Math.min(pages - 1, page + 1))}
                        disabled={page >= pages - 1}
                        className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-secondary transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </Section>
              </>
            ) : (
              <TabEmpty icon={Receipt} title="لا توجد معاملات في هذه الفترة" sub="أنشئ طلبات جديدة لعرض السجل هنا" />
            )}
          </>
        )}

      </div>
    </ScrollArea>
  )
}

/* ── shared building blocks ──────────────────────────────────────── */

function Section({ id, scroll, icon, title, action, children, className }: {
  id?: string
  scroll?: boolean
  icon?: import('react').ReactNode
  title: string
  action?: import('react').ReactNode
  children: import('react').ReactNode
  className?: string
}) {
  return (
    <Card id={id} className={cn('border-2 overflow-hidden', scroll && 'scroll-mt-32', className)}>
      <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10">{icon}</span>}
          <h3 className="text-sm font-black">{title}</h3>
        </div>
        {action && <div className="flex items-center gap-2 flex-wrap">{action}</div>}
      </div>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-secondary/60 rounded-xl p-3 text-center">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className={cn('text-sm font-black', tone || 'text-foreground')}>{value}</p>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: import('react').ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="border-2 rounded-2xl bg-card p-4 space-y-2">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[10px] text-muted-foreground font-bold">{label}</p>
    </div>
  )
}

function TabEmpty({ icon, title, sub }: { icon: import('lucide-react').LucideIcon; title: string; sub: string }) {
  const Icon = icon
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-muted-foreground border-2 border-dashed rounded-2xl">
      <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center">
        <Icon className="h-7 w-7 opacity-40" />
      </div>
      <p className="text-sm font-bold">{title}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}