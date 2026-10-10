import { useEffect, useState, useMemo } from 'react'
import { useCashDrawerStore } from '@/services/cash-drawer/cash-drawer.store'
import { useShiftStore } from '@/services/shift/shift.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Minus, ArrowDownLeft, ArrowUpRight, Wallet, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import type { ViewMode } from '@/components/ui/view-toggle'

const movementLabels: Record<string, { label: string; icon: typeof Plus; color: string }> = {
  OPENING: { label: 'افتتاح', icon: Wallet, color: 'text-blue-400' },
  SALE: { label: 'بيع', icon: ArrowDownLeft, color: 'text-green-500' },
  REFUND: { label: 'استرداد', icon: ArrowUpRight, color: 'text-red-500' },
  CASH_IN: { label: 'إيداع', icon: Plus, color: 'text-green-500' },
  CASH_OUT: { label: 'سحب', icon: Minus, color: 'text-red-500' },
  CLOSING: { label: 'إغلاق', icon: Wallet, color: 'text-muted-foreground' },
}

export function CashDrawerPage() {
  const movements = useCashDrawerStore((s) => s.movements)
  const fetchByShift = useCashDrawerStore((s) => s.fetchByShift)
  const addMovement = useCashDrawerStore((s) => s.addMovement)
  const shifts = useShiftStore((s) => s.shifts)
  const currentShift = useShiftStore((s) => s.currentShift)
  const fetchShifts = useShiftStore((s) => s.fetch)
  const fetchCurrent = useShiftStore((s) => s.fetchCurrent)

  const [showForm, setShowForm] = useState(false)
  const [movType, setMovType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN')
  const [movAmount, setMovAmount] = useState('')
  const [movNote, setMovNote] = useState('')
  const [view, setView] = useState<ViewMode>('table')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [showShiftPicker, setShowShiftPicker] = useState(false)

  useEffect(() => {
    fetchCurrent()
    fetchShifts()
  }, [])

  const activeShiftId = selectedShiftId || currentShift?.id

  useEffect(() => {
    if (activeShiftId) fetchByShift(activeShiftId)
  }, [activeShiftId])

  const selectedShift = useMemo(() =>
    shifts.find(s => s.id === activeShiftId) || currentShift,
    [shifts, activeShiftId, currentShift]
  )

  const isOpenShift = selectedShift?.status === 'open'

  const list = useListControls({
    items: movements,
    searchText: (m) => `${m.note || ''} ${movementLabels[m.type]?.label || ''}`,
    filter: (m) => !typeFilter || m.type === typeFilter,
  })
  const isIn = (t: string) => ['SALE', 'CASH_IN', 'OPENING'].includes(t)

  const handleAdd = async () => {
    if (activeShiftId && movAmount) {
      await addMovement({ shiftId: activeShiftId, type: movType, amount: parseFloat(movAmount), note: movNote || undefined })
      setMovAmount('')
      setMovNote('')
      setShowForm(false)
    }
  }

  const totalIn = movements.filter(m => isIn(m.type)).reduce((s, m) => s + m.amount, 0)
  const totalOut = movements.filter(m => ['REFUND', 'CASH_OUT'].includes(m.type)).reduce((s, m) => s + m.amount, 0)

  const columns: DataColumn<any>[] = [
    {
      key: 'type', label: 'النوع', render: (m) => {
        const config = movementLabels[m.type] || { label: m.type, icon: Wallet, color: 'text-muted-foreground' }
        return <span className={cn("font-bold", config.color)}>{config.label}</span>
      },
    },
    { key: 'note', label: 'ملاحظة', render: (m) => <span className="text-muted-foreground">{m.note || '—'}</span> },
    {
      key: 'amount', label: 'المبلغ', className: 'text-left', render: (m) => (
        <span className={cn("font-black", isIn(m.type) ? "text-green-500" : "text-red-500")}>
          {isIn(m.type) ? '+' : '-'}{fmtMoney(m.amount)} ج.م
        </span>
      ),
    },
    { key: 'time', label: 'الوقت', sortValue: (m: any) => m.createdAt, render: (m) => <span className="text-[11px]">{new Date(m.createdAt).toLocaleString('ar-EG')}</span> },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-black">درج الكاش</h2>
          {selectedShift && (
            <div className="relative">
              <button onClick={() => setShowShiftPicker(!showShiftPicker)}
                className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-secondary rounded-full px-2.5 py-1 hover:text-foreground cursor-pointer transition-colors">
                {selectedShift.status === 'open' ? 'الوردية الحالية' : new Date(selectedShift.startedAt).toLocaleDateString('ar-EG')}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showShiftPicker && (
                <div className="absolute top-full mt-1 right-0 bg-card border-2 rounded-xl shadow-lg z-50 w-56 max-h-48 overflow-auto animate-slide-up">
                  {shifts.slice(0, 20).map(s => (
                    <button key={s.id} onClick={() => { setSelectedShiftId(s.id); setShowShiftPicker(false) }}
                      className={cn("w-full text-right px-3 py-2 text-[11px] font-medium hover:bg-secondary cursor-pointer transition-colors flex items-center justify-between",
                        s.id === activeShiftId && "bg-primary/10 text-primary font-bold")}>
                      <span>{new Date(s.startedAt).toLocaleDateString('ar-EG')} {new Date(s.startedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={cn("text-[9px] font-bold rounded-full px-1.5 py-0.5", s.status === 'open' ? "bg-green-500/10 text-green-500" : "bg-secondary")}>
                        {s.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => {
          if (isOpenShift) setShowForm(!showForm)
        }} disabled={!isOpenShift} title={!isOpenShift ? 'افتح وردية أولاً لتسجيل حركات' : ''}>
          <Plus className="h-4 w-4" /> حركة جديدة
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 px-5 py-3">
        <div className="bg-green-500/5 border-2 border-green-500/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-green-500 font-bold">الوارد</p>
          <p className="font-black text-green-500">{fmtMoney(totalIn)} ج.م</p>
        </div>
        <div className="bg-red-500/5 border-2 border-red-500/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-red-500 font-bold">الصادر</p>
          <p className="font-black text-red-500">{fmtMoney(totalOut)} ج.م</p>
        </div>
        <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-primary font-bold">الصافي</p>
          <p className="font-black text-primary">{fmtMoney(totalIn - totalOut)} ج.م</p>
        </div>
      </div>

      {!activeShiftId && (
        <div className="mx-5 mb-3 p-4 border-2 border-dashed border-border rounded-2xl text-center space-y-2">
          <Wallet className="h-6 w-6 text-muted-foreground mx-auto" />
          <p className="text-xs font-bold text-muted-foreground">افتح وردية أولاً لعرض وتسجيل الحركات</p>
        </div>
      )}

      {/* Add movement form */}
      {showForm && isOpenShift && (
        <div className="mx-5 mb-3 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="flex gap-2">
            <button onClick={() => setMovType('CASH_IN')} className={cn("flex-1 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all", movType === 'CASH_IN' ? "bg-green-500 text-white" : "bg-secondary text-muted-foreground")}>إيداع</button>
            <button onClick={() => setMovType('CASH_OUT')} className={cn("flex-1 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all", movType === 'CASH_OUT' ? "bg-red-500 text-white" : "bg-secondary text-muted-foreground")}>سحب</button>
          </div>
          <input type="number" value={movAmount} onChange={e => setMovAmount(e.target.value)} placeholder="المبلغ"
            className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
          <input type="text" value={movNote} onChange={e => setMovNote(e.target.value)} placeholder="ملاحظة (اختياري)"
            className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl flex-1" onClick={handleAdd}>تسجيل</Button>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setShowForm(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      {/* Movements list */}
      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث عن حركة..."
        view={view}
        onViewChange={setView}
        filters={[
          { value: null, label: 'الكل', count: movements.length },
          ...Object.entries(movementLabels).map(([value, c]) => ({ value, label: c.label, count: movements.filter(m => m.type === value).length })),
        ]}
        filterValue={typeFilter}
        onFilterChange={(v) => { setTypeFilter(v); list.setPage(1) }}
      />

      {view === 'table' ? (
        <div className="flex-1 px-5 overflow-auto">
          <DataTable columns={columns} data={list.items} keyExtractor={(m) => m.id} sort={list.sort} onSortChange={list.setSort} />
        </div>
      ) : (
        <ScrollArea className="flex-1 px-5 pb-5">
          <div className="space-y-1.5">
            {list.items.map(m => {
              const config = movementLabels[m.type] || { label: m.type, icon: Wallet, color: 'text-muted-foreground' }
              const Icon = config.icon
              return (
                <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
                  <div className={cn("w-8 h-8 rounded-lg bg-secondary flex items-center justify-center", config.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">{config.label}</p>
                    {m.note && <p className="text-[10px] text-muted-foreground">{m.note}</p>}
                  </div>
                  <span className={cn("font-black text-sm", ['SALE', 'CASH_IN', 'OPENING'].includes(m.type) ? "text-green-500" : "text-red-500")}>
                    {['SALE', 'CASH_IN', 'OPENING'].includes(m.type) ? '+' : '-'}{fmtMoney(m.amount)} ج.م
                  </span>
                </div>
              )
            })}
            {list.items.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">لا توجد حركات</p>
            )}
          </div>
        </ScrollArea>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />
    </div>
  )
}
