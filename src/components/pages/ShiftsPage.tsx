import { useEffect, useState } from 'react'
import { useShiftStore } from '@/services/shift/shift.store'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Lock, Unlock, AlertTriangle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ShiftsPage() {
  const shifts = useShiftStore((s) => s.shifts)
  const currentShift = useShiftStore((s) => s.currentShift)
  const fetch = useShiftStore((s) => s.fetch)
  const fetchCurrent = useShiftStore((s) => s.fetchCurrent)
  const openShift = useShiftStore((s) => s.open)
  const closeShift = useShiftStore((s) => s.close)
  const currentUser = useUserStore((s) => s.currentUser)
  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [showOpen, setShowOpen] = useState(false)
  const [reconciliations, setReconciliations] = useState<Record<string, any>>({})

  useEffect(() => { fetch(); fetchCurrent() }, [])

  // Load reconciliation data for closed shifts
  useEffect(() => {
    const loadReconciliations = async () => {
      const results: Record<string, any> = {}
      for (const s of shifts) {
        if (s.status === 'closed') {
          results[s.id] = await window.api.cashDrawer.reconcile(s.id)
        }
      }
      setReconciliations(results)
    }
    loadReconciliations()
  }, [shifts])

  const handleOpen = async () => {
    if (currentUser && openingCash) {
      await openShift({ userId: currentUser.id, openingCash: parseFloat(openingCash) })
      setOpeningCash('')
      setShowOpen(false)
    }
  }

  const handleClose = async () => {
    if (currentShift && closingCash) {
      await closeShift(currentShift.id, parseFloat(closingCash))
      setClosingCash('')
    }
  }

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
          <p className="text-xs text-muted-foreground">رصيد الافتتاح: <span className="font-bold text-foreground">{currentShift.openingCash} ج.م</span></p>
          <div className="flex items-center gap-2">
            <input type="number" value={closingCash} onChange={e => setClosingCash(e.target.value)} placeholder="رصيد الإغلاق (عد الكاش)"
              className="flex-1 px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            <Button variant="destructive" size="sm" className="rounded-xl gap-1" onClick={handleClose}>
              <Lock className="h-3.5 w-3.5" /> إغلاق الوردية
            </Button>
          </div>
        </div>
      )}

      {/* Open shift dialog */}
      {showOpen && !currentShift && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <h3 className="font-bold text-sm">فتح وردية جديدة</h3>
          <input type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="رصيد الافتتاح (الكاش في الدرج)"
            className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
          <div className="flex gap-2">
            <Button size="sm" className="rounded-xl flex-1" onClick={handleOpen}>فتح</Button>
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setShowOpen(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      {/* Shift history */}
      <ScrollArea className="flex-1 p-5">
        <div className="space-y-3">
          {shifts.map(s => {
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
                    <p className="text-[10px] text-muted-foreground">
                      افتتاح: <span className="font-medium text-foreground">{s.openingCash} ج.م</span>
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
                        <p className="font-bold">{recon.expected?.toFixed(0) || '—'} ج.م</p>
                      </div>
                      <div className="bg-secondary/60 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-muted-foreground mb-0.5">الفعلي</p>
                        <p className="font-bold">{s.closingCash} ج.م</p>
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
        </div>
      </ScrollArea>
    </div>
  )
}
