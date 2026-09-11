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

function App() {
  const currentUser = useUserStore((s) => s.currentUser)
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
    <div className="flex h-screen w-screen bg-background" dir="rtl">
      <Sidebar current={page} onNavigate={setPage} />

      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex-1 overflow-hidden">
          {renderPage()}
        </div>
      </div>

      {/* Cart — only show on menu page */}
      {page === 'menu' && (
        <div className="w-[360px] shrink-0 bg-card border-r">
          <Cart />
        </div>
      )}
    </div>
  )
}

export default App
