import { useRouter } from 'expo-router';
import { BarChart3, Boxes, Package, PlusCircle, Users, Wallet } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { ArcActionFab } from './ActionFab';

/**
 * The app-wide quick-action dial, mounted once in the (app) layout. It stays
 * put on every screen — including the manage and order pages — so it reads as
 * part of the chrome, exactly like the tab bar does.
 */
export function GlobalActions({ blurTarget }: { blurTarget?: { current: View | null } }) {
  const router = useRouter();

  return (
    <ArcActionFab
      blurTarget={blurTarget}
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
