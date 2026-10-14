import { usePathname, useRouter } from 'expo-router';
import { BarChart3, Boxes, Package, PlusCircle, Users, Wallet } from 'lucide-react-native';
import React from 'react';
import { ArcActionFab } from './ActionFab';

// Screens whose own buttons sit in the same corner — a floating menu there
// would cover a form's save/print actions, so it steps aside.
const HIDDEN_PREFIXES = ['/manage', '/order'];

/** The app-wide quick-action dial, mounted once in the (app) layout. */
export function GlobalActions() {
  const pathname = usePathname();
  const router = useRouter();

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <ArcActionFab
      actions={[
        { key: 'new', label: 'طلب جديد', icon: PlusCircle, onPress: () => router.push('/new') },
        { key: 'shift', label: 'الوردية', icon: Wallet, onPress: () => router.push('/shift') },
        { key: 'reports', label: 'التقارير', icon: BarChart3, onPress: () => router.push('/reports') },
        { key: 'products', label: 'المنتجات', icon: Package, onPress: () => router.push('/manage/products') },
        { key: 'inventory', label: 'المخزون', icon: Boxes, onPress: () => router.push('/manage/inventory') },
        { key: 'users', label: 'الموظفين', icon: Users, onPress: () => router.push('/manage/users') },
      ]}
    />
  );
}
