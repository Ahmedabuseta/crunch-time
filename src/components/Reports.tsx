import { useOrdersStore } from '@/store/orders'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TrendingUp, ShoppingBag, DollarSign, BarChart3, Clock, XCircle, Package } from 'lucide-react'

export function Reports() {
  const orders = useOrdersStore((s) => s.orders)

  const allOrders = orders
  const completedOrders = orders.filter((o) => o.status !== 'cancelled')
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled')
  const totalRevenue = completedOrders.reduce((s, o) => s + o.total, 0)
  const avgOrder = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0

  // Today's orders
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayOrders = completedOrders.filter((o) => o.createdAt >= today)
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total, 0)

  // Item frequency
  const itemCounts: Record<string, { name: string; emoji: string; count: number; revenue: number }> = {}
  completedOrders.forEach((order) => {
    order.items.forEach((item) => {
      const key = item.product.id
      if (!itemCounts[key]) {
        itemCounts[key] = { name: item.product.name, emoji: item.product.emoji, count: 0, revenue: 0 }
      }
      itemCounts[key].count += item.quantity
      itemCounts[key].revenue += item.product.price * item.quantity
    })
  })
  const topItems = Object.values(itemCounts).sort((a, b) => b.count - a.count).slice(0, 8)
  const maxCount = topItems.length > 0 ? topItems[0].count : 1

  // Revenue by category
  const catRevenue: Record<string, number> = {}
  completedOrders.forEach((order) => {
    order.items.forEach((item) => {
      const cat = item.product.category
      catRevenue[cat] = (catRevenue[cat] || 0) + item.product.price * item.quantity
    })
  })
  const catNames: Record<string, string> = {
    burgers: 'برجر',
    pizza: 'بيتزا',
    chicken: 'دجاج',
    sides: 'أطباق جانبية',
    drinks: 'مشروبات',
    desserts: 'حلويات',
  }
  const catEntries = Object.entries(catRevenue).sort(([, a], [, b]) => b - a)
  const maxCatRevenue = catEntries.length > 0 ? catEntries[0][1] : 1

  // Orders by hour
  const hourCounts: Record<number, number> = {}
  const hourRevenue: Record<number, number> = {}
  completedOrders.forEach((o) => {
    const h = o.createdAt.getHours()
    hourCounts[h] = (hourCounts[h] || 0) + 1
    hourRevenue[h] = (hourRevenue[h] || 0) + o.total
  })
  const peakHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0]
  const maxHourOrders = Math.max(...Object.values(hourCounts), 1)

  // Delivery vs dine-in
  const deliveryCount = completedOrders.filter((o) => o.orderType === 'delivery').length
  const dineInCount = completedOrders.filter((o) => o.orderType === 'dine-in').length
  const deliveryRevenue = completedOrders.filter((o) => o.orderType === 'delivery').reduce((s, o) => s + o.total, 0)
  const dineInRevenue = completedOrders.filter((o) => o.orderType === 'dine-in').reduce((s, o) => s + o.total, 0)

  // Addon popularity
  const addonCounts: Record<string, { name: string; emoji: string; count: number; revenue: number }> = {}
  completedOrders.forEach((order) => {
    order.items.forEach((item) => {
      item.addons.forEach((addon) => {
        if (!addonCounts[addon.id]) {
          addonCounts[addon.id] = { name: addon.name, emoji: addon.emoji, count: 0, revenue: 0 }
        }
        addonCounts[addon.id].count += item.quantity
        addonCounts[addon.id].revenue += addon.price * item.quantity
      })
    })
  })
  const topAddons = Object.values(addonCounts).sort((a, b) => b.count - a.count)
  const maxAddonCount = topAddons.length > 0 ? topAddons[0].count : 1

  // Average items per order
  const totalItems = completedOrders.reduce((s, o) => s + o.items.reduce((is, i) => is + i.quantity, 0), 0)
  const avgItemsPerOrder = completedOrders.length > 0 ? totalItems / completedOrders.length : 0

  // Ticket size distribution
  const ticketRanges = [
    { label: '< 50 ج.م', min: 0, max: 50 },
    { label: '50 - 100', min: 50, max: 100 },
    { label: '100 - 200', min: 100, max: 200 },
    { label: '200 - 300', min: 200, max: 300 },
    { label: '300+', min: 300, max: Infinity },
  ]
  const ticketDist = ticketRanges.map((r) => ({
    ...r,
    count: completedOrders.filter((o) => o.total >= r.min && o.total < r.max).length,
  }))
  const maxTicketCount = Math.max(...ticketDist.map((t) => t.count), 1)

  // Status breakdown
  const statusCounts: Record<string, number> = {}
  allOrders.forEach((o) => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
  })
  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: 'جديد', color: 'bg-yellow-500' },
    preparing: { label: 'يحضّر', color: 'bg-blue-500' },
    ready: { label: 'جاهز', color: 'bg-green-500' },
    completed: { label: 'مكتمل', color: 'bg-muted-foreground' },
    cancelled: { label: 'ملغي', color: 'bg-red-500' },
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center">
          <BarChart3 className="h-7 w-7 opacity-40" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold">لا توجد بيانات بعد</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">أكمل طلبات لرؤية التقارير</p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full p-5">
      <div className="space-y-5">

        {/* Stat cards row 1 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<ShoppingBag className="h-5 w-5" />} label="إجمالي الطلبات" value={`${completedOrders.length}`} color="bg-primary/10 text-primary" />
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="إجمالي الإيرادات" value={`${totalRevenue.toFixed(0)} ج.م`} color="bg-green-500/10 text-green-400" />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="متوسط الطلب" value={`${avgOrder.toFixed(0)} ج.م`} color="bg-blue-500/10 text-blue-400" />
          <StatCard icon={<Package className="h-5 w-5" />} label="متوسط أصناف/طلب" value={avgItemsPerOrder.toFixed(1)} color="bg-purple-500/10 text-purple-400" />
        </div>

        {/* Stat cards row 2 — today */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="إيرادات اليوم" value={`${todayRevenue.toFixed(0)} ج.م`} color="bg-green-500/10 text-green-400" />
          <StatCard icon={<ShoppingBag className="h-5 w-5" />} label="طلبات اليوم" value={`${todayOrders.length}`} color="bg-primary/10 text-primary" />
          <StatCard icon={<Clock className="h-5 w-5" />} label="ساعة الذروة" value={peakHour ? `${peakHour[0]}:00` : '—'} color="bg-orange-500/10 text-orange-400" />
          <StatCard icon={<XCircle className="h-5 w-5" />} label="نسبة الإلغاء" value={`${allOrders.length > 0 ? ((cancelledOrders.length / allOrders.length) * 100).toFixed(0) : 0}%`} color="bg-red-500/10 text-red-400" />
        </div>

        {/* Hourly orders chart */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <h3 className="text-sm font-black">الطلبات حسب الساعة</h3>
          <div className="flex items-end gap-1.5 h-28">
            {Array.from({ length: 24 }, (_, h) => h).map((h) => {
              const count = hourCounts[h] || 0
              const height = count > 0 ? (count / maxHourOrders) * 100 : 0
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-1">
                  {count > 0 && <span className="text-[8px] font-bold text-primary">{count}</span>}
                  <div className="w-full flex items-end" style={{ height: '80px' }}>
                    <div
                      className="w-full rounded-t-md bg-primary/80 transition-all"
                      style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}
                    />
                  </div>
                  <span className="text-[7px] text-muted-foreground font-medium">{h}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Delivery vs Dine-in */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <h3 className="text-sm font-black">نوع الطلب</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/60 rounded-xl p-3 text-center space-y-1">
              <p className="text-2xl font-black text-primary">{deliveryCount}</p>
              <p className="text-[10px] text-muted-foreground font-bold">توصيل</p>
              <p className="text-xs font-bold text-primary">{deliveryRevenue.toFixed(0)} ج.م</p>
            </div>
            <div className="bg-secondary/60 rounded-xl p-3 text-center space-y-1">
              <p className="text-2xl font-black text-blue-400">{dineInCount}</p>
              <p className="text-[10px] text-muted-foreground font-bold">صالة</p>
              <p className="text-xs font-bold text-blue-400">{dineInRevenue.toFixed(0)} ج.م</p>
            </div>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex bg-secondary">
            {deliveryCount > 0 && <div className="bg-primary h-full transition-all" style={{ width: `${(deliveryCount / completedOrders.length) * 100}%` }} />}
            {dineInCount > 0 && <div className="bg-blue-500 h-full transition-all" style={{ width: `${(dineInCount / completedOrders.length) * 100}%` }} />}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
            <span>توصيل {completedOrders.length > 0 ? ((deliveryCount / completedOrders.length) * 100).toFixed(0) : 0}%</span>
            <span>صالة {completedOrders.length > 0 ? ((dineInCount / completedOrders.length) * 100).toFixed(0) : 0}%</span>
          </div>
        </div>

        {/* Ticket size distribution */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <h3 className="text-sm font-black">توزيع قيمة الطلب</h3>
          <div className="space-y-2">
            {ticketDist.map((t) => (
              <div key={t.label} className="flex items-center gap-3">
                <span className="text-xs font-bold w-20 text-muted-foreground">{t.label}</span>
                <div className="flex-1 h-6 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full transition-all flex items-center justify-end px-2"
                    style={{ width: `${Math.max((t.count / maxTicketCount) * 100, t.count > 0 ? 12 : 0)}%` }}
                  >
                    {t.count > 0 && <span className="text-[10px] font-black text-primary-foreground">{t.count}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top items */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <h3 className="text-sm font-black">الأكثر طلباً</h3>
          <div className="space-y-2">
            {topItems.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-lg w-8 text-center">{item.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold">{item.name}</span>
                    <span className="text-muted-foreground font-medium">{item.count}×</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                  </div>
                </div>
                <span className="text-xs font-bold text-primary w-16 text-left">{item.revenue} ج.م</span>
              </div>
            ))}
          </div>
        </div>

        {/* Addon popularity */}
        {topAddons.length > 0 && (
          <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
            <h3 className="text-sm font-black">الإضافات الأكثر طلباً</h3>
            <div className="space-y-2">
              {topAddons.map((addon, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-base w-8 text-center">{addon.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold">{addon.name}</span>
                      <span className="text-muted-foreground font-medium">{addon.count}×</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full bg-green-500/70 rounded-full transition-all" style={{ width: `${(addon.count / maxAddonCount) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-xs font-bold text-green-400 w-16 text-left">{addon.revenue} ج.م</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revenue by category */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <h3 className="text-sm font-black">الإيرادات حسب القسم</h3>
          <div className="space-y-2">
            {catEntries.map(([cat, rev]) => (
              <div key={cat} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: `var(--cat-${cat})` }} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-bold">{catNames[cat] || cat}</span>
                    <span className="text-muted-foreground font-medium">{rev.toFixed(0)} ج.م</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(rev / maxCatRevenue) * 100}%`, backgroundColor: `var(--cat-${cat})` }} />
                  </div>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground w-10 text-left">
                  {totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(0) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Status breakdown */}
        <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
          <h3 className="text-sm font-black">حالة الطلبات</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-2">
                <div className={`w-2.5 h-2.5 rounded-full ${statusLabels[status]?.color || 'bg-muted'}`} />
                <span className="text-xs font-bold">{statusLabels[status]?.label || status}</span>
                <span className="text-xs font-black text-primary">{count}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </ScrollArea>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="border-2 rounded-2xl bg-card p-4 space-y-2">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[10px] text-muted-foreground font-bold">{label}</p>
    </div>
  )
}
