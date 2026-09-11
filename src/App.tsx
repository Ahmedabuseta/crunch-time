import { useEffect, useState } from 'react'
import { useCategoryStore } from '@/services/category/category.store'
import { useProductStore } from '@/services/product/product.store'
import { useAddonStore } from '@/services/addon/addon.store'
import { useOrderStore } from '@/services/order/order.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { useUserStore } from '@/services/user/user.store'
import { LoginPage } from '@/components/LoginPage'
import { ProductGrid } from '@/components/ProductGrid'
import { Cart } from '@/components/Cart'
import { CategorySidebar } from '@/components/CategorySidebar'
import { OrderHistory } from '@/components/OrderHistory'
import { Reports } from '@/components/Reports'
import { Clock, LayoutGrid, BarChart3, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

type View = 'menu' | 'history' | 'reports'

function App() {
  const currentUser = useUserStore((s) => s.currentUser)
  const logout = useUserStore((s) => s.logout)
  const [view, setView] = useState<View>('menu')
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

  const tabs: { id: View; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'menu', label: 'القائمة', icon: LayoutGrid },
    { id: 'history', label: 'الطلبات', icon: Clock },
    ...(currentUser.role === 'admin' ? [{ id: 'reports' as View, label: 'التقارير', icon: BarChart3 }] : []),
  ]

  return (
    <div className="flex h-screen w-screen bg-background" dir="rtl">
      <CategorySidebar selected={category} onSelect={(id) => { setCategory(id); setView('menu'); }} />

      <div className="flex flex-col flex-1 min-w-0 border-l">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-primary/10">
              <span className="text-xl">🍔</span>
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">فاست فود</h1>
              <p className="text-[11px] text-muted-foreground font-medium">نقطة البيع</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-secondary/60 rounded-full p-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold transition-all cursor-pointer",
                    view === id
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mr-2 px-3 py-1.5 bg-secondary/60 rounded-full">
              <span className="text-xs font-bold">{currentUser.name}</span>
              <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="flex-1 overflow-hidden">
          {view === 'menu' && <ProductGrid category={category} />}
          {view === 'history' && <OrderHistory />}
          {view === 'reports' && <Reports />}
        </div>
      </div>

      <div className="w-[360px] shrink-0 bg-card">
        <Cart />
      </div>
    </div>
  )
}

export default App
