import { useEffect, useState } from 'react'
import { useShiftStore } from '@/services/shift/shift.store'
import { useCashDrawerStore } from '@/services/cash-drawer/cash-drawer.store'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { Lock, Unlock, Wallet, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MyShiftPage() {
  const currentShift = useShiftStore((s) => s.currentShift)
  const fetchCurrent = useShiftStore((s) => s.fetchCurrent)
  const openShift = useShiftStore((s) => s.open)
  const closeShift = useShiftStore((s) => s.close)
  const currentUser = useUserStore((s) => s.currentUser)
  const expectedCash = useCashDrawerStore((s) => s.expectedCash)
  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')
  const [currentExpected, setCurrentExpected] = useState<{ expected: number; breakdown: Record<string, number> } | null>(null)
  const [openError, setOpenError] = useState('')
  const [closeWarning, setCloseWarning] = useState<{ type: 'short' | 'over'; amount: number } | null>(null)

  useEffect(() => { fetchCurrent() }, [])

  useEffect(() => {
    if (currentShift) {
      expectedCash(currentShift.id).then(setCurrentExpected)
    } else {
      setCurrentExpected(null)
    }
  }, [currentShift])

  const handleOpen = async () => {
    setOpenError('')
    if (currentUser && openingCash) {
      try {
        await openShift({ userId: currentUser.id, openingCash: parseFloat(openingCash) })
        setOpeningCash('')
      } catch (err: any) {
        setOpenError(err.message || 'خطأ في فتح الوردية')
      }
    }
  }

  const handleClose = async () => {
    setCloseWarning(null)
    if (currentShift && closingCash) {
      const cash = parseFloat(closingCash)
      if (isNaN(cash) || cash < 0) return
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
      setClosingCash('')
      setCloseWarning(null)
    }
  }

  const confirmClose = async () => {
    if (currentShift && closingCash) {
      await closeShift(currentShift.id, parseFloat(closingCash))
      setClosingCash('')
      setCloseWarning(null)
    }
  }

  return (
    <div className="flex items-center justify-center h-full p-5">
      <div className="w-[400px] space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-primary/10">
            <Wallet className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-black">ورديتي</h2>
          <p className="text-sm text-muted-foreground">{currentUser?.name}</p>
        </div>

        {currentShift ? (
          <div className="border-2 border-green-500/30 bg-green-500/5 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 justify-center">
              <Unlock className="h-5 w-5 text-green-500" />
              <h3 className="font-black text-green-500">الوردية مفتوحة</h3>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">رصيد الافتتاح</p>
              <p className="text-3xl font-black text-primary">{currentShift.openingCash} <span className="text-sm">ج.م</span></p>
            </div>

            {/* Expected cash display */}
            {currentExpected && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-blue-400">
                  <Wallet className="h-4 w-4" />
                  <span className="text-xs font-bold">المتوقع في الدرج</span>
                </div>
                <p className="text-2xl font-black text-blue-400 text-center">{currentExpected.expected.toFixed(0)} <span className="text-sm">ج.م</span></p>
                {Object.keys(currentExpected.breakdown).length > 0 && (
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
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

            <div className="space-y-2">
              <input type="number" value={closingCash} onChange={e => { setClosingCash(e.target.value); setCloseWarning(null) }} placeholder="رصيد الإغلاق (عد الكاش)"
                className="w-full px-4 py-3 rounded-xl bg-secondary text-sm border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none text-center font-bold" />
              <Button variant="destructive" className="w-full rounded-2xl h-12 font-black gap-2" onClick={handleClose}>
                <Lock className="h-5 w-5" /> إغلاق الوردية
              </Button>
            </div>

            {/* Close warning */}
            {closeWarning && (
              <div className={cn("p-4 rounded-xl border-2 animate-slide-up space-y-3",
                closeWarning.type === 'short' ? "bg-red-500/5 border-red-500/30" : "bg-blue-500/5 border-blue-500/30"
              )}>
                <div className="flex items-center gap-2">
                  {closeWarning.type === 'short'
                    ? <TrendingDown className="h-5 w-5 text-red-500" />
                    : <TrendingUp className="h-5 w-5 text-blue-400" />}
                  <span className={cn("text-sm font-bold", closeWarning.type === 'short' ? "text-red-500" : "text-blue-400")}>
                    {closeWarning.type === 'short' ? 'نقص في الكاش' : 'زيادة في الكاش'}
                  </span>
                </div>
                <p className={cn("text-2xl font-black text-center", closeWarning.type === 'short' ? "text-red-500" : "text-blue-400")}>
                  {closeWarning.type === 'short' ? '-' : '+'}{closeWarning.amount.toFixed(0)} ج.م
                </p>
                <div className="flex gap-2">
                  <Button variant="destructive" className="rounded-2xl flex-1 font-bold gap-1" onClick={confirmClose}>
                    <Lock className="h-4 w-4" /> تأكيد الإغلاق
                  </Button>
                  <Button variant="ghost" className="rounded-2xl font-bold" onClick={() => setCloseWarning(null)}>إلغاء</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="border-2 rounded-2xl bg-card p-6 space-y-4">
            <h3 className="font-black text-center">فتح وردية جديدة</h3>
            <input type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="رصيد الافتتاح (الكاش في الدرج)"
              className="w-full px-4 py-3 rounded-xl bg-secondary text-sm border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none text-center font-bold" />
            {openError && <p className="text-xs text-red-500 font-bold text-center">{openError}</p>}
            <Button className="w-full rounded-2xl h-12 font-black gap-2" onClick={handleOpen}>
              <Unlock className="h-5 w-5" /> فتح الوردية
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
