import { useState, useEffect } from 'react'
import { useOrderStore } from '@/services/order/order.store'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Truck, UtensilsCrossed, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  PAID: { label: 'مدفوع', color: 'text-green-400', bg: 'bg-green-500/10' },
  PREPARING: { label: 'يحضّر', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  READY: { label: 'جاهز', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  COMPLETED: { label: 'مكتمل', color: 'text-muted-foreground', bg: 'bg-secondary' },
  CANCELLED: { label: 'ملغي', color: 'text-red-400', bg: 'bg-red-500/10' },
  REFUNDED: { label: 'مسترد', color: 'text-purple-400', bg: 'bg-purple-500/10' },
}

const paymentLabels: Record<string, string> = {
  cash: 'كاش', card: 'كارت', wallet: 'محفظة',
}

function toEgyptianDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
}

function toEgyptianTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

export function OrderHistory() {
  const orders = useOrderStore((s) => s.orders)
  const fetchOrders = useOrderStore((s) => s.fetch)
  const updateStatus = useOrderStore((s) => s.updateStatus)
  const currentUser = useUserStore((s) => s.currentUser)
  const isAdmin = currentUser?.role === 'admin'
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({})
  const [showReasonFor, setShowReasonFor] = useState<string | null>(null)

  useEffect(() => { fetchOrders() }, [])

  const filtered = orders.filter(o => {
    if (search && !o.id.toLowerCase().includes(search.toLowerCase()) && !(o as any).customerName?.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter && o.status !== statusFilter) return false
    return true
  })

  const handleStatusChange = (orderId: string, status: string) => {
    if (status === 'CANCELLED' || status === 'REFUNDED') {
      setShowReasonFor(orderId)
    } else {
      updateStatus(orderId, status as any)
    }
  }

  const confirmStatusWithReason = (orderId: string, status: string) => {
    updateStatus(orderId, status as any, reasonMap[orderId] || undefined)
    setShowReasonFor(null)
    setReasonMap(r => { const n = { ...r }; delete n[orderId]; return n })
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center"><span className="text-2xl opacity-40">📋</span></div>
        <div className="text-center">
          <p className="text-sm font-bold">لا توجد طلبات بعد</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">أكمل طلب لرؤية الطلبات هنا</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search + Filter */}
      <div className="px-5 pt-4 pb-3 space-y-3 border-b">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث برقم الطلب أو اسم العميل..."
            className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
          {search && <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          <button onClick={() => setStatusFilter(null)} className={cn("shrink-0 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all", !statusFilter ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>الكل ({orders.length})</button>
          {Object.entries(statusConfig).map(([key, config]) => {
            const count = orders.filter(o => o.status === key).length
            if (count === 0) return null
            return <button key={key} onClick={() => setStatusFilter(key)} className={cn("shrink-0 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all", statusFilter === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>{config.label} ({count})</button>
          })}
        </div>
      </div>

      {/* Orders */}
      <ScrollArea className="flex-1 p-5">
        <div className="space-y-3">
          {filtered.map((order) => {
            const isExpanded = expandedOrder === order.id
            const showReason = showReasonFor === order.id
            const o = order as any
            return (
              <div key={order.id} className="border-2 rounded-2xl bg-card overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black bg-secondary rounded-lg px-2.5 py-1">{order.id}</span>
                    <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", statusConfig[order.status]?.bg, statusConfig[order.status]?.color)}>{statusConfig[order.status]?.label || order.status}</span>
                    <span className="text-[10px] text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                      {order.orderType === 'delivery' ? <Truck className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
                      {order.orderType === 'delivery' ? 'توصيل' : `صالة ${order.tableNumber || ''}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground font-medium">{toEgyptianTime(order.createdAt)}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 animate-slide-up border-t border-border/40 pt-3">
                    {/* Order info grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-secondary/60 rounded-xl p-2.5">
                        <p className="text-muted-foreground mb-0.5">التاريخ</p>
                        <p className="font-bold">{toEgyptianDate(order.createdAt)}</p>
                      </div>
                      <div className="bg-secondary/60 rounded-xl p-2.5">
                        <p className="text-muted-foreground mb-0.5">الوقت</p>
                        <p className="font-bold">{toEgyptianTime(order.createdAt)}</p>
                      </div>
                      <div className="bg-secondary/60 rounded-xl p-2.5">
                        <p className="text-muted-foreground mb-0.5">نوع الطلب</p>
                        <p className="font-bold">{order.orderType === 'delivery' ? 'توصيل' : 'صالة'}</p>
                      </div>
                      <div className="bg-secondary/60 rounded-xl p-2.5">
                        <p className="text-muted-foreground mb-0.5">طريقة الدفع</p>
                        <p className="font-bold">{paymentLabels[o.paymentType] || o.paymentType || 'كاش'}</p>
                      </div>
                      {o.cashierName && (
                        <div className="bg-secondary/60 rounded-xl p-2.5">
                          <p className="text-muted-foreground mb-0.5">الكاشير</p>
                          <p className="font-bold">{o.cashierName}</p>
                        </div>
                      )}
                      {order.orderType === 'delivery' && (
                        <>
                          {o.customerName && <div className="bg-secondary/60 rounded-xl p-2.5"><p className="text-muted-foreground mb-0.5">العميل</p><p className="font-bold">{o.customerName}</p></div>}
                          {o.customerPhone && <div className="bg-secondary/60 rounded-xl p-2.5"><p className="text-muted-foreground mb-0.5">التليفون</p><p className="font-bold">{o.customerPhone}</p></div>}
                          {o.customerAddress && <div className="bg-secondary/60 rounded-xl p-2.5 col-span-2"><p className="text-muted-foreground mb-0.5">العنوان</p><p className="font-bold">{o.customerAddress}</p></div>}
                        </>
                      )}
                    </div>

                    {/* Items */}
                    <div className="space-y-1.5">
                      {(o.items || []).map((item: any) => (
                        <div key={item.id} className="space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">{item.productEmoji || '🍽️'} {item.productName || 'منتج'} ×{item.quantity}</span>
                            <span className="font-bold">{(item.unitPrice * item.quantity).toFixed(0)} ج.م</span>
                          </div>
                          {item.itemDiscount > 0 && (
                            <div className="flex justify-between text-[10px] text-green-400 mr-5">
                              <span>خصم</span><span>-{item.itemDiscount} ج.م</span>
                            </div>
                          )}
                          {item.selectedAddonsJson && (() => {
                            try { const addons = JSON.parse(item.selectedAddonsJson); return addons.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mr-5">{addons.map((aId: string, i: number) => <span key={i} className="text-[9px] bg-secondary/60 rounded-full px-1.5 py-0.5 text-muted-foreground">{aId}</span>)}</div>
                            ) : null } catch { return null }
                          })()}
                        </div>
                      ))}
                    </div>

                    {/* Totals */}
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-muted-foreground"><span>المجموع الفرعي</span><span className="font-medium">{order.subtotal.toFixed(0)} ج.م</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>ضريبة</span><span className="font-medium">{order.tax.toFixed(0)} ج.م</span></div>
                      {order.deliveryFee > 0 && <div className="flex justify-between text-muted-foreground"><span>رسوم التوصيل</span><span className="font-medium">{order.deliveryFee} ج.م</span></div>}
                      {o.discountAmount > 0 && <div className="flex justify-between text-green-400"><span>خصم {o.discountCode ? `(${o.discountCode})` : ''}</span><span className="font-medium">-{o.discountAmount} ج.م</span></div>}
                      <div className="h-px bg-border" />
                      <div className="flex justify-between items-baseline">
                        <span className="font-black text-sm">الإجمالي</span>
                        <div className="flex items-baseline gap-1"><span className="font-black text-lg text-primary">{order.total.toFixed(0)}</span><span className="text-[10px] text-muted-foreground">ج.م</span></div>
                      </div>
                    </div>

                    {/* Status reason */}
                    {o.statusReason && (
                      <div className="bg-secondary/60 rounded-xl p-2.5 text-xs">
                        <p className="text-muted-foreground mb-0.5">سبب الحالة</p>
                        <p className="font-medium">{o.statusReason}</p>
                      </div>
                    )}

                    {/* Reason input for cancel/refund */}
                    {showReason && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-2 animate-slide-up">
                        <p className="text-xs font-bold text-red-400">سبب الإلغاء/الاسترداد (مطلوب)</p>
                        <input value={reasonMap[order.id] || ''} onChange={e => setReasonMap(r => ({ ...r, [order.id]: e.target.value }))} placeholder="مثال: العميل طلب الإلغاء"
                          className="w-full px-3 py-2 rounded-lg bg-secondary text-xs border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" className="rounded-lg text-xs flex-1" onClick={() => confirmStatusWithReason(order.id, 'CANCELLED')}>إلغاء الطلب</Button>
                          <Button size="sm" variant="outline" className="rounded-lg text-xs flex-1" onClick={() => confirmStatusWithReason(order.id, 'REFUNDED')}>استرداد</Button>
                          <Button size="sm" variant="ghost" className="rounded-lg text-xs" onClick={() => setShowReasonFor(null)}>إلغاء</Button>
                        </div>
                      </div>
                    )}

                    {/* Status controls */}
                    {!showReason && (
                      <div className="flex items-center gap-2 pt-1">
                        <div className="flex-1 flex gap-1.5">
                          {(['PAID', 'PREPARING', 'READY', 'COMPLETED'] as const).map(s => (
                            <button key={s} onClick={() => handleStatusChange(order.id, s)} className={cn("flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer", order.status === s ? `${statusConfig[s].bg} ${statusConfig[s].color} ring-1 ring-current/20` : "bg-secondary/60 text-muted-foreground hover:text-foreground")}>
                              {statusConfig[s].label}
                            </button>
                          ))}
                          {isAdmin && order.status !== 'CANCELLED' && order.status !== 'REFUNDED' && (
                            <button onClick={() => setShowReasonFor(order.id)} className="px-3 py-1.5 rounded-xl text-[10px] font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer">إلغاء</button>
                          )}
                        </div>
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
