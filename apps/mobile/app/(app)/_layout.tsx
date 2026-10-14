import { useColor } from '@/hooks/useColor';
import { Tabs } from 'expo-router';
import { BarChart3, ListOrdered, MoreHorizontal, PlusCircle } from 'lucide-react-native';
import React from 'react';

export default function AppTabsLayout() {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const card = useColor('card');
  const border = useColor('border');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: primary,
        tabBarInactiveTintColor: muted,
        tabBarStyle: {
          backgroundColor: card,
          borderTopColor: border,
        },
        tabBarLabelStyle: { fontFamily: 'Tajawal-Bold', fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name='board'
        options={{
          title: 'الطلبات',
          tabBarIcon: ({ color, size }) => <ListOrdered color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name='new'
        options={{
          title: 'طلب جديد',
          tabBarIcon: ({ color, size }) => <PlusCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name='reports'
        options={{
          title: 'التقارير',
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name='settings'
        options={{
          title: 'المزيد',
          tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} />,
        }}
      />

      {/* Reached from the board and the more screen, not tab bar entries. */}
      <Tabs.Screen name='order/[id]' options={{ href: null }} />
      <Tabs.Screen name='shift' options={{ href: null }} />
    </Tabs>
  );
}
