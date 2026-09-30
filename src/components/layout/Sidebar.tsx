import { cn } from '@/lib/utils'
import {
  BarChart3, Package, Tags, Puzzle, Wrench,
  Archive, Users, Calendar, Wallet, Settings
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
  { id: 'settings', label: 'الإعدادات', icon: Settings },
]

export function Sidebar({ current, onNavigate }: SidebarProps) {
  return (
    <div className="flex shrink-0 bg-card max-lg:w-full max-lg:border-b lg:flex-col lg:w-[190px] lg:h-full lg:border-l">
      <div className="px-4 pt-4 pb-2 max-lg:hidden">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2">إدارة</p>
      </div>
      <div className="flex gap-1.5 overflow-x-auto p-2 max-lg:w-full lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:px-3 lg:py-0 lg:space-y-1.5">
        {adminItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              "flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2.5 lg:py-3 min-h-[44px] lg:min-h-[48px] rounded-xl text-xs lg:text-sm transition-all cursor-pointer shrink-0 lg:w-full whitespace-nowrap",
              current === id
                ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20"
                : "text-foreground hover:bg-secondary font-medium"
            )}
          >
            <Icon className="h-4 w-4 lg:h-5 lg:w-5 shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
