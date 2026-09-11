import { cn } from '@/lib/utils'
import {
  BarChart3, Package, Tags, Puzzle, Wrench,
  Archive, Users, Calendar, Wallet
} from 'lucide-react'

export type Page =
  | 'menu' | 'orders' | 'my-shift'
  | 'reports' | 'products' | 'categories' | 'addons' | 'modifiers'
  | 'inventory' | 'users' | 'shifts' | 'cash-drawer' | 'settings'

interface SidebarProps {
  current: Page
  onNavigate: (page: Page) => void
}

const adminItems: { id: Page; label: string; icon: typeof BarChart3 }[] = [
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
  return (
    <div className="flex flex-col w-[170px] shrink-0 bg-card border-l">
      <div className="px-3 pt-4 pb-2">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-2">إدارة</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 space-y-1">
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
    </div>
  )
}
