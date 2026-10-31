import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import {
  tabBarMetrics,
  splitTabGroups,
  isHiddenFromBar,
  BUTTON_WIDTH,
  MAX_DESTINATIONS,
} from '@/lib/tabBarLayout';
import { BLUR_INTENSITY, BLUR_REDUCTION, TAB_BAR_GAP, TAB_BAR_HEIGHT } from '@/theme/globals';
import { BlurView } from 'expo-blur';
import type { Tabs } from 'expo-router';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** The navigator hands these to whatever `tabBar` renders. Taken from `Tabs`
 * itself rather than from @react-navigation/bottom-tabs, which is not a
 * resolvable dependency of this app. */
type TabBarRenderProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

export interface TabBarProps extends TabBarRenderProps {
  isDark: boolean;
  blurTarget?: { current: View | null };
}

const PILL_RADIUS = 24;
/** Matches the button, so neither the pills nor the button stands proud of the
 * other and the three read as one strip. */
const PILL_HEIGHT = BUTTON_WIDTH;

/**
 * The tab bar as two separate pills with a deliberate gap between them, rather
 * than one strip divided by a rule. The quick-action button docks in that gap,
 * so the bar reads as group · button · group.
 *
 * Written by hand because the stock bar can only draw one background: two
 * pills need two blurred surfaces.
 */
export function TabBar({ state, descriptors, navigation, isDark, blurTarget }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');

  // Sized from the real screen: clear of notches in landscape, centred rather
  // than stretched on a tablet, and dense enough to stay on one line on a
  // narrow phone. The maths lives in lib/ so it can be tested per screen size.
  const { barWidth, barLeft, gap, iconSize, labelSize } = tabBarMetrics(
    width,
    insets.left,
    insets.right,
    TAB_BAR_GAP
  );

  // Only the configured destinations: detail pages and forms are declared with
  // `href: null` and must not take up a slot in the bar.
  const tabs = state.routes.filter((route) => !isHiddenFromBar(descriptors[route.key].options));
  const split = splitTabGroups(tabs.length);
  const groups: (typeof tabs)[] = [];
  let cursor = 0;
  for (const size of split) {
    groups.push(tabs.slice(cursor, cursor + size));
    cursor += size;
  }
  const focusedKey = state.routes[state.index]?.key;

  // The bar holds four destinations; the fifth slot in the middle is the dial
  // button. Past that it still lays out, but a tab loses its label — a cramped
  // bar beats a screen nobody can reach, so this warns instead of hiding.
  if (__DEV__ && tabs.length > MAX_DESTINATIONS) {
    console.warn(
      `[TabBar] ${tabs.length} destinations, but the bar holds ${MAX_DESTINATIONS}. ` +
        'Move the extra behind the dial or behind المزيد.'
    );
  }

  const renderTab = (route: (typeof tabs)[number]) => {
    const options = descriptors[route.key].options;
    const focused = route.key === focusedKey;
    const color = focused ? primary : muted;
    const label = typeof options.title === 'string' ? options.title : route.name;

    return (
      <Pressable
        key={route.key}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event?.defaultPrevented) navigation.navigate(route.name);
        }}
        accessibilityRole='button'
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={label}
        style={styles.tab}
      >
        {options.tabBarIcon?.({ focused, color, size: iconSize })}
        <Text style={[styles.label, { color, fontSize: labelSize }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[styles.bar, { bottom: TAB_BAR_GAP + insets.bottom, left: barLeft, width: barWidth }]}
      pointerEvents='box-none'
    >
      <View style={styles.groups} pointerEvents='box-none'>
        {groups.map((group, index) => (
          <React.Fragment key={index}>
            {index > 0 ? <View style={{ width: gap }} /> : null}
            <Pill isDark={isDark} borderColor={border} blurTarget={blurTarget}>
              {group.map(renderTab)}
            </Pill>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/** One blurred, rounded group of tabs. */
function Pill({
  isDark,
  borderColor,
  blurTarget,
  children,
  style,
}: {
  isDark: boolean;
  borderColor: string;
  blurTarget?: { current: View | null };
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pill, { borderColor }, style]}>
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={isDark ? 'dark' : 'light'}
        // Plain dimezisBlurView, not the Sdk31Plus variant: that one renders
        // NO blur below Android 12, which is why the bar looked like a flat
        // translucent panel rather than frosted glass.
        blurMethod='dimezisBlurView'
        blurReductionFactor={BLUR_REDUCTION}
        // What the pill samples on Android. Ignored on iOS/web.
        blurTarget={blurTarget}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    height: TAB_BAR_HEIGHT,
    justifyContent: 'center',
  },
  groups: { flexDirection: 'row', direction: 'rtl', alignItems: 'center' },
  pill: {
    flex: 1,
    height: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tab: { flexShrink: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 4 },
  label: { fontFamily: 'Tajawal-Bold', textAlign: 'center' },
});
