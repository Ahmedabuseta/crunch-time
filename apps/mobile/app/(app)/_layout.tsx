import { useColor } from '@/hooks/useColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { TAB_BAR_GAP, TAB_BAR_HEIGHT } from '@/theme/globals';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { BarChart3, ListOrdered, MoreHorizontal, PlusCircle } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AppTabsLayout() {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const scheme = useColorScheme() ?? 'dark';
  const insets = useSafeAreaInsets();
  const isDark = scheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: primary,
        tabBarInactiveTintColor: muted,
        // Floating pill: inset from the edges and lifted clear of the home
        // indicator, with the app showing through a blur behind it.
        tabBarStyle: {
          position: 'absolute',
          left: TAB_BAR_GAP,
          right: TAB_BAR_GAP,
          bottom: TAB_BAR_GAP + insets.bottom,
          height: TAB_BAR_HEIGHT,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 26,
          borderWidth: 1,
          borderColor: border,
          borderTopWidth: 1,
          borderTopColor: border,
          backgroundColor: 'transparent',
          overflow: 'hidden',
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={70}
            tint={isDark ? 'dark' : 'light'}
            blurMethod='dimezisBlurViewSdk31Plus'
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarLabelStyle: { fontFamily: 'Tajawal-Bold', fontSize: 11 },
        tabBarItemStyle: { paddingVertical: 2 },
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
