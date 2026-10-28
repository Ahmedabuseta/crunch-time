import { useState, useEffect, useMemo } from 'react'
import { useOrderStore } from '@/services/order/order.store'
import { useUserStore } from '@/services/user/user.store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Truck, UtensilsCrossed, ChevronDown, X, Printer, ChefHat, RefreshCw, SlidersHorizontal, Trash2, BadgePercent, ReceiptText, Banknote, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { printOrderPack, buildKitchenTicketHtml, contentWidth, markKitchenTicketItems } from '@/lib/print'
import { normalizeReceiptInfo } from '@/lib/receipt'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { ViewToggle } from '@/components/ui/view-toggle'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ViewMode } from '@/components/ui/view-toggle'
import { Emoji } from '@/components/Emoji'
import { OrderVoidDialog } from './pages/OrderVoidDialog'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  COMPLETED: { label: 'مكتمل', color: 'text-green-400', bg: 'bg-green-500/10' },
  CANCELLED: { label: 'ملغي', color: 'text-red-400', bg: 'bg-red-500/10' },
  REFUNDED: { label: 'مسترد', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
}

// Delivery workflow chip: which of the two delivery states the order is in
// (and who drives it once assigned). Lives beside the COMPLETED/CANCELLED
// status on purpose — driver state is not an order status.
function DriverChip({ order }: { order: any }) {
  if (order.orderType !== 'delivery' || !order.driverStatus) return null
  const assigned = order.driverStatus === 'assigned'
  return (
    <span className={cn(
      "text-[10px] font-bold rounded-full px-2 py-0.5",
      assigned ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    )}>
      {assigned ? (order.deliveryProfileName || 'مع سائق') : 'بدون سائق'}
    </span>
  )
}

const paymentLabels: Record<string, string> = {
  cash: 'كاش', card: 'كارت', wallet: 'محفظة', visa: 'فيزا',
}

const orderTypeLabels: Record<string, string> = {
  'dine-in': 'صالة',
  takeaway: 'تيك أوي',
  delivery: 'توصيل',
}

type SortMode = 'latest' | 'oldest' | 'highest' | 'lowest'

/** Order-level discount; falls back to line discounts for orders saved without one. */
function orderDiscount(order: any): number {
  const orderLevel = Number(order?.discountAmount) || 0
  if (orderLevel > 0) return orderLevel
  const items = Array.isArray(order?.items) ? order.items : []
  return items.reduce((sum: number, item: any) => sum + (Number(item?.itemDiscount) || 0), 0)
}

function StatCard({ icon: Icon, label, value, tone }: {
  icon: typeof ReceiptText
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="flex flex-1 items-center gap-2.5 min-w-0 rounded-xl bg-secondary/50 px-3 py-2">
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', tone)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-muted-foreground leading-none mb-1 truncate">{label}</p>
        <p className="text-sm font-black leading-none truncate">{value}</p>
      </div>
    </div>
  )
}

function toEgyptianDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
}

function toEgyptianTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

function toEgyptianShortDate(iso: string) {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('ar-EG', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export function OrderHistory() {
  const orders = useOrderStore((s) => s.orders)
  const fetchOrders = useOrderStore((s) => s.fetch)
  const updateStatus = useOrderStore((s) => s.updateStatus)
  const deleteOrder = useOrderStore((s) => s.delete)
  const currentUser = useUserStore((s) => s.currentUser)
  const isAdmin = currentUser?.role === 'admin'
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [orderTypeFilter, setOrderTypeFilter] = useState<string | null>(null)
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null)
  const [cashierFilter, setCashierFilter] = useState<string | null>(null)
  const [discountFilter, setDiscountFilter] = useState<'all' | 'with' | 'without'>('all')
  const [sortMode, setSortMode] = useState<SortMode>('latest')
  const [voidTarget, setVoidTarget] = useState<any | null>(null)
  const [view, setView] = useState<ViewMode>('table')
  const [printMsg, setPrintMsg] = useState<Record<string, string>>({})
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Cashiers only ever see their own orders; admins see every order on the floor.
  const visibleOrders = useMemo(() => {
    if (isAdmin || !currentUser) return orders
    return orders.filter((o) => {
      const order = o as any
      return order.userId === currentUser.id || (!order.userId && order.cashierName === currentUser.name)
    })
  }, [orders, isAdmin, currentUser])

  const cashierOptions = useMemo(() => {
    const names = new Set<string>()
    for (const order of orders) {
      const name = (order as any).cashierName
      if (name) names.add(name)
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'ar'))
  }, [orders])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        await fetchOrders()
        if (mounted) setLastSyncAt(new Date())
      } catch {
        // handled by page state; avoid crashing refresh loop
      }
    }
    load()

    const onFocus = () => { void load() }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 15000)

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    // Live updates from the phone app: the remote server pushes order events,
    // so a sale taken on a phone appears on this board without waiting for the poll.
    const offPush = window.api.events?.onPush((e) => {
      if (e.channel === 'order:created' || e.channel === 'order:updated') void load()
    })

    return () => {
      mounted = false
      offPush?.()
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchOrders])

  const manualRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchOrders()
      setLastSyncAt(new Date())
    } finally {
      setRefreshing(false)
    }
  }

  const toPrintOrder = (o: any) => ({
    id: o.id, orderType: o.orderType,
    tableNumber: o.tableNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone, customerAddress: o.customerAddress,
    deliveryZoneName: o.deliveryZoneName, deliveryNote: o.deliveryNote,
    deliveryProfileName: o.deliveryProfileName,
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
    const label = kind === 'receipt' ? 'الإيصال' : 'تذكرة المطبخ'
    // A delivery order with no driver hasn't been released for its customer
    // receipt yet — the kitchen ticket path stays open so work can continue.
    if (kind === 'receipt' && o.orderType === 'delivery' && o.driverStatus === 'unassigned') {
      toast({
        title: 'الإيصال لسه مقفول',
        description: `الطلب ${o.id} لسه بدون سائق — عيّن سائق من صفحة الديلفري الأول`,
        variant: 'warning',
        duration: 6500,
      })
      return
    }
    setPrintingId(o.id)
    setPrintMsg((m) => ({ ...m, [o.id]: 'جارٍ الطباعة…' }))
    toast({
      title: `جارٍ طباعة ${label}`,
      description: `الطلب ${o.id}`,
      duration: 5000,
    })
    try {
      if (kind === 'receipt') {
        const s: any = await window.api.settings.get()
        const res = await printOrderPack({
          order: toPrintOrder(o),
          receiptPrinter: s?.receiptPrinter,
          paperWidth: s?.receiptWidth || '80mm',
          autoReceipt: true, autoKitchen: false,
          receiptCopies: s?.receiptCopies || 1,
          receiptInfo: s,
        })
        const ok = Boolean(res.receipt?.ok)
        const message = ok ? 'تم إرسال الإيصال للطابعة' : (res.receipt?.error || 'فشلت الطباعة')
        setPrintMsg((m) => ({ ...m, [o.id]: message }))
        toast({
          title: ok ? 'تمت طباعة الإيصال' : 'فشلت طباعة الإيصال',
          description: ok ? `الطلب ${o.id}` : message,
          variant: ok ? 'success' : 'error',
        })
      } else {
        const s: any = await window.api.settings.get()
        const routed = await window.api.station.routeOrder(o.id)
        const order = toPrintOrder(o)
        const allKitchenItems = [
          ...routed.routes.flatMap((r: any) => r.items || []),
          ...(routed.unrouted || []),
        ]
        const results: string[] = []
        let failedPrints = 0
        for (const r of routed.routes) {
          if (!r.station.printerName) {
            failedPrints += 1
            results.push(`${r.station.name}: مفيش طابعة`)
            continue
          }

          const stPaper = r.station.paperWidth || '80mm'
          const res = await window.api.printer.printHtml(
            buildKitchenTicketHtml(order as any, markKitchenTicketItems(allKitchenItems, r.items), r.station.name, contentWidth(stPaper), normalizeReceiptInfo(s)),
            { deviceName: r.station.printerName, copies: s?.kitchenCopies || 1, paperWidth: stPaper },
          )
          if (!res.ok) failedPrints += 1
          results.push(`${r.station.name}: ${res.ok ? 'تم' : `${res.error}`}`)
        }
        if (routed.routes.length === 0) results.push('مفيش أصناف مربوطة بمحطات')
        if ((routed.unrouted?.length || 0) > 0) results.push(`${routed.unrouted.length} صنف مش مربوط`)
        const message = results.join('، ')
        const hasSuccessfulRoute = routed.routes.some((r: any) => r.station.printerName)
        const ok = failedPrints === 0 && routed.routes.length > 0 && hasSuccessfulRoute
        setPrintMsg((m) => ({ ...m, [o.id]: message }))
        toast({
          title: ok ? 'تم إرسال تذكرة المطبخ' : 'نتيجة طباعة المطبخ',
          description: message || 'لا توجد محطة مطبخ مرتبطة بهذا الطلب',
          variant: ok ? 'success' : 'warning',
          duration: 6500,
        })
      }
    } catch (err: any) {
      const message = err?.message || 'فشلت الطباعة'
      setPrintMsg((m) => ({ ...m, [o.id]: message }))
      toast({
        title: `فشلت طباعة ${label}`,
        description: message,
        variant: 'error',
        duration: 6500,
      })
    } finally {
      setPrintingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteOrder(deleteTarget.id)
      setExpandedOrder(current => current === deleteTarget.id ? null : current)
      toast({
        title: 'تم حذف الطلب',
        description: `تم حذف ${deleteTarget.id} وكل السجلات التابعة له بأمان`,
        variant: 'success',
      })
      setDeleteTarget(null)
    } catch (err: any) {
      toast({
        title: 'فشل حذف الطلب',
        description: err?.message || 'حدث خطأ أثناء حذف الطلب',
        variant: 'error',
        duration: 6500,
      })
    } finally {
      setDeleting(false)
    }
  }

  const sortedOrders = useMemo(() => {
    const cloned = [...visibleOrders]
    if (sortMode === 'highest') return cloned.sort((a, b) => (b.total || 0) - (a.total || 0))
    if (sortMode === 'lowest') return cloned.sort((a, b) => (a.total || 0) - (b.total || 0))
    if (sortMode === 'oldest') {
      return cloned.sort((a, b) => {
        const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        if (delta !== 0) return delta
        return String(a.id).localeCompare(String(b.id))
      })
    }
    return cloned.sort((a, b) => {
      const delta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (delta !== 0) return delta
      return String(b.id).localeCompare(String(a.id))
    })
  }, [visibleOrders, sortMode])

  const filteredOrders = useMemo(() => sortedOrders.filter((o) => {
    const order = o as any
    if (statusFilter && o.status !== statusFilter) return false
    if (orderTypeFilter && o.orderType !== orderTypeFilter) return false
    if (paymentFilter && (order.paymentType || 'cash') !== paymentFilter) return false
    if (cashierFilter && order.cashierName !== cashierFilter) return false
    const discount = orderDiscount(order)
    if (discountFilter === 'with' && discount <= 0) return false
    if (discountFilter === 'without' && discount > 0) return false
    return true
  }), [sortedOrders, statusFilter, orderTypeFilter, paymentFilter, cashierFilter, discountFilter])

  const list = useListControls({
    items: filteredOrders,
    searchText: (o) => {
      const order = o as any
      const itemNames = Array.isArray(order.items) ? order.items.map((i: any) => `${i.productName || ''} ${i.note || ''}`).join(' ') : ''
      return `${o.id} ${order.customerName || ''} ${order.customerPhone || ''} ${order.note || ''} ${order.deliveryZoneName || ''} ${order.deliveryNote || ''} ${order.cashierName || ''} ${itemNames}`
    },
  })

  const stats = useMemo(() => {
    const completed = filteredOrders.filter((o) => o.status === 'COMPLETED')
    return {
      count: filteredOrders.length,
      sales: completed.reduce((sum, o) => sum + (o.total || 0), 0),
      discounts: completed.reduce((sum, o) => sum + orderDiscount(o), 0),
      discounted: completed.filter((o) => orderDiscount(o) > 0).length,
      cancelled: filteredOrders.filter((o) => o.status !== 'COMPLETED').length,
    }
  }, [filteredOrders])

  const activeFilterCount =
    [statusFilter, orderTypeFilter, paymentFilter, cashierFilter].filter(Boolean).length +
    (discountFilter !== 'all' ? 1 : 0)

  const columns: DataColumn<any>[] = [
    {
      key: 'id', label: 'الطلب', render: (o) => (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-black bg-secondary rounded-lg px-2 py-1">{o.id}</span>
          <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", statusConfig[o.status]?.bg, statusConfig[o.status]?.color)}>{statusConfig[o.status]?.label || o.status}</span>
          <DriverChip order={o} />
        </div>
      ),
    },
    {
      key: 'type', label: 'النوع', sortValue: (o: any) => o.orderType, render: (o) => (
        <span className="text-[10px] text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5 font-medium flex items-center gap-1 w-fit">
          {o.orderType === 'delivery' ? <Truck className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
          {o.orderType === 'delivery' ? `توصيل${o.deliveryZoneName ? ` · ${o.deliveryZoneName}` : ''}` : o.orderType === 'takeaway' ? 'تيك أوي' : 'صالة'}
        </span>
      ),
    },
    { key: 'payment', label: 'الدفع', sortValue: (o: any) => o.paymentType || 'cash', render: (o) => <span className="text-xs font-bold">{paymentLabels[o.paymentType] || o.paymentType || 'كاش'}</span> },
    { key: 'cashier', label: 'الكاشير', hide: !isAdmin, sortValue: (o: any) => o.cashierName || '', render: (o) => <span className="text-xs text-muted-foreground">{o.cashierName || '—'}</span> },
    {
      key: 'discount', label: 'الخصم', sortValue: (o: any) => orderDiscount(o), render: (o) => {
        const discount = orderDiscount(o)
        if (discount <= 0) return <span className="text-[11px] text-muted-foreground">—</span>
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="flex items-center gap-1 text-xs font-black text-green-400">
              <BadgePercent className="h-3 w-3" />
              -{fmtMoney(discount)} ج.م
            </span>
            {o.discountCode && <span className="text-[9px] font-bold text-muted-foreground">{o.discountCode}</span>}
          </div>
        )
      },
    },
    {
      key: 'items', label: 'الأصناف', sortValue: (o: any) => (o.items || []).length, render: (o) => {
        const rows = o.items || []
        const units = rows.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0)
        if (rows.length === 0) return <span className="text-[11px] text-muted-foreground">—</span>
        return (
          <div
            className="flex flex-col gap-0.5"
            title={rows.map((item: any) => `${item.productName || 'منتج'} ×${item.quantity}`).join('، ')}
          >
            <span className="font-bold">{rows.length} صنف</span>
            <span className="text-[10px] text-muted-foreground">{units} قطعة</span>
          </div>
        )
      },
    },
    { key: 'total', label: 'الإجمالي', className: 'text-left', render: (o) => <span className="font-black text-primary">{o.total.toFixed(0)} ج.م</span> },
    {
      key: 'time', label: 'التاريخ والوقت', sortValue: (o: any) => o.createdAt, render: (o) => (
        <div className="flex flex-col gap-0.5 whitespace-nowrap">
          <span className="text-[11px] font-bold">{toEgyptianShortDate(o.createdAt)}</span>
          <span className="text-[11px] text-muted-foreground">{toEgyptianTime(o.createdAt)}</span>
        </div>
      ),
    },
    {
      key: 'actions', label: 'إجراءات', render: (o) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => handleReprint(o, 'receipt')}
            disabled={printingId === o.id || (o.orderType === 'delivery' && o.driverStatus === 'unassigned')}
            title={o.orderType === 'delivery' && o.driverStatus === 'unassigned' ? 'الإيصال يتطبع بعد تعيين السائق' : 'إعادة طباعة الإيصال'}
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-secondary/60 text-foreground hover:bg-secondary transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            <Printer className="h-4 w-4" />
          </button>
          <button onClick={() => handleReprint(o, 'kitchen')} disabled={printingId === o.id} title="تذكرة المطبخ"
            className="flex items-center justify-center h-9 w-9 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors cursor-pointer disabled:opacity-50">
            <ChefHat className="h-4 w-4" />
          </button>
          {isAdmin && (
            <button onClick={() => setDeleteTarget(o)} title="حذف الطلب"
              className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors cursor-pointer">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {o.status === 'COMPLETED' && (
            <button onClick={() => setVoidTarget(o)} title="إلغاء / استرداد"
              className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ]

  const handleVoidConfirm = async (status: 'CANCELLED' | 'REFUNDED', reason: string) => {
    if (!voidTarget) return
    await updateStatus(voidTarget.id, status, reason)
    toast({
      title: status === 'CANCELLED' ? 'تم إلغاء الطلب' : 'تم استرداد الطلب',
      description: voidTarget.id,
      variant: 'success',
    })
  }

  const renderOrderDetails = (order: any) => {
    const o = order as any
    const items: any[] = o.items || []
    const units = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
    return (
      <div className="space-y-3 animate-slide-up">
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
            <p className="font-bold">{order.orderType === 'delivery' ? 'توصيل' : order.orderType === 'takeaway' ? 'تيك أوي' : 'صالة'}</p>
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
              {o.deliveryZoneName && <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2.5"><p className="text-muted-foreground mb-0.5">منطقة التوصيل</p><p className="font-bold text-blue-400">{o.deliveryZoneName}</p></div>}
              {o.deliveryNote && <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2.5 col-span-2"><p className="text-muted-foreground mb-0.5">ملاحظة الدليفري</p><p className="font-medium break-words">{o.deliveryNote}</p></div>}
            </>
          )}
        </div>

        {/* Items */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black text-muted-foreground">الأصناف ({items.length})</p>
            <span className="text-[10px] font-bold text-muted-foreground">{units} قطعة إجمالًا</span>
          </div>
          {items.map((item: any) => {
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
                  {item.productName || 'منتج'}
                  {mods.length > 0 && <span className="text-primary"> ({mods.join('، ')})</span>}
                  {' '}×{item.quantity}
                  {item.note && (
                    <span className="block text-[10px] font-medium text-amber-400 border-r-2 border-amber-400 pr-1.5 mt-0.5">{item.note}</span>
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
                      <span className="flex-1 break-words min-w-0">↳ <Emoji>{a.emoji}</Emoji> {a.name}{a.qty > 1 ? ` ×${a.qty}` : ''}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
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
            <p className="font-black text-amber-400">ملاحظة الطلب</p>
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

        {/* Status controls — for COMPLETED orders */}
        {order.status === 'COMPLETED' && (
          <div className="flex gap-2 pt-1">
            <button onClick={() => setVoidTarget(order)}
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
          {isAdmin && (
            <button onClick={() => setDeleteTarget(order)} className="px-3 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer" title="حذف الطلب">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {printMsg[order.id] && (
          <p className="text-[11px] font-bold text-muted-foreground">{printMsg[order.id]}</p>
        )}
      </div>
    )
  }

  if (visibleOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <div className="w-16 h-16 rounded-3xl bg-secondary/60 flex items-center justify-center"><span className="text-2xl opacity-40">📋</span></div>
        <div className="text-center">
          <p className="text-sm font-bold">{isAdmin ? 'لا توجد طلبات بعد' : 'لا توجد طلبات باسمك بعد'}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{isAdmin ? 'أكمل طلب لرؤية الطلبات هنا' : 'الطلبات التي تنشئها من الكاشير ستظهر هنا'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {isAdmin && (
        <div className="flex shrink-0 items-stretch gap-2 overflow-x-auto px-5 py-3 border-b">
          <StatCard icon={ReceiptText} label="الطلبات" value={String(stats.count)} tone="bg-primary/10 text-primary" />
          <StatCard icon={Banknote} label="المبيعات" value={`${fmtMoney(stats.sales)} ج.م`} tone="bg-green-500/10 text-green-400" />
          <StatCard icon={BadgePercent} label={`الخصومات · ${stats.discounted}`} value={`-${fmtMoney(stats.discounts)} ج.م`} tone="bg-amber-500/10 text-amber-400" />
          <StatCard icon={XCircle} label="ملغية / مستردة" value={String(stats.cancelled)} tone="bg-red-500/10 text-red-400" />
        </div>
      )}

      {/* Search + Filter */}
      <div className="px-5 pt-4 pb-3 space-y-3 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={list.search} onChange={e => { list.setSearch(e.target.value); list.setPage(1) }} placeholder="بحث: رقم الطلب، العميل، التليفون، المنتج..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
            {list.search && <button onClick={() => { list.setSearch(''); list.setPage(1) }} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"><X className="h-4 w-4" /></button>}
          </div>
          <button
            onClick={() => void manualRefresh()}
            disabled={refreshing}
            className="h-10 px-3 rounded-xl bg-secondary text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
            title="تحديث الطلبات"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            تحديث
          </button>
          <ViewToggle value={view} onChange={setView} />
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>النتائج: <span className="font-bold text-foreground">{list.total}</span>{!isAdmin && ' · طلباتك فقط'}</span>
          <span>{lastSyncAt ? `آخر تحديث ${lastSyncAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : '—'}</span>
        </div>

        <button onClick={() => setFiltersOpen(value => !value)}
          className="flex items-center justify-between w-full rounded-xl bg-secondary/60 px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <span className="flex items-center gap-2"><SlidersHorizontal className="h-3.5 w-3.5" /> الفلاتر والترتيب {activeFilterCount > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">{activeFilterCount}</span>}</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", filtersOpen && "rotate-180")} />
        </button>

        {filtersOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 animate-slide-up">
            <Select value={sortMode} onValueChange={(value) => { setSortMode(value as SortMode); list.setPage(1) }}>
              <SelectTrigger className="h-9 rounded-lg bg-secondary text-xs font-bold"><SelectValue placeholder="الترتيب" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">الأحدث أولاً</SelectItem>
                <SelectItem value="oldest">الأقدم أولاً</SelectItem>
                <SelectItem value="highest">الأعلى قيمة</SelectItem>
                <SelectItem value="lowest">الأقل قيمة</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter || 'all'} onValueChange={(value) => { setStatusFilter(value === 'all' ? null : value); list.setPage(1) }}>
              <SelectTrigger className="h-9 rounded-lg bg-secondary text-xs font-bold"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(statusConfig).map(([key, config]) => <SelectItem key={key} value={key}>{config.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={orderTypeFilter || 'all'} onValueChange={(value) => { setOrderTypeFilter(value === 'all' ? null : value); list.setPage(1) }}>
              <SelectTrigger className="h-9 rounded-lg bg-secondary text-xs font-bold"><SelectValue placeholder="نوع الطلب" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {Object.entries(orderTypeLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={paymentFilter || 'all'} onValueChange={(value) => { setPaymentFilter(value === 'all' ? null : value); list.setPage(1) }}>
              <SelectTrigger className="h-9 rounded-lg bg-secondary text-xs font-bold"><SelectValue placeholder="الدفع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المدفوعات</SelectItem>
                {Object.entries(paymentLabels).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            {isAdmin && (
              <>
                <Select value={cashierFilter || 'all'} onValueChange={(value) => { setCashierFilter(value === 'all' ? null : value); list.setPage(1) }}>
                  <SelectTrigger className="h-9 rounded-lg bg-secondary text-xs font-bold"><SelectValue placeholder="الكاشير" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الكاشيرية</SelectItem>
                    {cashierOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={discountFilter} onValueChange={(value) => { setDiscountFilter(value as 'all' | 'with' | 'without'); list.setPage(1) }}>
                  <SelectTrigger className="h-9 rounded-lg bg-secondary text-xs font-bold"><SelectValue placeholder="الخصم" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل (خصم وبدونه)</SelectItem>
                    <SelectItem value="with">مع خصم</SelectItem>
                    <SelectItem value="without">بدون خصم</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        )}
      </div>

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable
            columns={columns}
            data={list.items}
            keyExtractor={(order) => order.id}
            sort={list.sort}
            onSortChange={list.setSort}
            onRowClick={(o) => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
            renderExpanded={(order) => expandedOrder === order.id ? renderOrderDetails(order) : null}
          />
        </div>
      ) : (
      <ScrollArea className="flex-1 p-5">
        <div className="space-y-3">
          {list.items.map((order) => {
            const isExpanded = expandedOrder === order.id
            return (
              <div key={order.id} className="border-2 rounded-2xl bg-card overflow-hidden animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black bg-secondary rounded-lg px-2.5 py-1">{order.id}</span>
                    <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", statusConfig[order.status]?.bg, statusConfig[order.status]?.color)}>{statusConfig[order.status]?.label || order.status}</span>
                    <DriverChip order={order} />
                    {orderDiscount(order) > 0 && (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-green-500/10 text-green-400" title="قيمة الخصم">
                        خصم -{fmtMoney(orderDiscount(order))} ج.م
                      </span>
                    )}
                    {isAdmin && (order as any).cashierName && (
                      <span className="text-[10px] text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5">{(order as any).cashierName}</span>
                    )}
                    {((order as any).note || ((order as any).items || []).some((i: any) => i.note)) && (
                      <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-400" title="يوجد ملاحظات">ملاحظة</span>
                    )}
                    <span className="text-[10px] text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                      {order.orderType === 'delivery' ? <Truck className="h-3 w-3" /> : <UtensilsCrossed className="h-3 w-3" />}
                      {order.orderType === 'delivery' ? `توصيل${(order as any).deliveryZoneName ? ` · ${(order as any).deliveryZoneName}` : ''}` : order.orderType === 'takeaway' ? 'تيك أوي' : 'صالة'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground font-medium">{toEgyptianShortDate(order.createdAt)} · {toEgyptianTime(order.createdAt)}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && renderOrderDetails(order)}
              </div>
            )
          })}
        </div>
      </ScrollArea>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="حذف الطلب نهائياً؟"
        description={deleteTarget ? `سيتم حذف ${deleteTarget.id} مع الأصناف والمدفوعات وحركات المخزون المرتبطة به. إذا كان الطلب مكتملًا، سيُعاد المخزون قبل الحذف. هذا الإجراء لا يمكن التراجع عنه.` : undefined}
        confirmLabel={deleting ? 'جارٍ الحذف…' : 'حذف نهائي'}
        onConfirm={() => void handleDelete()}
        onCancel={() => { if (!deleting) setDeleteTarget(null) }}
      />

      {voidTarget && (
        <OrderVoidDialog
          order={voidTarget}
          onClose={() => setVoidTarget(null)}
          onConfirm={handleVoidConfirm}
        />
      )}
    </div>
  )
}
