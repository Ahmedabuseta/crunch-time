import { useState, useEffect } from 'react'
import { useOrderStore } from '@/services/order/order.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Truck, UtensilsCrossed, ChevronDown, X, Printer, ChefHat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { printOrderPack, buildKitchenTicketHtml } from '@/lib/print'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { ViewToggle } from '@/components/ui/view-toggle'
import type { ViewMode } from '@/components/ui/view-toggle'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  COMPLETED: { label: 'مكتمل', color: 'text-green-400', bg: 'bg-green-500/10' },
  CANCELLED: { label: 'ملغي', color: 'text-red-400', bg: 'bg-red-500/10' },
  REFUNDED: { label: 'مسترد', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
}

const paymentLabels: Record<string, string> = {
  cash: 'كاش', card: 'كارت', wallet: 'محفظة', visa: 'فيزا',
}

const VOID_REASONS = [
  'العميل طلب الإلغاء',
  'خطأ في إدخال الطلب',
  'تأخير التوصيل',
  'مشكلة في جودة الطعام',
  'العميل لم يستلم',
  'دفع مكرر',
]

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
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({})
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [showReasonFor, setShowReasonFor] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('table')
  const [printMsg, setPrintMsg] = useState<Record<string, string>>({})
  const [printingId, setPrintingId] = useState<string | null>(null)

  useEffect(() => { fetchOrders() }, [])

  const toPrintOrder = (o: any) => ({
    id: o.id, orderType: o.orderType,
    tableNumber: o.tableNumber, customerName: o.customerName,
    customerPhone: o.customerPhone, customerAddress: o.customerAddress,
    deliveryZoneName: o.deliveryZoneName, deliveryNote: o.deliveryNote,
    note: o.note, cashierName: o.cashierName, createdAt: o.createdAt,
    items: (o.items || []).map((i: any) => ({
      productName: i.productName, productEmoji: i.productEmoji,
      quantity: i.quantity, unitPrice: i.unitPrice, note: i.note,
      selectedModifiersJson: i.selectedModifiersJson,
      selectedAddonsJson: i.selectedAddonsJson,
      addonRollbackInfo: i.addonRollbackInfo,
    })),
    subtotal: o.subtotal, tax: o.tax, deliveryFee: o.deliveryFee,
    discountAmount: o.discountAmount, discountCode: o.discountCode,
    total: o.total, paymentType: o.paymentType,
  })

  const handleReprint = async (o: any, kind: 'receipt' | 'kitchen') => {
    setPrintingId(o.id)
    setPrintMsg((m) => ({ ...m, [o.id]: 'جارٍ الطباعة…' }))
    try {
      if (kind === 'receipt') {
        const s: any = await window.api.settings.get()
        const res = await printOrderPack({
          order: toPrintOrder(o),
          receiptPrinter: s?.receiptPrinter,
          receiptWidth: s?.receiptWidth || '80mm',
          autoReceipt: true, autoKitchen: false,
        })
        setPrintMsg((m) => ({ ...m, [o.id]: res.receipt?.ok ? '✅ اتطبع' : `❌ ${res.receipt?.error || 'فشلت الطباعة'}` }))
      } else {
        const s: any = await window.api.settings.get()
        const routed = await window.api.station.routeOrder(o.id)
        const order = toPrintOrder(o)
        const results: string[] = []
        for (const r of routed.routes) {
          if (!r.station.printerName) { results.push(`${r.station.name}: مفيش طابعة`); continue }
          const res = await window.api.printer.printHtml(
            buildKitchenTicketHtml(order as any, r.items, r.station.name, r.station.paperWidth || '80mm'),
            { deviceName: r.station.printerName, copies: s?.kitchenCopies || 1, paperWidth: r.station.paperWidth || '80mm' },
          )
          results.push(`${r.station.name}: ${res.ok ? '✅' : `❌ ${res.error}`}`)
        }
        if (routed.routes.length === 0) results.push('مفيش أصناف مربوطة بمحطات')
        if ((routed.unrouted?.length || 0) > 0) results.push(`⚠️ ${routed.unrouted.length} صنف مش مربوط`)
        setPrintMsg((m) => ({ ...m, [o.id]: results.join('، ') }))
      }
    } catch (err: any) {
      setPrintMsg((m) => ({ ...m, [o.id]: `❌ ${err?.message || 'فشلت الطباعة'}` }))
    } finally {
      setPrintingId(null)
    }
  }

  const list = useListControls({
    items: orders,
    searchText: (o) => `${o.id} ${(o as any).customerName || ''} ${(o as any).note || ''} ${(o as any).deliveryZoneName || ''} ${(o as any).deliveryNote || ''}`,
    filter: (o) => !statusFilter || o.status === statusFilter,
  })

  const columns: DataColumn<any>[] = [
    {
      key: 'id', label: 'الطلب', render: (o) => (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-black bg-secondary rounded-lg px-2 py-1">{o.id}</span>
          <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", statusConfig[o.status]?.bg, statusConfig[o.status]?.color)}>{statusConfig[o.status]?.label || o.status}</span>
        </div>
      ),
    },
    {
      key: 'type', label: 'النوع', render: (o) => (
        <span className="text-[10px] text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5 font-medium flex items-center gap-1 w-fit">
          {o.orderType === 'delivery' ? <Truck className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
          {o.orderType === 'delivery' ? `توصيل${o.deliveryZoneName ? ` · ${o.deliveryZoneName}` : ''}` : `صالة ${o.tableNumber || ''}`}
        </span>
      ),
    },
    { key: 'payment', label: 'الدفع', render: (o) => <span className="text-xs font-bold">{paymentLabels[o.paymentType] || o.paymentType || 'كاش'}</span> },
    { key: 'cashier', label: 'الكاشير', render: (o) => <span className="text-xs text-muted-foreground">{o.cashierName || '—'}</span> },
    { key: 'total', label: 'الإجمالي', className: 'text-left', render: (o) => <span className="font-black text-primary">{o.total.toFixed(0)} ج.م</span> },
    { key: 'time', label: 'الوقت', render: (o) => <span className="text-[11px] text-muted-foreground">{toEgyptianTime(o.createdAt)}</span> },
  ]

  const confirmStatusWithReason = async (orderId: string, status: string) => {
    const reason = (reasonMap[orderId] || '').trim()
    if (!reason) {
      setReasonError('اختر سبباً أو اكتب سبباً مخصصاً')
      return
    }
    setReasonError(null)
    try {
      await updateStatus(orderId, status as any, reason)
      setShowReasonFor(null)
      setReasonMap(r => { const n = { ...r }; delete n[orderId]; return n })
    } catch (err: any) {
      setReasonError(err?.message || 'فشل تحديث حالة الطلب')
    }
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
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={list.search} onChange={e => { list.setSearch(e.target.value); list.setPage(1) }} placeholder="بحث برقم الطلب أو اسم العميل..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
            {list.search && <button onClick={() => { list.setSearch(''); list.setPage(1) }} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"><X className="h-4 w-4" /></button>}
          </div>
          <ViewToggle value={view} onChange={setView} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          <button onClick={() => { setStatusFilter(null); list.setPage(1) }} className={cn("shrink-0 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all", !statusFilter ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>الكل ({orders.length})</button>
          {Object.entries(statusConfig).map(([key, config]) => {
            const count = orders.filter(o => o.status === key).length
            if (count === 0) return null
            return <button key={key} onClick={() => { setStatusFilter(key); list.setPage(1) }} className={cn("shrink-0 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all", statusFilter === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>{config.label} ({count})</button>
          })}
        </div>
      </div>

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable columns={columns} data={list.items} keyExtractor={(order) => order.id} onRowClick={(o) => setExpandedOrder(expandedOrder === o.id ? null : o.id)} />
        </div>
      ) : (
      /* Orders */
      <ScrollArea className="flex-1 p-5">
        <div className="space-y-3">
          {list.items.map((order) => {
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
                    {(o.note || (o.items || []).some((i: any) => i.note)) && (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-400" title="يوجد ملاحظات">📝</span>
                    )}
                    <span className="text-[10px] text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                      {order.orderType === 'delivery' ? <Truck className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
                      {order.orderType === 'delivery' ? `توصيل${o.deliveryZoneName ? ` · ${o.deliveryZoneName}` : ''}` : `صالة ${order.tableNumber || ''}`}
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
                          {o.deliveryZoneName && <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2.5"><p className="text-muted-foreground mb-0.5">🛵 منطقة التوصيل</p><p className="font-bold text-blue-400">{o.deliveryZoneName}</p></div>}
                          {o.deliveryNote && <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2.5 col-span-2"><p className="text-muted-foreground mb-0.5">📝 ملاحظة الدليفري</p><p className="font-medium break-words">{o.deliveryNote}</p></div>}
                        </>
                      )}
                    </div>

                    {/* Items */}
                    <div className="space-y-1.5">
                      {(o.items || []).map((item: any) => {
                        let mods: string[] = []
                        try {
                          const parsed = JSON.parse(item.selectedModifiersJson || '[]')
                          if (Array.isArray(parsed)) mods = parsed.map((m: any) => m.modifierName || m.name).filter(Boolean)
                        } catch { /* no modifiers */ }
                        const addonGroups: { emoji: string; name: string; price: number; qty: number }[] = []
                        for (const a of ((item.addonRollbackInfo || []) as any[])) {
                          const g = addonGroups.find(g => g.name === a.name && g.emoji === a.emoji && (g.price || 0) === (a.price || 0))
                          if (g) g.qty += 1
                          else addonGroups.push({ emoji: a.emoji, name: a.name, price: a.price || 0, qty: 1 })
                        }
                        const addonTotal = addonGroups.reduce((s, a) => s + a.price * a.qty, 0) * item.quantity
                        const lineTotal = item.unitPrice * item.quantity + addonTotal
                        return (
                        <div key={item.id} className="space-y-0.5">
                          <div className="flex justify-between gap-2 text-xs">
                            <span className="font-medium flex-1 break-words min-w-0">
                              {item.productEmoji || '🍽️'} {item.productName || 'منتج'}
                              {mods.length > 0 && <span className="text-primary"> ({mods.join('، ')})</span>}
                              {' '}×{item.quantity}
                              {item.note && (
                                <span className="block text-[10px] font-medium text-amber-400">📝 {item.note}</span>
                              )}
                            </span>
                            <span className="font-bold shrink-0 whitespace-nowrap">{lineTotal.toFixed(0)} ج.م</span>
                          </div>
                          {item.itemDiscount > 0 && (
                            <div className="flex justify-between text-[10px] text-green-400 mr-5">
                              <span>خصم</span><span>-{fmtMoney(item.itemDiscount)} ج.م</span>
                            </div>
                          )}
                          {addonGroups.length > 0 && (
                            <div className="mr-5 space-y-0.5">
                              {addonGroups.map((a, i) => (
                                <div key={i} className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                                  <span className="flex-1 break-words min-w-0">↳ {a.emoji} {a.name}{a.qty > 1 ? ` ×${a.qty}` : ''}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
                                  <span className="shrink-0 whitespace-nowrap">{fmtMoney(a.price * a.qty * item.quantity)} ج.م</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        )
                      })}
                    </div>

                    {/* Order note */}
                    {o.note && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-2.5 text-xs">
                        <p className="font-black text-amber-400">📝 ملاحظة الطلب</p>
                        <p className="font-medium break-words mt-0.5">{o.note}</p>
                      </div>
                    )}

                    {/* Totals */}
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-muted-foreground"><span>المجموع الفرعي</span><span className="font-medium">{order.subtotal.toFixed(0)} ج.م</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>ضريبة</span><span className="font-medium">{order.tax.toFixed(0)} ج.م</span></div>
                      {order.deliveryFee > 0 && <div className="flex justify-between text-muted-foreground"><span>رسوم التوصيل{o.deliveryZoneName ? ` (${o.deliveryZoneName})` : ''}</span><span className="font-medium">{fmtMoney(order.deliveryFee)} ج.م</span></div>}
                      {o.discountAmount > 0 && <div className="flex justify-between text-green-400"><span>خصم {o.discountCode ? `(${o.discountCode})` : ''}</span><span className="font-medium">-{fmtMoney(o.discountAmount)} ج.م</span></div>}
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

                    {/* Refunded amount */}
                    {o.refundedAmount > 0 && (
                      <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-2.5 text-xs">
                        <p className="text-muted-foreground mb-0.5">المبلغ المسترد</p>
                        <p className="font-bold text-yellow-400">{o.refundedAmount.toFixed(0)} ج.م</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">(المنتجات التي لا تُرجع لم تُسترد)</p>
                      </div>
                    )}

                    {/* Refund info — show which items support rollback */}
                    {showReason && (
                      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 space-y-3 animate-slide-up">
                        <p className="text-xs font-bold text-red-400">سبب الإلغاء/الاسترداد (مطلوب)</p>

                        {/* Rollback preview */}
                        <div className="bg-secondary/60 rounded-xl p-2.5 space-y-1.5">
                          <p className="text-[10px] font-bold text-muted-foreground">المنتجات القابلة للإرجاع:</p>
                          {(o.items || []).map((item: any) => (
                            <div key={item.id} className="space-y-0.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span>{item.productEmoji} {item.productName}</span>
                                {item.supportsRollback ? (
                                  <span className="text-green-400 font-bold">✓ يُرجع</span>
                                ) : (
                                  <span className="text-red-400 font-bold">✗ لا يُرجع</span>
                                )}
                              </div>
                              {/* Addon rollback info */}
                              {(item.addonRollbackInfo || []).map((addon: any, ai: number) => (
                                <div key={ai} className="flex items-center justify-between text-[9px] mr-4 text-muted-foreground">
                                  <span>↳ {addon.emoji} {addon.name}</span>
                                  {addon.supportsRollback ? (
                                    <span className="text-green-400/70 font-bold">✓</span>
                                  ) : (
                                    <span className="text-red-400/70 font-bold">✗</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>

                        <input value={reasonMap[order.id] || ''} onChange={e => { setReasonMap(r => ({ ...r, [order.id]: e.target.value })); setReasonError(null) }} placeholder="أو اكتب سبباً مخصصاً..."
                          className="w-full px-3 py-2 rounded-lg bg-secondary text-xs border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />

                        {/* Popular reason chips */}
                        <div className="flex flex-wrap gap-1.5">
                          {VOID_REASONS.map(reason => {
                            const selected = (reasonMap[order.id] || '') === reason
                            return (
                              <button key={reason} onClick={() => { setReasonMap(r => ({ ...r, [order.id]: reason })); setReasonError(null) }}
                                className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-all border",
                                  selected ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/60 text-muted-foreground border-transparent hover:text-foreground")}>
                                {reason}
                              </button>
                            )
                          })}
                        </div>

                        {reasonError && (
                          <p className="text-[11px] font-bold text-red-400">{reasonError}</p>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" className="rounded-lg text-xs flex-1" onClick={() => confirmStatusWithReason(order.id, 'CANCELLED')}>إلغاء كامل</Button>
                          <Button size="sm" variant="outline" className="rounded-lg text-xs flex-1 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10" onClick={() => confirmStatusWithReason(order.id, 'REFUNDED')}>استرداد جزئي</Button>
                          <Button size="sm" variant="ghost" className="rounded-lg text-xs" onClick={() => { setShowReasonFor(null); setReasonError(null) }}>رجوع</Button>
                        </div>
                      </div>
                    )}

                    {/* Status controls — for COMPLETED orders */}
                    {!showReason && order.status === 'COMPLETED' && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => { setShowReasonFor(order.id); setReasonError(null) }}
                          className="flex-1 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer">
                          إلغاء / استرداد
                        </button>
                      </div>
                    )}

                    {/* Reprint */}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleReprint(o, 'receipt')} disabled={printingId === order.id}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-secondary/60 text-foreground hover:bg-secondary transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                        <Printer className="h-3.5 w-3.5" /> إعادة طباعة الإيصال
                      </button>
                      <button onClick={() => handleReprint(o, 'kitchen')} disabled={printingId === order.id}
                        className="flex-1 py-2 rounded-xl text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                        <ChefHat className="h-3.5 w-3.5" /> تذكرة المطبخ
                      </button>
                    </div>
                    {printMsg[order.id] && (
                      <p className="text-[11px] font-bold text-muted-foreground">{printMsg[order.id]}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />
    </div>
  )
}
