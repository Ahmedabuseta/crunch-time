import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { layoutOrbits, type OrbitSlot } from '@/lib/orbitLayout';
import { BUTTON_WIDTH } from '@/lib/tabBarLayout';
import { BLUR_INTENSITY, BLUR_REDUCTION, TAB_BAR_GAP, TAB_BAR_HEIGHT } from '@/theme/globals';
import { BlurView } from 'expo-blur';
import { X, Zap, type LucideProps } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  type SharedValue,
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
const ITEM = 50;
const COLUMN = 74;

/** The Android blur samples a screen rather than the window, so the button
 * needs the same target the tab bar uses. */
type BlurTarget = { current: View | null };

/**
 * The app's quick-action dial. Its button is docked in the free space in the
 * middle of the tab bar, and the entries fan out above it on one or more
 * concentric, symmetric arcs over a blurred scrim.
 */
export function ArcActionFab({
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

  const primary = useColor('primary');
  const yellow = useColor('yellow');
  const border = useColor('border');
  const foreground = useColor('foreground');
  const scheme = useColorScheme() ?? 'dark';

  const progress = useSharedValue(0);

  // Docked inside the bar rather than floating above it: the anchor is the
  // button's centre, which is the middle of the bar.
  const centre = TAB_BAR_GAP + insets.bottom + TAB_BAR_HEIGHT / 2;

  const toggle = (next: boolean) => {
    setOpen(next);
    progress.value = withSpring(next ? 1 : 0, { damping: 15, stiffness: 170, mass: 0.7 });
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));

  const icon = (
    <Animated.View style={iconStyle}>
      {open ? <X size={24} color={yellow} /> : <Zap size={24} color={yellow} />}
    </Animated.View>
  );

  const slots = open ? layoutOrbits(actions.length, ITEM + 16) : [];

  return (
    <>
      {open ? (
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
            style={[StyleSheet.absoluteFill, styles.scrim]}
          />
        </Pressable>
      ) : null}

      {/* A zero-size anchor at the button's centre; entries are placed around it. */}
      <View
        style={[styles.anchor, { bottom: centre, left: '50%' }]}
        pointerEvents='box-none'
      >
        {slots.map((slot) => (
          <ArcEntry
            key={actions[slot.order].key}
            action={actions[slot.order]}
            order={slot.order}
            total={actions.length}
            slot={slot}
            progress={progress}
            borderColor={border}
            tint={primary}
            textColor={foreground}
            blurTarget={blurTarget}
            onPress={() => {
              toggle(false);
              actions[slot.order].onPress();
            }}
          />
        ))}

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

/** One entry on the dial — its own component so its hooks are legal. */
function ArcEntry({
  action,
  order,
  total,
  slot,
  progress,
  borderColor,
  tint,
  textColor,
  blurTarget,
  onPress,
}: {
  action: FabAction;
  order: number;
  total: number;
  slot: OrbitSlot;
  progress: SharedValue<number>;
  borderColor: string;
  tint: string;
  textColor: string;
  blurTarget?: BlurTarget;
  onPress: () => void;
}) {
  const animated = useAnimatedStyle(() => {
    // Inner ring first, then outwards, so the dial grows from the button.
    const start = (order / Math.max(total, 1)) * 0.4 + slot.ring * 0.08;
    const local = Math.min(1, Math.max(0, (progress.value - start) / 0.55));
    return {
      opacity: local,
      // Flies out of the button: at rest it sits on the anchor, then travels.
      transform: [
        { translateX: -slot.x * (1 - local) },
        { translateY: -slot.y * (1 - local) },
        { scale: 0.5 + local * 0.5 },
      ],
    };
  });

  const Icon = action.icon;

  return (
    <Animated.View
      style={[styles.column, { left: slot.x - COLUMN / 2, top: slot.y - ITEM / 2 }, animated]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={action.label}
        style={[styles.item, { borderColor }]}
      >
        <BlurView
          intensity={BLUR_INTENSITY}
          tint='default'
          blurMethod='dimezisBlurView'
          blurReductionFactor={BLUR_REDUCTION}
          blurTarget={blurTarget}
          style={StyleSheet.absoluteFill}
        />
        <Icon size={20} color={tint} />
      </Pressable>
      <Text style={{ color: textColor, fontSize: 11, fontWeight: '700', textAlign: 'center' }} numberOfLines={1}>
        {action.label}
      </Text>
    </Animated.View>
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
  scrim: { backgroundColor: 'rgba(0,0,0,0.4)' },
  anchor: { position: 'absolute', width: 0, height: 0 },
  column: { position: 'absolute', width: COLUMN, alignItems: 'center', gap: 4 },
  item: {
    width: ITEM,
    height: ITEM,
    borderRadius: ITEM / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
});
