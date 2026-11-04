import { useRouter } from 'expo-router';
import { BarChart3, Boxes, Package, PlusCircle, Puzzle, SlidersHorizontal, Sparkles, Users, Wallet } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { ActionMenuFab } from './ActionFab';

/**
 * The app-wide quick-action menu, mounted once in the (app) layout. It stays
 * put on every screen — including the manage and order pages — so it reads as
 * part of the chrome, exactly like the tab bar does.
 */
export function GlobalActions({ blurTarget }: { blurTarget?: { current: View | null } }) {
  const router = useRouter();

  return (
    <ActionMenuFab
      blurTarget={blurTarget}
      actions={[
        { key: 'new', label: 'طلب جديد', icon: PlusCircle, onPress: () => router.push('/new') },
        { key: 'shift', label: 'الوردية', icon: Wallet, onPress: () => router.push('/shift') },
        { key: 'reports', label: 'التقارير', icon: BarChart3, onPress: () => router.push('/reports') },
        { key: 'products', label: 'المنتجات', icon: Package, onPress: () => router.push('/manage/products') },
        { key: 'addons', label: 'الإضافات', icon: Puzzle, onPress: () => router.push('/manage/addons') },
        { key: 'modifiers', label: 'الموديفاير', icon: SlidersHorizontal, onPress: () => router.push('/manage/modifiers') },
        { key: 'inventory', label: 'المخزون', icon: Boxes, onPress: () => router.push('/manage/inventory') },
        { key: 'users', label: 'الموظفين', icon: Users, onPress: () => router.push('/manage/users') },
        { key: 'assistant', label: 'المساعد', icon: Sparkles, onPress: () => router.push('/assistant') },
      ]}
    />
  );
}
