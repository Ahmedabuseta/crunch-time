import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useOrderStore } from '@/services/order/order.store'
import { useProfileStore } from '@/services/delivery/delivery.store'
import { useUserStore } from '@/services/user/user.store'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Truck, Phone, Wallet, Bike } from 'lucide-react'
import { fmtMoney } from '@/lib/format'
import type { DriverSummary } from '@/services/report/report.types'

function clock(iso: string) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const period = h < 12 ? 'ص' : 'م'
  const h12 = h % 12 || 12
  return `${h12}:${m} ${period}`
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Delivery workflow hub (shared top tab — cashier and admin both land here).
 * Three jobs: clear بدون سائق orders, watch مع سائق orders per driver, and
 * (admin only) settle what each driver collected in COD cash for the day.
 */
export function DeliveryPage({ onAssigned }: { onAssigned?: () => void }) {
  const orders = useOrderStore((s) => s.orders)
  const fetchOrders = useOrderStore((s) => s.fetch)
  const assignDriver = useOrderStore((s) => s.assignDriver)
  const profiles = useProfileStore((s) => s.profiles)
  const fetchProfiles = useProfileStore((s) => s.fetch)
  const currentUser = useUserStore((s) => s.currentUser)
  const isAdmin = currentUser?.role === 'admin'

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [driverFilter, setDriverFilter] = useState<string>('all')

  // Settlement (admin only)
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [summary, setSummary] = useState<DriverSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  useEffect(() => {
    fetchOrders()
    fetchProfiles()
    // Inactive drivers stay visible in history through the name stored on the
    // order itself; assignment only ever offers the active ones.
  }, [fetchOrders, fetchProfiles])

  const deliveryOrders = useMemo(
    () => orders.filter((o) => o.orderType === 'delivery'),
    [orders],
  )
  const unassigned = useMemo(
    () => deliveryOrders.filter((o) => o.driverStatus === 'unassigned'),
    [deliveryOrders],
  )
  const assigned = useMemo(
    () => deliveryOrders.filter((o) => o.driverStatus === 'assigned'),
    [deliveryOrders],
  )

  const loadSummary = async () => {
    setSummaryLoading(true)
    try {
      setSummary(await window.api.report.driverSummary({ from, to }) as DriverSummary)
    } catch (e: any) {
      toast({ title: 'فشل جلب تقرير الديلفري', description: e?.message || '', variant: 'error' })
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) loadSummary()
    // Reload whenever the range changes; admin-only so cashiers never hit it.
  }, [isAdmin, from, to])

  const assign = async (orderId: string, profileId: string) => {
    setPendingId(orderId)
    try {
      await assignDriver(orderId, profileId)
      const driver = profiles.find((p) => p.id === profileId)?.name || 'السائق'
      toast({
        title: `اتعيّن ${driver} على الطلب ${orderId}`,
        description: 'الإيصال بتاع العميل يقدر يتطبع دلوقتي',
        variant: 'success',
        duration: 5000,
      })
      onAssigned?.()
    } catch (e: any) {
      // Roll the picker back to the order's real state.
      setChosen((c) => { const n = { ...c }; delete n[orderId]; return n })
      toast({ title: 'فشل تعيين السائق', description: e?.message || '', variant: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  const driverPicker = (orderId: string) => (
    <Select
      value={chosen[orderId] || ''}
      disabled={pendingId === orderId}
      onValueChange={(v) => { setChosen((c) => ({ ...c, [orderId]: v })); assign(orderId, v) }}
    >
      <SelectTrigger className="w-[190px] h-9 bg-secondary/60 border-0 cursor-pointer">
        <SelectValue placeholder="اختار سائق…" />
      </SelectTrigger>
      <SelectContent>
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const orderRow = (o: any, action: ReactNode) => (
    <div key={o.id} className="flex items-center justify-between gap-3 border-2 rounded-2xl bg-card p-3 sm:p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-black bg-secondary rounded-lg px-2 py-1">{o.id}</span>
          <span className="text-[11px] text-muted-foreground font-medium">{clock(o.createdAt)}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1.5 truncate">
          {[o.customerName || 'عميل', o.deliveryZoneName, o.customerPhone || o.deliveryPhone]
            .filter(Boolean).join(' · ')}
        </div>
        {o.deliveryNote && (
          <div className="text-[11px] text-amber-400 mt-1 truncate">📝 {o.deliveryNote}</div>
        )}
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="font-black text-primary text-sm whitespace-nowrap">{fmtMoney(o.total)} ج.م</span>
        {action}
      </div>
    </div>
  )

  const emptyState = (text: string) => (
    <div className="border-2 border-dashed rounded-2xl p-8 text-center text-muted-foreground text-sm font-bold">
      {text}
    </div>
  )

  const filteredAssigned = driverFilter === 'all'
    ? assigned
    : assigned.filter((o) => o.deliveryProfileId === driverFilter)

  const moneyCells = (b: { cashTotal: number; visaTotal: number; total: number }) => (
    <>
      <td className="px-3 py-2.5 font-bold text-green-400 whitespace-nowrap">{fmtMoney(b.cashTotal)}</td>
      <td className="px-3 py-2.5 font-bold text-blue-400 whitespace-nowrap">{fmtMoney(b.visaTotal)}</td>
      <td className="px-3 py-2.5 font-black whitespace-nowrap">{fmtMoney(b.total)}</td>
    </>
  )

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black">الديلفري</h1>
            <p className="text-[11px] text-muted-foreground font-medium">
              الطلبات من غير سائق تفضل هنا — الإيصال بتاع العميل يتطبع بعد التعيين
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="bg-amber-500/10 text-amber-400 rounded-full px-3 py-1">بدون سائق: {unassigned.length}</span>
          <span className="bg-blue-500/10 text-blue-400 rounded-full px-3 py-1">مع سائق: {assigned.length}</span>
        </div>
      </div>

      <Tabs defaultValue="unassigned">
        <TabsList>
          <TabsTrigger value="unassigned" className="cursor-pointer">
            بدون سائق
            {unassigned.length > 0 && (
              <span className="ms-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center leading-none">
                {unassigned.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="assigned" className="cursor-pointer">مع سائق</TabsTrigger>
          {isAdmin && <TabsTrigger value="settle" className="cursor-pointer">تصفية اليوم</TabsTrigger>}
        </TabsList>

        {/* ── بدون سائق ─────────────────────────────── */}
        <TabsContent value="unassigned" className="mt-3 space-y-2.5">
          {unassigned.length === 0
            ? emptyState('مفيش طلبات توصيل مستنية سائق 🎉')
            : unassigned.map((o) => (
                orderRow(o, driverPicker(o.id))
              ))}
        </TabsContent>

        {/* ── مع سائق ───────────────────────────────── */}
        <TabsContent value="assigned" className="mt-3 space-y-2.5">
          {assigned.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-muted-foreground">حسب السائق:</span>
              <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger className="w-[200px] h-9 bg-secondary/60 border-0 cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل السائقين</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground font-bold">{filteredAssigned.length} طلب</span>
            </div>
          )}
          {assigned.length === 0
            ? emptyState('مفيش طلبات مع سائق لسه')
            : filteredAssigned.length === 0
              ? emptyState('مفيش طلبات لهذا السائق')
              : filteredAssigned.map((o) => orderRow(
                  o,
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-blue-400 bg-blue-500/10 rounded-full px-2.5 py-1.5 whitespace-nowrap">
                    <Bike className="h-3.5 w-3.5" />
                    {o.deliveryProfileName || 'مع سائق'}
                  </span>,
                ))}
        </TabsContent>

        {/* ── تصفية اليوم (admin only) ───────────────── */}
        {isAdmin && (
          <TabsContent value="settle" className="mt-3 space-y-3">
            <div className="flex items-end gap-2 flex-wrap">
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-muted-foreground">من</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value || today())}
                  className="h-9 rounded-lg bg-secondary/60 border-0 px-2 text-xs font-bold text-foreground cursor-pointer" />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-bold text-muted-foreground">إلى</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value || today())}
                  className="h-9 rounded-lg bg-secondary/60 border-0 px-2 text-xs font-bold text-foreground cursor-pointer" />
              </label>
              <Button size="sm" variant="secondary" className="h-9 cursor-pointer" onClick={loadSummary} disabled={summaryLoading}>
                {summaryLoading ? 'جارٍ التحميل…' : 'تحديث'}
              </Button>
            </div>

            {!summary ? (
              emptyState('مفيش بيانات')
            ) : (
              <div className="border-2 rounded-2xl bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-muted-foreground border-b-2 bg-secondary/40">
                      <th className="text-start px-3 py-2.5 font-bold">السائق</th>
                      <th className="px-3 py-2.5 font-bold">الطلبات</th>
                      <th className="px-3 py-2.5 font-bold text-green-400">كاش يسلّمه</th>
                      <th className="px-3 py-2.5 font-bold text-blue-400">فيزا (مش إيده)</th>
                      <th className="px-3 py-2.5 font-bold">إجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.drivers.map((d) => (
                      <tr key={d.profileId} className="border-b last:border-0">
                        <td className="px-3 py-2.5">
                          <div className="font-bold flex items-center gap-1.5">
                            {d.name}
                            {!d.active && <span className="text-[10px] bg-secondary text-muted-foreground rounded-full px-1.5 py-0.5">معطل</span>}
                          </div>
                          {d.phone && <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{d.phone}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold">{d.orderCount}</td>
                        {moneyCells(d)}
                      </tr>
                    ))}
                    {summary.unassigned.orderCount > 0 && (
                      <tr className="border-t-2 border-dashed bg-amber-500/5">
                        <td className="px-3 py-2.5 font-bold text-amber-400">بدون سائق</td>
                        <td className="px-3 py-2.5 text-center font-bold">{summary.unassigned.orderCount}</td>
                        {moneyCells(summary.unassigned)}
                      </tr>
                    )}
                    <tr className="border-t-2 bg-secondary/60 font-black">
                      <td className="px-3 py-2.5">الإجمالي</td>
                      <td className="px-3 py-2.5 text-center">{summary.totals.orderCount}</td>
                      {moneyCells(summary.totals)}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground font-medium leading-relaxed border-2 border-dashed rounded-2xl p-3 flex gap-2">
              <Wallet className="h-4 w-4 shrink-0 mt-0.5 text-green-400" />
              <span>
                عمود <b className="text-green-400">كاش يسلّمه</b> هو فلوس الديلفري (COD) اللي بيسلّمها في آخر اليوم.
                الباقي (كاش الوردية والفيزا) بيتخلّص من الكاشير نفسه. التقرير للقراءة بس — مفيش تسجيل أو خصم من الوردية.
              </span>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
