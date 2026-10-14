import { useEffect, useState } from 'react'
import { useCategoryStore } from '@/services/category/category.store'
import { useProductStore } from '@/services/product/product.store'
import { useAddonStore } from '@/services/addon/addon.store'
import { useOrderStore } from '@/services/order/order.store'
import { useCartStore } from '@/services/cart/cart.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { useUserStore } from '@/services/user/user.store'
import { LoginPage } from '@/components/LoginPage'
import { Sidebar, type Page } from '@/components/layout/Sidebar'
import { ProductGrid } from '@/components/ProductGrid'
import { Cart } from '@/components/Cart'
import { CategorySidebar } from '@/components/CategorySidebar'
import { OrderHistory } from '@/components/OrderHistory'
import { DeliveryPage } from '@/components/pages/DeliveryPage'
import { Reports } from '@/components/Reports'
import { ProductsPage } from '@/components/pages/ProductsPage'
import { CategoriesPage } from '@/components/pages/CategoriesPage'
import { AddonsPage } from '@/components/pages/AddonsPage'
import { ModifiersPage } from '@/components/pages/ModifiersPage'
import { InventoryPage } from '@/components/pages/InventoryPage'
import { UsersPage } from '@/components/pages/UsersPage'
import { ShiftsPage } from '@/components/pages/ShiftsPage'
import { ShiftReportPage } from '@/components/pages/ShiftReportPage'
import { MyShiftPage } from '@/components/pages/MyShiftPage'
import { CashDrawerPage } from '@/components/pages/CashDrawerPage'
import { SettingsPage } from '@/components/pages/SettingsPage'
import { Sun, Moon } from 'lucide-react'
import { getThemeMode, setThemeMode, type ThemeMode } from '@/lib/theme'
import { Logo } from '@/components/Logo'
import { ShiftStatusChip } from '@/components/ShiftStatusChip'
import { UpdateBanner } from '@/components/UpdateBanner'
import { Toaster, toast } from '@/components/ui/toast'
import { LayoutGrid, Clock, Calendar, LogOut, ShoppingCart, X, Truck, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

function App() {
  const currentUser = useUserStore((s) => s.currentUser)
  const logout = useUserStore((s) => s.logout)
  const [page, setPage] = useState<Page>('menu')
  const [category, setCategory] = useState<string | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [themeMode, setThemeModeLocal] = useState<ThemeMode>(getThemeMode)
  const cartCount = useCartStore((s) => s.itemCount)()
  // Shift whose report is open on the shift-report detail page.
  const [shiftReportId, setShiftReportId] = useState<string | null>(null)

  const fetchCategories = useCategoryStore((s) => s.fetch)
  const fetchProducts = useProductStore((s) => s.fetch)
  const fetchAddons = useAddonStore((s) => s.fetch)
  const fetchOrders = useOrderStore((s) => s.fetch)
  const orders = useOrderStore((s) => s.orders)
  const fetchAlerts = useInventoryStore((s) => s.fetchAlerts)
  // Live count behind the الديلفري tab: today's delivery orders with no driver.
  const [unassignedCount, setUnassignedCount] = useState(0)

  const refreshUnassigned = async () => {
    try {
      setUnassignedCount(Number(await window.api.order.unassignedCount()) || 0)
    } catch {
      // The badge is cosmetic — never let it break the shell.
    }
  }

  // Manual "check for updates" for the top-bar refresh icon — the same check
  // the Settings card runs, but answering with a toast so it works anywhere.
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false)
  // Mirrors the main process' updater state so the button can never start a
  // second check while one is already running or a download is in flight.
  const [updateLive, setUpdateLive] = useState<string | null>(null)
  useEffect(() => window.updater?.onStatus?.((s) => setUpdateLive(s.status)), [])
  const updateBusy = updateCheckBusy
    || updateLive === 'checking'
    || updateLive === 'downloading'
    || updateLive === 'available'
    || updateLive === 'downloaded'
  // Only spin while work is actually happening — a finished download just
  // disables the button (there is nothing left to check).
  const updateSpinning = updateCheckBusy
    || updateLive === 'checking'
    || updateLive === 'downloading'
    || updateLive === 'available'

  const handleUpdateCheck = async () => {
    if (updateBusy) return
    setUpdateCheckBusy(true)
    try {
      const res = await window.updater?.check()
      if (!res?.ok) {
        toast({
          title: 'فحص التحديثات',
          description: res?.error === 'dev' ? 'وضع التطوير — التحديثات تعمل في النسخة المثبتة فقط'
            : res?.error === 'unavailable' ? 'التحديثات غير متاحة في هذه النسخة'
            : 'تعذر التحقق — تحقق من الاتصال بالإنترنت',
          variant: 'error',
        })
      } else if (res.busy) {
        // The main process answered with the live state instead of starting a
        // second download — say so instead of pretending a new check happened.
        toast({
          title: res.phase === 'downloaded' ? 'التحديث جاهز' : 'التحديث قيد التحميل',
          description: res.phase === 'downloaded'
            ? 'أعد التشغيل للتثبيت'
            : `v${res.version || res.latest || ''} — تابع الشريط أعلى الشاشة`,
          variant: res.phase === 'downloaded' ? 'success' : 'default',
        })
      } else if (res.version) {
        toast({ title: 'يوجد تحديث جديد', description: `v${res.version} — جارٍ التحميل في الخلفية`, variant: 'success' })
      } else {
        toast({ title: 'أنت على أحدث نسخة', description: res.current ? `v${res.current}` : undefined })
      }
    } catch {
      toast({ title: 'تعذر التحقق من التحديثات', description: 'حاول لاحقاً', variant: 'error' })
    } finally {
      setUpdateCheckBusy(false)
    }
  }

  useEffect(() => {
    if (currentUser) {
      fetchCategories()
      fetchProducts()
      fetchAddons()
      fetchOrders()
      fetchAlerts()
    }
  }, [currentUser])

  // Checkout, driver assignment and filtered refetches all replace `orders`,
  // so this is the one place the badge needs to re-read its count from.
  useEffect(() => {
    if (currentUser) refreshUnassigned()
  }, [orders, currentUser])

  if (!currentUser) {
    return <LoginPage onLogin={() => {}} />
  }
  const isAdmin = currentUser.role === 'admin'

  const adminPages: Page[] = ['reports', 'products', 'categories', 'addons', 'modifiers', 'inventory', 'users', 'shifts', 'cash-drawer', 'settings', 'shift-report']
  if (!isAdmin && adminPages.includes(page)) {
    setPage('menu')
  }

  const topTabs: { id: Page; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'menu', label: 'القائمة', icon: LayoutGrid },
    { id: 'orders', label: 'الطلبات', icon: Clock },
    { id: 'delivery', label: 'الديلفري', icon: Truck },
    { id: 'my-shift', label: 'ورديتي', icon: Calendar },
  ]

  const renderPage = () => {
    switch (page) {
      case 'menu':
        return (
          <div className="flex flex-col md:flex-row h-full">
            <CategorySidebar selected={category} onSelect={setCategory} />
            <div className="flex-1 min-w-0 min-h-0"><ProductGrid category={category} /></div>
          </div>
        )
      case 'orders': return <OrderHistory />
      case 'delivery': return <DeliveryPage onAssigned={refreshUnassigned} />
      case 'my-shift': return <MyShiftPage />
      case 'reports': return <Reports />
      case 'products': return <ProductsPage />
      case 'categories': return <CategoriesPage />
      case 'addons': return <AddonsPage />
      case 'modifiers': return <ModifiersPage />
      case 'inventory': return <InventoryPage />
      case 'users': return <UsersPage />
      case 'shifts': return <ShiftsPage onOpenShiftReport={(id) => { setShiftReportId(id); setPage('shift-report') }} />
      case 'shift-report': return <ShiftReportPage shiftId={shiftReportId} onBack={() => setPage('shifts')} />
      case 'cash-drawer': return <CashDrawerPage />
      case 'settings': return <SettingsPage />
      default: return <ProductGrid category={category} />
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background" dir="rtl">
      <Toaster />
      <UpdateBanner />
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Logo size="sm" />
        </div>

        {/* Cashier nav tabs */}
        <div className="flex items-center gap-1 bg-secondary/60 rounded-full p-1 min-w-0 overflow-x-auto">
          {topTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap",
                page === id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="max-sm:hidden">{label}</span>
              {/* Red pill: delivery orders waiting for a driver right now */}
              {id === 'delivery' && unassignedCount > 0 && (
                <span className={cn(
                  "min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center leading-none",
                  page === id ? "bg-white/25 text-white" : "bg-red-500 text-white",
                )}>
                  {unassignedCount > 99 ? '99+' : unassignedCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="hidden sm:block">
          <ShiftStatusChip onOpenShift={() => setPage('my-shift')} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-muted-foreground hidden lg:block">{currentUser.name}</span>
          <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5 hidden sm:block", isAdmin ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
            {isAdmin ? 'مدير' : 'كاشير'}
          </span>
          {page === 'menu' && (
            <button
              onClick={() => setCartOpen(true)}
              className="lg:hidden relative flex items-center justify-center h-10 w-10 rounded-xl bg-primary text-primary-foreground cursor-pointer"
              title="السلة"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -left-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-black text-white px-1">
                  {cartCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={handleUpdateCheck}
            disabled={updateBusy}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1 disabled:opacity-50 disabled:cursor-wait"
            title={updateBusy ? 'جارٍ فحص/تحميل التحديث…' : 'فحص التحديثات'}
          >
            <RefreshCw className={cn("h-4 w-4", updateSpinning && "animate-spin")} />
          </button>
          <button
            onClick={() => { const next: ThemeMode = themeMode === 'dark' ? 'light' : 'dark'; setThemeMode(next); setThemeModeLocal(next) }}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1"
            title={themeMode === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
          >
            {themeMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile shift chip row */}
      <div className="sm:hidden flex justify-center py-1.5 border-b bg-card/60 shrink-0">
        <ShiftStatusChip onOpenShift={() => setPage('my-shift')} />
      </div>

      {/* Mobile admin nav strip — only on admin pages */}
      {isAdmin && !(['menu', 'orders', 'my-shift', 'shift-report'] as Page[]).includes(page) && (
        <div className="lg:hidden shrink-0">
          <Sidebar current={page} onNavigate={setPage} />
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Admin sidebar — only for admin, hidden on small screens behind pages */}
        {isAdmin && (
          <div className="hidden lg:block shrink-0">
            <Sidebar current={page} onNavigate={setPage} />
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {renderPage()}
        </div>

        {/* Cart — side panel on desktop */}
        {page === 'menu' && (
          <div className="hidden lg:block w-[360px] shrink-0 bg-card border-r">
            <Cart />
          </div>
        )}
      </div>

      {/* Cart — bottom drawer on mobile/tablet */}
      {page === 'menu' && cartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setCartOpen(false)} />
          <div className="relative bg-card rounded-t-3xl max-h-[85vh] h-[85vh] flex flex-col animate-slide-up">
            <div className="flex items-center justify-center pt-2 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <button
              onClick={() => setCartOpen(false)}
              className="absolute top-3 left-3 flex items-center justify-center h-9 w-9 rounded-full bg-secondary text-muted-foreground cursor-pointer"
              title="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex-1 min-h-0">
              <Cart />
            </div>
          </div>
        </div>
      )}

      {/* Floating cart button on mobile when drawer closed */}
      {page === 'menu' && !cartOpen && cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="lg:hidden fixed bottom-4 inset-x-4 z-40 flex items-center justify-center gap-2 h-13 py-3.5 rounded-2xl bg-primary text-primary-foreground font-black text-sm shadow-xl shadow-primary/30 cursor-pointer active:scale-[0.98] transition-transform"
        >
          <ShoppingCart className="h-5 w-5" />
          عرض السلة · {cartCount}
        </button>
      )}
    </div>
  )
}

export default App
