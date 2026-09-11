import { useEffect, useState } from 'react'
import { useShiftStore } from '@/services/shift/shift.store'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { Lock, Unlock, Wallet } from 'lucide-react'

export function MyShiftPage() {
  const currentShift = useShiftStore((s) => s.currentShift)
  const fetchCurrent = useShiftStore((s) => s.fetchCurrent)
  const openShift = useShiftStore((s) => s.open)
  const closeShift = useShiftStore((s) => s.close)
  const currentUser = useUserStore((s) => s.currentUser)
  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')

  useEffect(() => { fetchCurrent() }, [])

  const handleOpen = async () => {
    if (currentUser && openingCash) {
      await openShift({ userId: currentUser.id, openingCash: parseFloat(openingCash) })
      setOpeningCash('')
    }
  }

  const handleClose = async () => {
    if (currentShift && closingCash) {
      await closeShift(currentShift.id, parseFloat(closingCash))
      setClosingCash('')
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
            <div className="space-y-2">
              <input type="number" value={closingCash} onChange={e => setClosingCash(e.target.value)} placeholder="رصيد الإغلاق (عد الكاش)"
                className="w-full px-4 py-3 rounded-xl bg-secondary text-sm border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none text-center font-bold" />
              <Button variant="destructive" className="w-full rounded-2xl h-12 font-black gap-2" onClick={handleClose}>
                <Lock className="h-5 w-5" /> إغلاق الوردية
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-2 rounded-2xl bg-card p-6 space-y-4">
            <h3 className="font-black text-center">فتح وردية جديدة</h3>
            <input type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="رصيد الافتتاح (الكاش في الدرج)"
              className="w-full px-4 py-3 rounded-xl bg-secondary text-sm border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none text-center font-bold" />
            <Button className="w-full rounded-2xl h-12 font-black gap-2" onClick={handleOpen}>
              <Unlock className="h-5 w-5" /> فتح الوردية
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
