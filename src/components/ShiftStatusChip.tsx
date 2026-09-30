import { useEffect, useState } from 'react'
import { useShiftStore } from '@/services/shift/shift.store'
import { Unlock, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ShiftStatusChip({ onOpenShift }: { onOpenShift: () => void }) {
  const currentShift = useShiftStore((s) => s.currentShift)
  const fetchCurrent = useShiftStore((s) => s.fetchCurrent)
  const getReport = useShiftStore((s) => s.getReport)
  const [info, setInfo] = useState<{ userName?: string; orderCount?: number } | null>(null)

  useEffect(() => {
    fetchCurrent()
  }, [fetchCurrent])

  useEffect(() => {
    setInfo(null)
    if (!currentShift) return
    let alive = true
    const load = () => {
      getReport(currentShift.id).then((r) => {
        if (alive && r) setInfo({ userName: r.userName, orderCount: r.orderCount })
      })
    }
    load()
    const timer = setInterval(load, 15000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [currentShift, getReport])

  if (!currentShift) {
    return (
      <button
        onClick={onOpenShift}
        className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-500 transition-colors hover:bg-amber-500/20 cursor-pointer"
        title="افتح وردية لبدء استقبال الطلبات"
      >
        <Lock className="h-3.5 w-3.5" />
        لا توجد وردية
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5">فتح وردية</span>
      </button>
    )
  }

  return (
    <button
      onClick={onOpenShift}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
        "border-green-500/40 bg-green-500/10 text-green-500 hover:bg-green-500/20"
      )}
      title="اذهب إلى ورديتي"
    >
      <Unlock className="h-3.5 w-3.5" />
      <span>الوردية #{currentShift.number ?? 0}</span>
      {info?.userName && <span className="text-muted-foreground">{info.userName}</span>}
      <span className="rounded-full bg-green-500/20 px-2 py-0.5">{info?.orderCount ?? 0} طلب</span>
    </button>
  )
}