import { useState } from 'react'
import { useOrderStore } from '@/services/order/order.store'
import type { OrderStatus } from '@/services/order/order.types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Trash2, Truck, UtensilsCrossed, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; color: string }> = {
  PAID: { label: 'مدفوع', color: 'bg-green-500/15 text-green-400' },
  PREPARING: { label: 'يحضّر', color: 'bg-blue-500/15 text-blue-400' },
  READY: { label: 'جاهز', color: 'bg-yellow-500/15 text-yellow-400' },
  COMPLETED: { label: 'مكتمل', color: 'bg-muted text-muted-foreground' },
  CANCELLED: { label: 'ملغي', color: 'bg-red-500/15 text-red-400' },
  DRAFT: { label: 'مسودة', color: 'bg-secondary text-muted-foreground' },
  PENDING_PAYMENT: { label: 'بانتظار الدفع', color: 'bg-yellow-500/15 text-yellow-400' },
  REFUNDED: { label: 'مسترد', color: 'bg-purple-500/15 text-purple-400' },
}

export function OrderHistory() {
  const orders = useOrderStore((s) => s.orders)
  const updateStatus = useOrderStore((s) => s.updateStatus)
  const removeOrder = useOrderStore((s) => s.remove)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center">
          <span className="text-2xl opacity-40">📋</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-bold">لا توجد طلبات بعد</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">أكمل طلب لرؤية الطلبات هنا</p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full p-5">
      <div className="space-y-3">
        {orders.map((order) => {
          const isExpanded = expandedOrder === order.id
          return (
            <div key={order.id} className="border-2 rounded-2xl bg-card overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-black bg-secondary rounded-lg px-2.5 py-1">{order.id}</span>
                  <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", statusConfig[order.status]?.color || '')}>
                    {statusConfig[order.status]?.label || order.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                    {order.orderType === 'delivery' ? <Truck className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
                    {order.orderType === 'delivery' ? 'توصيل' : `صالة ${order.tableNumber || ''}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {new Date(order.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 animate-slide-up border-t border-border/40 pt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground font-medium">الإجمالي</span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-black text-lg text-primary">{order.total.toFixed(0)}</span>
                      <span className="text-[10px] text-muted-foreground">ج.م</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex-1 flex gap-1.5">
                      {(['PAID', 'PREPARING', 'READY', 'COMPLETED'] as OrderStatus[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(order.id, s)}
                          className={cn(
                            "flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer",
                            order.status === s
                              ? (statusConfig[s]?.color || '') + " ring-1 ring-current/20"
                              : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {statusConfig[s]?.label || s}
                        </button>
                      ))}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-xl shrink-0" onClick={() => removeOrder(order.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
