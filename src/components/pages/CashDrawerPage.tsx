import { useEffect, useState } from 'react'
import { useCashDrawerStore } from '@/services/cash-drawer/cash-drawer.store'
import { useShiftStore } from '@/services/shift/shift.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Minus, ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const currentShift = useShiftStore((s) => s.currentShift)
  const fetchCurrent = useShiftStore((s) => s.fetchCurrent)
  const [showForm, setShowForm] = useState(false)
  const [movType, setMovType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN')
  const [movAmount, setMovAmount] = useState('')
  const [movNote, setMovNote] = useState('')

  useEffect(() => {
    fetchCurrent()
  }, [])

  useEffect(() => {
    if (currentShift) fetchByShift(currentShift.id)
  }, [currentShift])

  const handleAdd = async () => {
    if (currentShift && movAmount) {
      await addMovement({ shiftId: currentShift.id, type: movType, amount: parseFloat(movAmount), note: movNote || undefined })
      setMovAmount('')
      setMovNote('')
      setShowForm(false)
    }
  }

  const totalIn = movements.filter(m => ['SALE', 'CASH_IN', 'OPENING'].includes(m.type)).reduce((s, m) => s + m.amount, 0)
  const totalOut = movements.filter(m => ['REFUND', 'CASH_OUT'].includes(m.type)).reduce((s, m) => s + m.amount, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">درج الكاش</h2>
        {currentShift && (
          <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" /> حركة جديدة
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 px-5 py-3">
        <div className="bg-green-500/5 border-2 border-green-500/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-green-500 font-bold">الوارد</p>
          <p className="font-black text-green-500">{totalIn} ج.م</p>
        </div>
        <div className="bg-red-500/5 border-2 border-red-500/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-red-500 font-bold">الصادر</p>
          <p className="font-black text-red-500">{totalOut} ج.م</p>
        </div>
        <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-3 text-center">
          <p className="text-[10px] text-primary font-bold">الصافي</p>
          <p className="font-black text-primary">{totalIn - totalOut} ج.م</p>
        </div>
      </div>

      {/* Add movement form */}
      {showForm && currentShift && (
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
      <ScrollArea className="flex-1 px-5 pb-5">
        <div className="space-y-1.5">
          {movements.map(m => {
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
                  {['SALE', 'CASH_IN', 'OPENING'].includes(m.type) ? '+' : '-'}{m.amount} ج.م
                </span>
              </div>
            )
          })}
          {movements.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">لا توجد حركات</p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
