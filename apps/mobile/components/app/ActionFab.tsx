import { Text } from '@/components/ui/text';
import { useColor } from '@/hooks/useColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { TAB_BAR_GAP, TAB_BAR_HEIGHT } from '@/theme/globals';
import { BlurView } from 'expo-blur';
import { Plus, type LucideProps } from 'lucide-react-native';
import React, { useState } from 'react';
import { I18nManager, Platform, Pressable, StyleSheet, View } from 'react-native';
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

const FAB = 58;
const ITEM = 50;
const COLUMN = 72;
// The arc stays inside the quarter above the button: past 90° the far items
// would drop below the button and off the bottom of the screen.
const ARC_DEGREES = 88;

/**
 * Where one dial entry sits, relative to the button's centre. The arc fans out
 * from straight up to the side opposite the button's corner, and the radius is
 * solved from the desired gap so entries never collide however many there are.
 */
function slotOffset(index: number, total: number, isRtl: boolean, gap: number) {
  if (total <= 1) return { x: 0, y: -110 };
  const step = ARC_DEGREES / (total - 1);
  const radians = ((index * step) * Math.PI) / 180;
  const radius = Math.min(260, Math.max(112, gap / (2 * Math.sin(((step * Math.PI) / 180) / 2))));
  return {
    x: (isRtl ? 1 : -1) * Math.sin(radians) * radius,
    y: -Math.cos(radians) * radius,
  };
}

/**
 * A floating button that fans its actions out along an arc, over a blurred
 * scrim. Entries fly out from the button on a stagger, so the menu reads as
 * growing from it.
 */
export function ArcActionFab({
  actions,
  footer,
  label = 'إجراءات سريعة',
}: {
  actions: FabAction[];
  footer?: string;
  label?: string;
}) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const primary = useColor('primary');
  const primaryForeground = useColor('primaryForeground');
  const border = useColor('border');
  const muted = useColor('mutedForeground');
  const foreground = useColor('foreground');
  const scheme = useColorScheme() ?? 'dark';
  const isRtl = Platform.OS !== 'web' && I18nManager.isRTL;

  const progress = useSharedValue(0);
  const lift = TAB_BAR_GAP + insets.bottom + TAB_BAR_HEIGHT + 16;
  // Physical left/right: react-native-web has no logical insets, so the
  // mirrored corner is chosen explicitly.
  const side = isRtl ? { left: 20 } : { right: 20 };

  const toggle = (next: boolean) => {
    setOpen(next);
    progress.value = withSpring(next ? 1 : 0, { damping: 15, stiffness: 170, mass: 0.7 });
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 45}deg` }],
  }));

  const button = (
    <Pressable
      onPress={() => toggle(!open)}
      accessibilityRole='button'
      accessibilityLabel={open ? 'إغلاق' : label}
      style={[styles.fab, { backgroundColor: primary, bottom: lift, ...side }]}
    >
      <Animated.View style={iconStyle}>
        <Plus size={26} color={primaryForeground} />
      </Animated.View>
    </Pressable>
  );

  if (!open) return button;

  const gap = ITEM + 16;
  const offsets = actions.map((_, index) => slotOffset(index, actions.length, isRtl, gap));
  const topMost = Math.min(...offsets.map((offset) => offset.y));
  const anchorSide = isRtl ? { left: 20 + FAB / 2 } : { right: 20 + FAB / 2 };

  return (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => toggle(false)}
        accessibilityRole='button'
        accessibilityLabel='إغلاق'
      >
        <BlurView
          intensity={45}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          blurMethod='dimezisBlurView'
          style={[StyleSheet.absoluteFill, styles.scrim]}
        />
      </Pressable>

      {/* A zero-size anchor on the button's centre; entries are placed around it. */}
      <View
        style={[styles.anchor, { bottom: lift + FAB / 2 }, anchorSide]}
        pointerEvents='box-none'
      >
        {footer ? (
          <Text
            variant='caption'
            style={{
              position: 'absolute',
              width: 220,
              left: -110,
              top: topMost - 32,
              textAlign: 'center',
              color: muted,
            }}
          >
            {footer}
          </Text>
        ) : null}

        {offsets.map((offset, index) => (
          <ArcEntry
            key={actions[index].key}
            action={actions[index]}
            index={index}
            total={actions.length}
            offset={offset}
            progress={progress}
            borderColor={border}
            tint={primary}
            textColor={foreground}
            onPress={() => {
              toggle(false);
              actions[index].onPress();
            }}
          />
        ))}

        <Pressable
          onPress={() => toggle(false)}
          accessibilityRole='button'
          accessibilityLabel='إغلاق'
          style={[styles.fab, { backgroundColor: primary, left: -FAB / 2, top: -FAB / 2 }]}
        >
          <Animated.View style={iconStyle}>
            <Plus size={26} color={primaryForeground} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

/** One entry on the arc — its own component so its hooks are legal. */
function ArcEntry({
  action,
  index,
  total,
  offset,
  progress,
  borderColor,
  tint,
  textColor,
  onPress,
}: {
  action: FabAction;
  index: number;
  total: number;
  offset: { x: number; y: number };
  progress: SharedValue<number>;
  borderColor: string;
  tint: string;
  textColor: string;
  onPress: () => void;
}) {
  const animated = useAnimatedStyle(() => {
    const start = (index / Math.max(total, 1)) * 0.4;
    const local = Math.min(1, Math.max(0, (progress.value - start) / 0.6));
    return {
      opacity: local,
      // Flies out of the button: at rest it sits on the anchor, then travels.
      transform: [
        { translateX: -offset.x * (1 - local) },
        { translateY: -offset.y * (1 - local) },
        { scale: 0.5 + local * 0.5 },
      ],
    };
  });

  const Icon = action.icon;

  return (
    <Animated.View
      style={[
        styles.column,
        { left: offset.x - COLUMN / 2, top: offset.y - ITEM / 2 },
        animated,
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={action.label}
        style={[styles.item, { borderColor }]}
      >
        <BlurView intensity={50} tint='default' blurMethod='dimezisBlurView' style={StyleSheet.absoluteFill} />
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
  },
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
