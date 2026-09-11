import { useEffect, useState } from 'react'
import { useCategoryStore } from '@/services/category/category.store'
import { useProductStore } from '@/services/product/product.store'
import { useAddonStore } from '@/services/addon/addon.store'
import { useOrderStore } from '@/services/order/order.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { useUserStore } from '@/services/user/user.store'
import { LoginPage } from '@/components/LoginPage'
import { Sidebar, type Page } from '@/components/layout/Sidebar'
import { ProductGrid } from '@/components/ProductGrid'
import { Cart } from '@/components/Cart'
import { CategorySidebar } from '@/components/CategorySidebar'
import { OrderHistory } from '@/components/OrderHistory'
import { Reports } from '@/components/Reports'
import { ProductsPage } from '@/components/pages/ProductsPage'
import { CategoriesPage } from '@/components/pages/CategoriesPage'
import { AddonsPage } from '@/components/pages/AddonsPage'
import { ModifiersPage } from '@/components/pages/ModifiersPage'
import { InventoryPage } from '@/components/pages/InventoryPage'
import { UsersPage } from '@/components/pages/UsersPage'
import { ShiftsPage } from '@/components/pages/ShiftsPage'
import { MyShiftPage } from '@/components/pages/MyShiftPage'
import { CashDrawerPage } from '@/components/pages/CashDrawerPage'
import { SettingsPage } from '@/components/pages/SettingsPage'
import { LayoutGrid, Clock, Calendar, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

function App() {
  const currentUser = useUserStore((s) => s.currentUser)
  const logout = useUserStore((s) => s.logout)
  const [page, setPage] = useState<Page>('menu')
  const [category, setCategory] = useState<string | null>(null)

  const fetchCategories = useCategoryStore((s) => s.fetch)
  const fetchProducts = useProductStore((s) => s.fetch)
  const fetchAddons = useAddonStore((s) => s.fetch)
  const fetchOrders = useOrderStore((s) => s.fetch)
  const fetchAlerts = useInventoryStore((s) => s.fetchAlerts)

  useEffect(() => {
    if (currentUser) {
      fetchCategories()
      fetchProducts()
      fetchAddons()
      fetchOrders()
      fetchAlerts()
    }
  }, [currentUser])

  if (!currentUser) {
    return <LoginPage onLogin={() => {}} />
  }

  const isAdmin = currentUser.role === 'admin'

  const topTabs: { id: Page; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'menu', label: 'القائمة', icon: LayoutGrid },
    { id: 'orders', label: 'الطلبات', icon: Clock },
    { id: 'my-shift', label: 'ورديتي', icon: Calendar },
  ]

  const renderPage = () => {
    switch (page) {
      case 'menu':
        return (
          <div className="flex h-full">
            <CategorySidebar selected={category} onSelect={setCategory} />
            <div className="flex-1 min-w-0"><ProductGrid category={category} /></div>
          </div>
        )
      case 'orders': return <OrderHistory />
      case 'my-shift': return <MyShiftPage />
      case 'reports': return <Reports />
      case 'products': return <ProductsPage />
      case 'categories': return <CategoriesPage />
      case 'addons': return <AddonsPage />
      case 'modifiers': return <ModifiersPage />
      case 'inventory': return <InventoryPage />
      case 'users': return <UsersPage />
      case 'shifts': return <ShiftsPage />
      case 'cash-drawer': return <CashDrawerPage />
      case 'settings': return <SettingsPage />
      default: return <ProductGrid category={category} />
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background" dir="rtl">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="text-base">🍔</span>
          </div>
          <span className="text-sm font-black">فاست فود</span>
        </div>

        {/* Cashier nav tabs */}
        <div className="flex items-center gap-1 bg-secondary/60 rounded-full p-1">
          {topTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold transition-all cursor-pointer",
                page === id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">{currentUser.name}</span>
          <span className={cn("text-[10px] font-bold rounded-full px-2 py-0.5", isAdmin ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
            {isAdmin ? 'مدير' : 'كاشير'}
          </span>
          <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Admin sidebar — only for admin */}
        {isAdmin && <Sidebar current={page} onNavigate={setPage} />}

        {/* Page content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {renderPage()}
        </div>

        {/* Cart — only on menu page */}
        {page === 'menu' && (
          <div className="w-[360px] shrink-0 bg-card border-r">
            <Cart />
          </div>
        )}
      </div>
    </div>
  )
}

export default App
