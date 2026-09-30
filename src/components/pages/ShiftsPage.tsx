import { useEffect, useState, useCallback } from 'react'
import { useShiftStore } from '@/services/shift/shift.store'
import { useCashDrawerStore } from '@/services/cash-drawer/cash-drawer.store'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Lock, Unlock, AlertTriangle, CheckCircle, Wallet, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { toast } from '@/components/ui/toast'
import type { ViewMode } from '@/components/ui/view-toggle'

export function ShiftsPage() {
  const shifts = useShiftStore((s) => s.shifts)
  const currentShift = useShiftStore((s) => s.currentShift)
  const fetch = useShiftStore((s) => s.fetch)
  const fetchCurrent = useShiftStore((s) => s.fetchCurrent)
  const openShift = useShiftStore((s) => s.open)
  const closeShift = useShiftStore((s) => s.close)
  const currentUser = useUserStore((s) => s.currentUser)
  const reconcileBatch = useCashDrawerStore((s) => s.reconcileBatch)
  const expectedCash = useCashDrawerStore((s) => s.expectedCash)

  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [showOpen, setShowOpen] = useState(false)
  const [reconciliations, setReconciliations] = useState<Record<string, any>>({})
  const [view, setView] = useState<ViewMode>('table')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentExpected, setCurrentExpected] = useState<{ expected: number; breakdown: Record<string, number> } | null>(null)
  const [openError, setOpenError] = useState('')
  const [closeWarning, setCloseWarning] = useState<{ type: 'short' | 'over'; amount: number } | null>(null)

  const loadShifts = useCallback(() => {
    const filters: Record<string, string> = {}
    if (dateFrom) filters.from = dateFrom
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      filters.to = to.toISOString()
    }
    fetch(Object.keys(filters).length > 0 ? filters : undefined)
  }, [dateFrom, dateTo, fetch])

  useEffect(() => { loadShifts(); fetchCurrent() }, [])

  useEffect(() => {
    loadShifts()
  }, [dateFrom, dateTo])

  useEffect(() => {
    if (currentShift) {
      expectedCash(currentShift.id).then(setCurrentExpected)
    } else {
      setCurrentExpected(null)
    }
  }, [currentShift])

  const list = useListControls({
    items: shifts,
    searchText: (s) => new Date(s.startedAt).toLocaleString('ar-EG'),
    filter: (s) => !statusFilter || s.status === statusFilter,
  })

  // Batch load reconciliation data for closed shifts
  useEffect(() => {
    const closedIds = shifts.filter(s => s.status === 'closed').map(s => s.id)
    if (closedIds.length === 0) { setReconciliations({}); return }
    reconcileBatch(closedIds).then(setReconciliations)
  }, [shifts])

  const handleOpen = async () => {
    setOpenError('')
    if (!currentUser || !openingCash) return
    try {
      await openShift({ userId: currentUser.id, openingCash: parseFloat(openingCash) })
      toast({ title: 'تم فتح الوردية', variant: 'success' })
      setOpeningCash('')
      setShowOpen(false)
    } catch (err: any) {
      setOpenError(err.message || 'خطأ في فتح الوردية')
    }
  }

  const handleClose = async () => {
    setCloseWarning(null)
    if (!currentShift || !closingCash) return
    const cash = parseFloat(closingCash)
    if (isNaN(cash) || cash < 0) return
    // Check for short before closing
    if (currentExpected) {
      const diff = cash - currentExpected.expected
      if (diff < 0) {
        setCloseWarning({ type: 'short', amount: Math.abs(diff) })
        return
      }
      if (diff > 0) {
        setCloseWarning({ type: 'over', amount: diff })
        return
      }
    }
    await closeShift(currentShift.id, cash)
    toast({ title: 'تم إغلاق الوردية', variant: 'success' })
    setClosingCash('')
    setCloseWarning(null)
  }

  const confirmClose = async () => {
    if (!currentShift || !closingCash) return
    await closeShift(currentShift.id, parseFloat(closingCash))
    toast({ title: 'تم إغلاق الوردية', variant: 'success' })
    setClosingCash('')
    setCloseWarning(null)
  }

  const columns: DataColumn<any>[] = [
    { key: 'date', label: 'التاريخ', render: (s) => <span className="font-bold whitespace-nowrap">{new Date(s.startedAt).toLocaleString('ar-EG')}</span> },
    {
      key: 'status', label: 'الحالة', render: (s) => (
        <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", s.status === 'open' ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground")}>
          {s.status === 'open' ? 'مفتوحة' : 'مغلقة'}
        </span>
      ),
    },
    { key: 'opening', label: 'الافتتاح', render: (s) => <span>{fmtMoney(s.openingCash)} ج.م</span> },
    { key: 'closing', label: 'الإغلاق', render: (s) => <span>{s.closingCash != null ? `${fmtMoney(s.closingCash)} ج.م` : '—'}</span> },
    {
      key: 'diff', label: 'الفرق', render: (s) => {
        const recon = reconciliations[s.id]
        if (s.status !== 'closed' || !recon) return <span className="text-muted-foreground">—</span>
        const d = recon.difference ?? 0
        return (
          <span className={cn("font-bold", d === 0 ? "text-green-500" : d > 0 ? "text-blue-400" : "text-red-500")}>
            {d === 0 ? <CheckCircle className="inline h-3 w-3 ml-1" /> : d > 0 ? '+' : ''}{d.toFixed(0)} ج.م
          </span>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">الورديات</h2>
        {!currentShift && (
          <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowOpen(true)}>
            <Plus className="h-4 w-4" /> فتح وردية
          </Button>
        )}
      </div>

      {/* Current shift card */}
      {currentShift && (
        <div className="mx-5 mt-4 p-4 border-2 border-green-500/30 bg-green-500/5 rounded-2xl space-y-3 animate-slide-up">
          <div className="flex items-center gap-2">
            <Unlock className="h-4 w-4 text-green-500" />
            <h3 className="font-bold text-sm text-green-500">الوردية الحالية مفتوحة</h3>
          </div>
          <p className="text-xs text-muted-foreground">رصيد الافتتاح: <span className="font-bold text-foreground">{fmtMoney(currentShift.openingCash)} ج.م</span></p>

          {/* Expected cash display */}
          {currentExpected && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-blue-400">
                <Wallet className="h-3.5 w-3.5" />
                <span className="text-[11px] font-bold">المتوقع في الدرج</span>
              </div>
              <p className="text-lg font-black text-blue-400">{currentExpected.expected.toFixed(0)} ج.م</p>
              {Object.keys(currentExpected.breakdown).length > 0 && (
                <div className="text-[10px] text-muted-foreground space-y-0.5 mt-1">
                  {Object.entries(currentExpected.breakdown).map(([type, amount]) => (
                    <div key={type} className="flex justify-between">
                      <span>{type === 'SALE' ? 'مبيعات' : type === 'REFUND' ? 'مرتجعات' : type === 'CASH_IN' ? 'إيداع' : type === 'CASH_OUT' ? 'سحب' : type}</span>
                      <span className={cn("font-bold", (amount as number) >= 0 ? "text-green-400" : "text-red-400")}>
                        {(amount as number) >= 0 ? '+' : ''}{(amount as number).toFixed(0)} ج.م
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="number" value={closingCash} onChange={e => { setClosingCash(e.target.value); setCloseWarning(null) }} placeholder="رصيد الإغلاق (عد الكاش)"
              className="flex-1 px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            <Button variant="destructive" size="sm" className="rounded-xl gap-1" onClick={handleClose}>
              <Lock className="h-3.5 w-3.5" /> إغلاق الوردية
            </Button>
          </div>

          {/* Close warning: short/over detection */}
          {closeWarning && (
            <div className={cn("p-3 rounded-xl border-2 animate-slide-up space-y-2",
              closeWarning.type === 'short' ? "bg-red-500/5 border-red-500/30" : "bg-blue-500/5 border-blue-500/30"
            )}>
              <div className="flex items-center gap-2">
                {closeWarning.type === 'short'
                  ? <TrendingDown className="h-4 w-4 text-red-500" />
                  : <TrendingUp className="h-4 w-4 text-blue-400" />}
                <span className={cn("text-sm font-bold", closeWarning.type === 'short' ? "text-red-500" : "text-blue-400")}>
                  {closeWarning.type === 'short' ? 'نقص في الكاش' : 'زيادة في الكاش'}
                </span>
              </div>
              <p className={cn("text-lg font-black", closeWarning.type === 'short' ? "text-red-500" : "text-blue-400")}>
                {closeWarning.type === 'short' ? '-' : '+'}{closeWarning.amount.toFixed(0)} ج.م
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" className="rounded-xl flex-1" onClick={confirmClose}>تأكيد الإغلاق</Button>
                <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setCloseWarning(null)}>إلغاء</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Open shift dialog */}
      {showOpen && !currentShift && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <h3 className="font-bold text-sm">فتح وردية جديدة</h3>
          <input type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="رصيد الافتتاح (الكاش في الدرج)"
            className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
          {openError && <p className="text-xs text-red-500 font-bold">{openError}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl flex-1" onClick={handleOpen}>فتح</Button>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setShowOpen(false); setOpenError('') }}>إلغاء</Button>
          </div>
        </div>
      )}

      {/* Date range filter */}
      <div className="flex items-center gap-2 px-5 pt-3">
        <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="من تاريخ" className="w-44" />
        <span className="text-xs text-muted-foreground shrink-0">إلى</span>
        <DatePicker value={dateTo} onChange={setDateTo} placeholder="إلى تاريخ" className="w-44" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo('') }} className="h-11 px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0">مسح</button>
        )}
      </div>

      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث عن وردية..."
        view={view}
        onViewChange={setView}
        filters={[
          { value: null, label: 'الكل', count: shifts.length },
          { value: 'open', label: 'مفتوحة', count: shifts.filter(s => s.status === 'open').length },
          { value: 'closed', label: 'مغلقة', count: shifts.filter(s => s.status === 'closed').length },
        ]}
        filterValue={statusFilter}
        onFilterChange={(v) => { setStatusFilter(v); list.setPage(1) }}
      />

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable columns={columns} data={list.items} keyExtractor={(s) => s.id} />
        </div>
      ) : (
        <ScrollArea className="flex-1 p-5">
          <div className="space-y-3">
            {list.items.map(s => {
            const recon = reconciliations[s.id]
            const isOpen = s.status === 'open'
            return (
              <div key={s.id} className="border-2 rounded-2xl bg-card p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", isOpen ? "bg-green-500/10" : "bg-secondary")}>
                    {isOpen ? <Unlock className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">{new Date(s.startedAt).toLocaleString('ar-EG')}</p>
                    {s.endedAt && (
                      <p className="text-[10px] text-muted-foreground">
                        المدة: {Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 3600000)} ساعة
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      افتتاح: <span className="font-medium text-foreground">{fmtMoney(s.openingCash)} ج.م</span>
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", isOpen ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground")}>
                    {isOpen ? 'مفتوحة' : 'مغلقة'}
                  </span>
                </div>

                {/* Closed shift reconciliation */}
                {!isOpen && s.closingCash != null && recon && (
                  <div className="space-y-2 animate-slide-up">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">المتوقع</p>
                        <p className="font-bold">{fmtMoney(recon.expected || 0)} ج.م</p>
                      </div>
                      <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">الفعلي</p>
                        <p className="font-bold">{s.closingCash != null ? fmtMoney(s.closingCash) : '—'} ج.م</p>
                      </div>
                      <div className={cn("rounded-xl p-2.5 text-center", recon.difference === 0 ? "bg-green-500/10" : recon.difference > 0 ? "bg-blue-500/10" : "bg-red-500/10")}>
                        <p className="text-[10px] text-muted-foreground mb-0.5">الفرق</p>
                        <div className="flex items-center justify-center gap-1">
                          {recon.difference === 0 ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                          )}
                          <p className={cn("font-bold", recon.difference === 0 ? "text-green-500" : recon.difference > 0 ? "text-blue-400" : "text-red-500")}>
                            {recon.difference > 0 ? '+' : ''}{recon.difference?.toFixed(0) || 0} ج.م
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Short detection alert */}
                    {recon.difference < -50 && (
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                        <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        <span className="text-[10px] font-bold text-red-500">نقص {Math.abs(recon.difference).toFixed(0)} ج.م — يحتاج مراجعة</span>
                      </div>
                    )}

                    {/* Breakdown */}
                    {recon.breakdown && Object.keys(recon.breakdown).length > 0 && (
                      <div className="bg-secondary/40 rounded-xl p-2.5 text-[10px] space-y-1">
                        <p className="font-bold text-muted-foreground mb-1">تفاصيل الحركات:</p>
                        {Object.entries(recon.breakdown).map(([type, amount]: [string, any]) => (
                          <div key={type} className="flex justify-between">
                            <span className="text-muted-foreground">
                              {type === 'SALE' ? 'مبيعات' : type === 'REFUND' ? 'مرتجعات' : type === 'CASH_IN' ? 'إيداع' : type === 'CASH_OUT' ? 'سحب' : type}
                            </span>
                            <span className={cn("font-bold", amount >= 0 ? "text-green-400" : "text-red-400")}>
                              {amount >= 0 ? '+' : ''}{amount?.toFixed(0) || 0} ج.م
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
            {list.items.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-10">لا توجد ورديات مطابقة</p>
            )}
          </div>
        </ScrollArea>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />
    </div>
  )
}
