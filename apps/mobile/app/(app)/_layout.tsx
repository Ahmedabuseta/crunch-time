import { TabBar } from '@/components/app/TabBar';
import { OfflineBanner } from '@/components/app/OfflineBanner';
import { useColorScheme } from '@/hooks/useColorScheme';
import { GlobalActions } from '@/components/app/GlobalActions';
import { BlurTargetView } from 'expo-blur';
import { Tabs, useIsFocused } from 'expo-router';
import { BarChart3, ListOrdered, MoreHorizontal, PlusCircle } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export default function AppTabsLayout() {
  const scheme = useColorScheme() ?? 'dark';
  const isDark = scheme === 'dark';

  // Android blur is driven by a `BlurTargetView` snapshot, not by whatever is
  // physically underneath — so the tab navigator has to be told which screen
  // to sample. Each screen gets its own target (via `screenLayout`) and the
  // focused one publishes its node here; a fresh ref object on change makes
  // `BlurView` re-resolve the target.
  const [blurTargetNode, setBlurTargetNode] = useState<View | null>(null);
  const blurTarget = useMemo(() => ({ current: blurTargetNode }), [blurTargetNode]);
  const publishBlurTarget = useCallback((node: View | null) => setBlurTargetNode(node), []);

  return (
    <>
    <Tabs
      screenLayout={({ children }) => (
        <ScreenBlurTarget onTarget={publishBlurTarget}>{children}</ScreenBlurTarget>
      )}
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} isDark={isDark} blurTarget={blurTarget} />}
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
      <Tabs.Screen name='manage' options={{ href: null }} />
      <Tabs.Screen name='assistant' options={{ href: null }} />
    </Tabs>

      {/* One quick-action dial for the whole app, docked in the bar's middle
          gap; it hides itself on the screens whose own buttons sit there. */}
      <GlobalActions blurTarget={blurTarget} />

      {/* Says "this may be a little behind" whenever the phone is offline. */}
      <OfflineBanner />
    </>
  );
}

/**
 * Wraps a tab screen in the `BlurTargetView` the tab bar's `BlurView` samples.
 * Only the focused screen publishes its node — inactive tabs stay mounted, so
 * without the focus guard their target would win the race on first visit.
 */
function ScreenBlurTarget({
  children,
  onTarget,
}: {
  children: React.ReactNode;
  onTarget: (node: View | null) => void;
}) {
  const ref = useRef<View | null>(null);
  const isFocused = useIsFocused();

  React.useEffect(() => {
    if (isFocused) onTarget(ref.current);
  }, [isFocused, onTarget]);

  return (
    <BlurTargetView ref={ref} style={styles.fill}>
      {children}
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
