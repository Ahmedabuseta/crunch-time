import { useEffect, useState } from 'react'
import { useShiftStore } from '@/services/shift/shift.store'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Lock, Unlock } from 'lucide-react'
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

  useEffect(() => { fetch(); fetchCurrent() }, [])

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
        <div className="mx-5 mt-4 p-4 border-2 border-green-500/30 bg-green-500/5 rounded-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Unlock className="h-4 w-4 text-green-500" />
            <h3 className="font-bold text-sm text-green-500">الوردية الحالية مفتوحة</h3>
          </div>
          <p className="text-xs text-muted-foreground">رصيد الافتتاح: {currentShift.openingCash} ج.م</p>
          <div className="flex items-center gap-2">
            <input type="number" value={closingCash} onChange={e => setClosingCash(e.target.value)} placeholder="رصيد الإغلاق"
              className="flex-1 px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            <Button variant="destructive" size="sm" className="rounded-xl gap-1" onClick={handleClose}>
              <Lock className="h-3.5 w-3.5" /> إغلاق الوردية
            </Button>
          </div>
        </div>
      )}

      {/* Open shift dialog */}
      {showOpen && !currentShift && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3">
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
        <div className="space-y-2">
          {shifts.map(s => (
            <div key={s.id} className="border-2 rounded-xl bg-card p-4 flex items-center gap-4">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", s.status === 'open' ? "bg-green-500/10" : "bg-secondary")}>
                {s.status === 'open' ? <Unlock className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold">{new Date(s.startedAt).toLocaleString('ar-EG')}</p>
                <p className="text-[10px] text-muted-foreground">افتتاح: {s.openingCash} ج.م</p>
              </div>
              {s.status === 'closed' && s.closingCash != null && (
                <div className="text-right">
                  <p className="text-xs font-bold">إغلاق: {s.closingCash} ج.م</p>
                  <p className={cn("text-[10px] font-bold", s.closingCash - s.openingCash >= 0 ? "text-green-500" : "text-red-500")}>
                    الفرق: {s.closingCash - s.openingCash} ج.م
                  </p>
                </div>
              )}
              <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", s.status === 'open' ? "bg-green-500/10 text-green-500" : "bg-secondary text-muted-foreground")}>
                {s.status === 'open' ? 'مفتوحة' : 'مغلقة'}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
