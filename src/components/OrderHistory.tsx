import { useState } from 'react'
import { useOrdersStore, type OrderStatus } from '@/store/orders'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Trash2, Truck, UtensilsCrossed, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const statusConfig: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'جديد', color: 'bg-yellow-500/15 text-yellow-400' },
  preparing: { label: 'يحضّر', color: 'bg-blue-500/15 text-blue-400' },
  ready: { label: 'جاهز', color: 'bg-green-500/15 text-green-400' },
  completed: { label: 'مكتمل', color: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'ملغي', color: 'bg-red-500/15 text-red-400' },
}

const allStatuses: OrderStatus[] = ['pending', 'preparing', 'ready', 'completed', 'cancelled']

export function OrderHistory() {
  const orders = useOrdersStore((s) => s.orders)
  const updateStatus = useOrdersStore((s) => s.updateStatus)
  const deleteOrder = useOrdersStore((s) => s.deleteOrder)
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter)

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
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex gap-1.5 overflow-x-auto px-5 py-3 border-b">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer",
            filter === 'all' ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
          )}
        >
          الكل ({orders.length})
        </button>
        {allStatuses.map((s) => {
          const count = orders.filter((o) => o.status === s).length
          if (count === 0) return null
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer",
                filter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {statusConfig[s].label} ({count})
            </button>
          )
        })}
      </div>

      {/* Orders list */}
      <ScrollArea className="flex-1 p-5">
        <div className="space-y-3">
          {filtered.map((order) => {
            const isExpanded = expandedOrder === order.id
            return (
              <div key={order.id} className="border-2 rounded-2xl bg-card overflow-hidden animate-fade-in">
                {/* Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black bg-secondary rounded-lg px-2.5 py-1">{order.id}</span>
                    <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", statusConfig[order.status].color)}>
                      {statusConfig[order.status].label}
                    </span>
                    <span className="text-[10px] text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                      {order.orderType === 'delivery' ? <Truck className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
                      {order.orderType === 'delivery' ? 'توصيل' : `صالة ${order.tableNumber || ''}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {order.createdAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 animate-slide-up border-t border-border/40 pt-3">
                    {/* Delivery info */}
                    {order.orderType === 'delivery' && (order.deliveryAddress || order.deliveryPhone) && (
                      <div className="bg-secondary/40 rounded-xl p-3 text-xs space-y-1">
                        {order.deliveryAddress && (
                          <p className="text-muted-foreground">📍 <span className="text-foreground font-medium">{order.deliveryAddress}</span></p>
                        )}
                        {order.deliveryPhone && (
                          <p className="text-muted-foreground">📞 <span className="text-foreground font-medium">{order.deliveryPhone}</span></p>
                        )}
                      </div>
                    )}

                    {/* Items with addons */}
                    <div className="space-y-2">
                      {order.items.map((item) => (
                        <div key={item.product.id} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">{item.product.emoji} {item.product.name} ×{item.quantity}</span>
                            <span className="font-bold">{(item.product.price * item.quantity)} ج.م</span>
                          </div>
                          {item.addons.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mr-6">
                              {item.addons.map((addon) => (
                                <span key={addon.id} className="text-[10px] bg-secondary/70 rounded-full px-2 py-0.5 text-muted-foreground font-medium">
                                  {addon.emoji} {addon.name} <span className="text-primary">+{addon.price * item.quantity}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Total */}
                    <div className="h-px bg-border" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground font-medium">الإجمالي</span>
                      <div className="flex items-baseline gap-1">
                        <span className="font-black text-lg text-primary">{order.total.toFixed(0)}</span>
                        <span className="text-[10px] text-muted-foreground">ج.م</span>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 pt-1">
                      {/* Status cycle */}
                      <div className="flex-1 flex gap-1.5">
                        {(['pending', 'preparing', 'ready', 'completed'] as OrderStatus[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => updateStatus(order.id, s)}
                            className={cn(
                              "flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer",
                              order.status === s
                                ? statusConfig[s].color + " ring-1 ring-current/20"
                                : "bg-secondary/60 text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {statusConfig[s].label}
                          </button>
                        ))}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-xl shrink-0"
                        onClick={() => deleteOrder(order.id)}
                      >
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
    </div>
  )
}
