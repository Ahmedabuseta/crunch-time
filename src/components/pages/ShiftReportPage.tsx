import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { AXI_TICK, CURSOR_FILL, GRID_STROKE } from '@/components/Reports'
import { useShiftStore } from '@/services/shift/shift.store'
import type { ShiftReport } from '@/services/shift/shift.types'
import { Emoji } from '@/components/Emoji'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronRight, Clock, User, Wallet, Receipt, CreditCard, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'

const PAY_LABELS: Record<string, string> = { cash: 'نقدي', card: 'بطاقة', visa: 'فيزا', 'digital-wallet': 'محفظة إلكترونية', other: 'أخرى' }
const MOV_LABELS: Record<string, string> = { SALE: 'مبيعات', REFUND: 'مرتجعات', CASH_IN: 'إيداع', CASH_OUT: 'سحب' }
const PIE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ef4444', '#38bdf8']
const hourLabel = (h: number) => (h === 0 ? '12ص' : h < 12 ? `${h}ص` : h === 12 ? '12م' : `${h - 12}م`)

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'blue' | 'red' }) {
  return (
    <div className={cn(
      "rounded-2xl border p-4",
      tone === 'green' ? "border-green-500/20 bg-green-500/5"
        : tone === 'blue' ? "border-blue-500/20 bg-blue-500/5"
          : tone === 'red' ? "border-red-500/20 bg-red-500/5"
            : "border-border bg-card"
    )}>
      <p className="text-[10px] font-bold text-muted-foreground mb-1">{label}</p>
      <p className={cn(
        "text-xl font-black",
        tone === 'green' && "text-green-500",
        tone === 'blue' && "text-blue-400",
        tone === 'red' && "text-red-500"
      )}>{value}</p>
    </div>
  )
}

export function ShiftReportPage({ shiftId, onBack }: { shiftId: string | null; onBack: () => void }) {
  const getReport = useShiftStore((s) => s.getReport)
  const [report, setReport] = useState<ShiftReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setMissing(false)
    setReport(null)
    if (!shiftId) {
      setLoading(false)
      setMissing(true)
      return
    }
    getReport(shiftId)
      .then((r) => { if (alive) { setReport(r); setMissing(!r) } })
      .catch(() => { if (alive) setMissing(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [shiftId, getReport])

  const duration = report?.endedAt
    ? Math.round((new Date(report.endedAt).getTime() - new Date(report.startedAt).getTime()) / 3600000 * 10) / 10
    : null

  const payPie = report
    ? report.payments.map(p => ({ name: PAY_LABELS[p.method] || p.method, value: p.total, count: p.count }))
    : []
  const payTotal = payPie.reduce((s, x) => s + x.value, 0) || 1
  const hourly = report
    ? report.hourly.map(h => ({ ...h, name: hourLabel(h.hour) }))
    : []
  const maxQty = report?.topItems[0]?.qty || 1

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b shrink-0">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer shrink-0"
        >
          <ChevronRight className="h-4 w-4" />
          الورديات
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-black">تقرير الوردية</h2>
          {report && (
            <p className="text-[11px] text-muted-foreground truncate">
              {new Date(report.startedAt).toLocaleString('ar-EG')}
              {report.endedAt && ` — ${new Date(report.endedAt).toLocaleString('ar-EG')}`}
            </p>
          )}
        </div>
        {report && (
          <span className={cn(
            "text-[10px] font-bold rounded-full px-2.5 py-0.5 shrink-0",
            report.endedAt ? "bg-secondary text-muted-foreground" : "bg-green-500/10 text-green-500"
          )}>
            {report.endedAt ? 'مغلقة' : 'مفتوحة'}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-5">
          {loading && (
            <p className="text-center text-xs text-muted-foreground py-16">جارٍ تحميل التقرير...</p>
          )}

          {missing && !loading && (
            <div className="text-center py-16 space-y-2">
              <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-bold">لم يتم العثور على الوردية</p>
              <p className="text-[11px] text-muted-foreground">قد تكون حُذفت أو لا تملك صلاحية عرضها</p>
            </div>
          )}

          {report && !loading && (
            <>
              {/* Cashier + duration */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-card border border-border rounded-full px-3 py-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {report.userName}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-card border border-border rounded-full px-3 py-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {new Date(report.startedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  {report.endedAt
                    ? ` — ${new Date(report.endedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`
                    : ' — الآن'}
                </span>
                {duration != null && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-card border border-border rounded-full px-3 py-1.5">
                    المدة: {duration} ساعة
                  </span>
                )}
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="الطلبات" value={String(report.orderCount)} />
                <StatCard label="الإيرادات" value={`${fmtMoney(report.totalRevenue)} ج.م`} />
                <StatCard label="المتوقع في الدرج" value={`${fmtMoney(report.expectedCash)} ج.م`} />
                <StatCard
                  label="فرق الكاش"
                  value={report.cashDifference == null ? '—' : `${report.cashDifference > 0 ? '+' : ''}${fmtMoney(report.cashDifference)} ج.م`}
                  tone={report.cashDifference == null ? undefined : report.cashDifference === 0 ? 'green' : report.cashDifference > 0 ? 'blue' : 'red'}
                />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Revenue by hour */}
                <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
                  <p className="text-xs font-black flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-primary" />
                    الإيرادات بالساعة
                  </p>
                  {hourly.length > 0 ? (
                    <div className="h-56">
                      <ChartContainer className="h-full">
                        <BarChart data={hourly} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke={GRID_STROKE} vertical={false} strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={AXI_TICK} axisLine={false} tickLine={false} interval={0} />
                          <YAxis tick={AXI_TICK} axisLine={false} tickLine={false} width={34} />
                          <Tooltip cursor={{ fill: CURSOR_FILL }} content={<ChartTooltip kind="currency" nameFormatter={() => 'الإيراد'} />} />
                          <Bar dataKey="revenue" radius={[4, 4, 0, 0]} fill="#3b82f6" />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground text-center py-8">لا توجد طلبات في هذه الوردية</p>
                  )}
                </div>

                {/* Payment methods donut */}
                <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
                  <p className="text-xs font-black flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-primary" />
                    طرق الدفع
                  </p>
                  {payPie.length > 0 ? (
                    <>
                      <div className="h-44">
                        <ChartContainer className="h-full">
                          <PieChart>
                            <Pie data={payPie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3}>
                              {payPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip content={<ChartTooltip kind="currency" />} />
                          </PieChart>
                        </ChartContainer>
                      </div>
                      <div className="space-y-1.5">
                        {payPie.map((e, i) => (
                          <div key={e.name} className="flex items-center gap-2 text-[11px]">
                            <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="font-bold flex-1">{e.name}</span>
                            <span className="text-muted-foreground font-bold">{e.count} ×</span>
                            <span className="font-bold">{fmtMoney(e.value)} ج.م</span>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 text-[11px] pt-1 border-t border-border/60">
                          <span className="font-black flex-1">الإجمالي</span>
                          <span className="font-black">{fmtMoney(payTotal)} ج.م</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground text-center py-8">لا توجد بيانات دفع</p>
                  )}
                </div>
              </div>

              {/* Top items */}
              <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
                <p className="text-xs font-black flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-primary" />
                  الأكثر مبيعاً في الوردية
                </p>
                {report.topItems.length > 0 ? (
                  <div className="space-y-3">
                    {report.topItems.map((t, i) => (
                      <div key={t.name} className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-[10px] font-black text-muted-foreground w-4 shrink-0">{i + 1}</span>
                          <span className="font-bold"><Emoji>{t.emoji}</Emoji> {t.name}</span>
                          <span className="text-muted-foreground font-bold mr-auto">×{t.qty}</span>
                          <span className="font-black">{fmtMoney(t.revenue)} ج.م</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden mr-6">
                          <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${(t.qty / maxQty) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center py-6">لا توجد بيانات</p>
                )}
              </div>

              {/* Cash flow */}
              <div className="border-2 rounded-2xl bg-card p-4 space-y-3">
                <p className="text-xs font-black flex items-center gap-1.5">
                  <Wallet className="h-4 w-4 text-primary" />
                  حركات الكاش
                </p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-bold">رصيد الافتتاح</span>
                    <span className="font-black">{fmtMoney(report.openingCash)} ج.م</span>
                  </div>
                  {report.movements.map(m => (
                    <div key={m.type} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground font-bold">{MOV_LABELS[m.type] || m.type}</span>
                      <span className={cn("font-black", m.amount >= 0 ? "text-green-400" : "text-red-400")}>
                        {m.amount >= 0 ? '+' : ''}{fmtMoney(m.amount)} ج.م
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/60">
                    <span className="font-bold">المتوقع في الدرج</span>
                    <span className="font-black">{fmtMoney(report.expectedCash)} ج.م</span>
                  </div>
                  {report.closingCash != null && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold">الفعلي (عد الكاش)</span>
                      <span className="font-black">{fmtMoney(report.closingCash)} ج.م</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
