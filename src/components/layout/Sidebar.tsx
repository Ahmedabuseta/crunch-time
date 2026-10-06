'use client'

import { cn } from '@/lib/utils'
import { useState } from 'react'

export type Page =
  | 'menu' | 'orders' | 'delivery' | 'my-shift'
  | 'reports' | 'products' | 'categories' | 'addons' | 'modifiers'
  | 'inventory' | 'users' | 'shifts' | 'cash-drawer' | 'settings'

interface SidebarProps {
  current: Page
  onNavigate: (page: Page) => void
}

interface NavItem {
  id: Page
  label: string
  icon: string // SVG path data
  iconActive: string
}

const adminItems: NavItem[] = [
  { id: 'reports', label: 'التقارير', icon: 'M3 3v18h18', iconActive: 'M3 3v18h18' },
  { id: 'products', label: 'المنتجات', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', iconActive: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'categories', label: 'الأقسام', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16', iconActive: 'M4 6h16M4 10h16M4 14h8M4 18h10' },
  { id: 'addons', label: 'الإضافات', icon: 'M12 5v14m-7-7h14', iconActive: 'M12 5v14m-7-7h14' },
  { id: 'modifiers', label: 'الموديفاير', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', iconActive: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
  { id: 'inventory', label: 'المخزون', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', iconActive: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'users', label: 'المستخدمين', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 110-8 4 4 0 010 8zm0 0h8', iconActive: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 110-8 4 4 0 010 8zm0 0h8' },
  { id: 'shifts', label: 'الورديات', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', iconActive: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'cash-drawer', label: 'درج الكاش', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z', iconActive: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'settings', label: 'الإعدادات', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', iconActive: 'M12 15a3 3 0 100-6 3 3 0 000 6z' },
]

function SvgIcon({ d, active, className }: { d: string; active?: boolean; className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 lg:h-5 lg:w-5 shrink-0 transition-transform duration-200', active && 'scale-110', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
    >
      <path d={d} />
    </svg>
  )
}

function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="hidden lg:flex items-center justify-center w-full py-2 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200 rounded-lg mx-1"
      title={collapsed ? 'فتح القائمة' : 'إغلاق القائمة'}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      <svg
        className={cn('h-4 w-4 transition-transform duration-300 ease-out', collapsed ? 'rotate-180' : 'rotate-0')}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 24 24"
      >
        <path d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )
}

export function Sidebar({ current, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={cn(
        'flex shrink-0 bg-card max-lg:w-full max-lg:border-b lg:flex-col lg:h-full lg:border-l transition-all duration-300 ease-out',
        collapsed ? 'lg:w-[64px]' : 'lg:w-[190px]'
      )}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2 max-lg:hidden flex items-center justify-between">
        {!collapsed && (
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 transition-opacity duration-200">
            إدارة
          </p>
        )}
        <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      </div>

      {/* Nav items */}
      <div className="flex gap-1.5 overflow-x-auto p-2 max-lg:w-full lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:px-3 lg:py-0 lg:space-y-1.5">
        {adminItems.map(({ id, label, icon, iconActive }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              'flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2.5 lg:py-3 min-h-[44px] lg:min-h-[48px] rounded-xl text-xs lg:text-sm transition-all duration-200 cursor-pointer shrink-0 lg:w-full whitespace-nowrap',
              current === id
                ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20'
                : 'text-foreground hover:bg-secondary font-medium'
            )}
            title={collapsed ? label : undefined}
          >
            <SvgIcon d={current === id ? iconActive : icon} active={current === id} />
            {!collapsed && label}
          </button>
        ))}
      </div>
    </div>
  )
}
