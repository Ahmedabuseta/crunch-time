import { useColor } from '@/hooks/useColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { GlobalActions } from '@/components/app/GlobalActions';
import { TAB_BAR_GAP, TAB_BAR_HEIGHT } from '@/theme/globals';
import { BlurTargetView, BlurView } from 'expo-blur';
import { Tabs, useIsFocused } from 'expo-router';
import { BarChart3, ListOrdered, MoreHorizontal, PlusCircle } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AppTabsLayout() {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const scheme = useColorScheme() ?? 'dark';
  const insets = useSafeAreaInsets();
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
            intensity={90}
            tint={isDark ? 'dark' : 'light'}
            // Plain dimezisBlurView, not the Sdk31Plus variant: that one renders
            // NO blur below Android 12, which is why the bar looked like a flat
            // translucent panel rather than frosted glass.
            blurMethod='dimezisBlurView'
            // Divides the Android blur strength; the default 4 reads much
            // weaker than iOS at the same intensity.
            blurReductionFactor={2}
            // What the bar samples on Android. Ignored on iOS/web.
            blurTarget={blurTarget}
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
      <Tabs.Screen name='manage' options={{ href: null }} />
    </Tabs>

      {/* One quick-action dial for the whole app; it hides itself on the
          screens whose own buttons live in the same corner. */}
      <GlobalActions />
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
