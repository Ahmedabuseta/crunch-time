import { useUserStore } from '@/services/user/user.store'
import { cn } from '@/lib/utils'
import {
  LayoutGrid, Clock, BarChart3, Package, Tags, Puzzle, Wrench,
  Archive, Users, Calendar, Wallet, LogOut
} from 'lucide-react'

export type Page =
  | 'menu' | 'orders' | 'my-shift'
  | 'reports' | 'products' | 'categories' | 'addons' | 'modifiers'
  | 'inventory' | 'users' | 'shifts' | 'cash-drawer' | 'settings'

interface SidebarProps {
  current: Page
  onNavigate: (page: Page) => void
}

const cashierItems: { id: Page; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'menu', label: 'القائمة', icon: LayoutGrid },
  { id: 'orders', label: 'الطلبات', icon: Clock },
  { id: 'my-shift', label: 'ورديتي', icon: Calendar },
]

const adminItems: { id: Page; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'reports', label: 'التقارير', icon: BarChart3 },
  { id: 'products', label: 'المنتجات', icon: Package },
  { id: 'categories', label: 'الأقسام', icon: Tags },
  { id: 'addons', label: 'الإضافات', icon: Puzzle },
  { id: 'modifiers', label: 'الموديفاير', icon: Wrench },
  { id: 'inventory', label: 'المخزون', icon: Archive },
  { id: 'users', label: 'المستخدمين', icon: Users },
  { id: 'shifts', label: 'الورديات', icon: Calendar },
  { id: 'cash-drawer', label: 'درج الكاش', icon: Wallet },
]

export function Sidebar({ current, onNavigate }: SidebarProps) {
  const currentUser = useUserStore((s) => s.currentUser)
  const logout = useUserStore((s) => s.logout)
  const isAdmin = currentUser?.role === 'admin'

  return (
    <div className="flex flex-col w-[180px] shrink-0 bg-card border-l">
      {/* Logo */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="text-lg">🍔</span>
        </div>
        <div>
          <h1 className="text-sm font-black">فاست فود</h1>
          <p className="text-[9px] text-muted-foreground">نقطة البيع</p>
        </div>
      </div>

      <div className="h-px bg-border mx-3" />

      {/* Cashier section */}
      <div className="px-3 pt-3 space-y-1">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-1">عمليات</p>
        {cashierItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer",
              current === id
                ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20"
                : "text-foreground hover:bg-secondary font-medium"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Admin section */}
      {isAdmin && (
        <div className="px-3 pt-3 space-y-1">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-1">إدارة</p>
          {adminItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer",
                current === id
                  ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20"
                  : "text-foreground hover:bg-secondary font-medium"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* User + Logout */}
      <div className="p-3 border-t">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-black text-primary">
            {currentUser?.name?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate">{currentUser?.name}</p>
            <p className="text-[9px] text-muted-foreground">{isAdmin ? 'مدير' : 'كاشير'}</p>
          </div>
          <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
