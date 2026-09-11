import { useEffect } from 'react'
import { useReportStore } from '@/services/report/report.store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TrendingUp, ShoppingBag, DollarSign, BarChart3, Package } from 'lucide-react'

export function Reports() {
  const { dashboard, topItems, categoryRevenue, orderTypeSplit, revenueTrend, loading, refreshAll, refreshRevenueTrend } = useReportStore()

  useEffect(() => {
    refreshAll()
    refreshRevenueTrend(7)
  }, [])

  if (!dashboard && !loading) {
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
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<ShoppingBag className="h-5 w-5" />} label="إجمالي الطلبات" value={`${dashboard?.totalOrders || 0}`} color="bg-primary/10 text-primary" />
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="إجمالي الإيرادات" value={`${(dashboard?.totalRevenue || 0).toFixed(0)} ج.م`} color="bg-green-500/10 text-green-400" />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label="متوسط الطلب" value={`${(dashboard?.avgOrderValue || 0).toFixed(0)} ج.م`} color="bg-blue-500/10 text-blue-400" />
          <StatCard icon={<Package className="h-5 w-5" />} label="الملغيات" value={`${dashboard?.cancelledOrders || 0}`} color="bg-red-500/10 text-red-400" />
        </div>

        {/* Revenue trend */}
        {revenueTrend.length > 0 && (
          <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
            <h3 className="text-sm font-black">إيرادات آخر 7 أيام</h3>
            <div className="flex items-end gap-1.5 h-24">
              {revenueTrend.map((day) => {
                const maxRev = Math.max(...revenueTrend.map(d => d.revenue), 1)
                const height = day.revenue > 0 ? (day.revenue / maxRev) * 100 : 0
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    {day.revenue > 0 && <span className="text-[8px] font-bold text-primary">{day.revenue}</span>}
                    <div className="w-full flex items-end" style={{ height: '60px' }}>
                      <div className="w-full rounded-t-md bg-primary/80 transition-all" style={{ height: `${height}%`, minHeight: day.revenue > 0 ? '4px' : '0' }} />
                    </div>
                    <span className="text-[7px] text-muted-foreground font-medium">{day.date.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Order type split */}
        {orderTypeSplit && (
          <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
            <h3 className="text-sm font-black">نوع الطلب</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/60 rounded-xl p-3 text-center space-y-1">
                <p className="text-2xl font-black text-primary">{orderTypeSplit.delivery.count}</p>
                <p className="text-[10px] text-muted-foreground font-bold">توصيل</p>
                <p className="text-xs font-bold text-primary">{orderTypeSplit.delivery.revenue.toFixed(0)} ج.م</p>
              </div>
              <div className="bg-secondary/60 rounded-xl p-3 text-center space-y-1">
                <p className="text-2xl font-black text-blue-400">{orderTypeSplit.dineIn.count}</p>
                <p className="text-[10px] text-muted-foreground font-bold">صالة</p>
                <p className="text-xs font-bold text-blue-400">{orderTypeSplit.dineIn.revenue.toFixed(0)} ج.م</p>
              </div>
            </div>
          </div>
        )}

        {/* Top items */}
        {topItems.length > 0 && (
          <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
            <h3 className="text-sm font-black">الأكثر طلباً</h3>
            <div className="space-y-2">
              {topItems.map((item, i) => {
                const maxCount = topItems[0]?.totalQuantity || 1
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-lg w-8 text-center">{item.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold">{item.name}</span>
                        <span className="text-muted-foreground font-medium">{item.totalQuantity}×</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(item.totalQuantity / maxCount) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-primary w-16 text-left">{item.totalRevenue} ج.م</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Category revenue */}
        {categoryRevenue.length > 0 && (
          <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
            <h3 className="text-sm font-black">الإيرادات حسب القسم</h3>
            <div className="space-y-2">
              {categoryRevenue.map((cat) => {
                const maxRev = categoryRevenue[0]?.totalRevenue || 1
                return (
                  <div key={cat.categoryId} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold">{cat.name}</span>
                        <span className="text-muted-foreground font-medium">{cat.totalRevenue.toFixed(0)} ج.م</span>
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div className="h-full bg-primary/70 rounded-full transition-all" style={{ width: `${(cat.totalRevenue / maxRev) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="border-2 rounded-2xl bg-card p-4 space-y-2">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[10px] text-muted-foreground font-bold">{label}</p>
    </div>
  )
}
