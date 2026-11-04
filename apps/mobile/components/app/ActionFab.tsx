import { GlassPane } from '@/components/app/GlassPane';
import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { BUTTON_WIDTH } from '@/lib/tabBarLayout';
import { withOpacity } from '@/theme/colors';
import { BLUR_INTENSITY, BLUR_REDUCTION, TAB_BAR_GAP, TAB_BAR_HEIGHT } from '@/theme/globals';
import { BlurView } from 'expo-blur';
import { X, Zap, type LucideProps } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface FabAction {
  key: string;
  label: string;
  icon: React.ComponentType<LucideProps>;
  onPress: () => void;
}

/** The button's width, shared with the tab bar so its middle gap and its pills
 * are sized to match. */
const FAB = BUTTON_WIDTH;

/** The Android blur samples a screen rather than the window, so the button
 * needs the same target the tab bar uses. */
type BlurTarget = { current: View | null };

/**
 * The app's quick-action menu. Its button is docked in the free space in the
 * middle of the tab bar; opening it shows a compact grid above the button
 * instead of fanning the entries out on arcs.
 */
export function ActionMenuFab({
  actions,
  label = 'إجراءات سريعة',
  blurTarget,
}: {
  actions: FabAction[];
  label?: string;
  blurTarget?: BlurTarget;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const primary = useColor('primary');
  const yellow = useColor('yellow');
  const border = useColor('border');
  const foreground = useColor('foreground');
  const muted = useColor('mutedForeground');
  const scheme = useColorScheme() ?? 'dark';

  const progress = useSharedValue(0);

  // Docked inside the bar rather than floating above it: the anchor is the
  // button's centre, which is the middle of the bar.
  const centre = TAB_BAR_GAP + insets.bottom + TAB_BAR_HEIGHT / 2;
  const menuBottom = centre + FAB / 2 + 14;

  const toggle = (next: boolean) => {
    if (next) setMounted(true);
    setOpen(next);
    progress.value = withSpring(
      next ? 1 : 0,
      { damping: 18, stiffness: 190, mass: 0.7 },
      (finished) => {
        if (finished && !next) runOnJS(setMounted)(false);
      }
    );
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));

  const menuStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 14 },
      { scale: 0.96 + progress.value * 0.04 },
    ],
  }));

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const icon = (
    <Animated.View style={iconStyle}>
      {open ? <X size={24} color={yellow} /> : <Zap size={24} color={yellow} />}
    </Animated.View>
  );

  return (
    <>
      {mounted ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, scrimStyle]}
          pointerEvents={open ? 'auto' : 'none'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => toggle(false)}
            accessibilityRole='button'
            accessibilityLabel='إغلاق'
          >
            <BlurView
              intensity={BLUR_INTENSITY}
              tint={scheme === 'dark' ? 'dark' : 'light'}
              blurMethod='dimezisBlurView'
              blurReductionFactor={BLUR_REDUCTION}
              blurTarget={blurTarget}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, styles.scrim]} />
          </Pressable>
        </Animated.View>
      ) : null}

      {mounted ? (
        <Animated.View
          style={[styles.menuWrap, { bottom: menuBottom }, menuStyle]}
          pointerEvents={open ? 'box-none' : 'none'}
        >
          <GlassPane blurTarget={blurTarget} borderColor={border} style={styles.menu}>
            <View style={styles.menuInner}>
              <View style={styles.menuHeader}>
                <Text style={[styles.menuLabel, { color: muted }]}>{label}</Text>
                <Pressable
                  onPress={() => toggle(false)}
                  hitSlop={10}
                  accessibilityRole='button'
                  accessibilityLabel='إغلاق'
                >
                  <X size={15} color={muted} />
                </Pressable>
              </View>

              <View style={styles.grid}>
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Pressable
                      key={action.key}
                      onPress={() => {
                        toggle(false);
                        action.onPress();
                      }}
                      accessibilityRole='button'
                      accessibilityLabel={action.label}
                      style={({ pressed }) => [
                        styles.tile,
                        {
                          backgroundColor: withOpacity(primary, pressed ? 0.16 : 0.07),
                          borderColor: withOpacity(border, 0.65),
                        },
                      ]}
                    >
                      <Icon size={22} color={primary} />
                      <Text
                        numberOfLines={2}
                        style={[styles.tileLabel, { color: foreground }]}
                      >
                        {action.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </GlassPane>
        </Animated.View>
      ) : null}

      {/* A zero-size anchor at the button's centre; the menu is placed above it. */}
      <View style={[styles.anchor, { bottom: centre, left: '50%' }]} pointerEvents='box-none'>
        <GlassButton
          onPress={() => toggle(!open)}
          label={open ? 'إغلاق' : label}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          borderColor={border}
          blurTarget={blurTarget}
          style={styles.centred}
        >
          {icon}
        </GlassButton>
      </View>
    </>
  );
}

/**
 * The dial button: a transparent blurred-glass disc with a yellow glyph. The
 * yellow lives in the icon, not a fill, so the screen behind still shows
 * through the glass.
 */
function GlassButton({
  onPress,
  label,
  tint,
  borderColor,
  blurTarget,
  style,
  children,
}: {
  onPress: () => void;
  label: string;
  tint: 'dark' | 'light';
  borderColor: string;
  blurTarget?: BlurTarget;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={label}
      style={[styles.fab, { borderColor }, style]}
    >
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={tint}
        blurMethod='dimezisBlurView'
        blurReductionFactor={BLUR_REDUCTION}
        blurTarget={blurTarget}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  /** Centres the button on the zero-size anchor. */
  centred: { left: -FAB / 2, top: -FAB / 2 },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  anchor: { position: 'absolute', width: 0, height: 0 },
  menuWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  menu: { width: '100%' },
  menuInner: { padding: 14, gap: 10 },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  menuLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  tileLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
