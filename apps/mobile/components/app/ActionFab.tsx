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

/**
 * One floating button that spills its actions into an overlay — a speed dial.
 * It sits clear of the floating tab bar, and in RTL it hugs the left edge.
 */
export function ActionFab({ actions, footer }: { actions: FabAction[]; footer?: string }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const primary = useColor('primary');
  const primaryForeground = useColor('primaryForeground');
  const card = useColor('card');
  const border = useColor('border');
  const muted = useColor('mutedForeground');
  const scheme = useColorScheme() ?? 'dark';
  const isRtl = Platform.OS !== 'web' && I18nManager.isRTL;

  const progress = useSharedValue(0);
  const lift = TAB_BAR_GAP + insets.bottom + TAB_BAR_HEIGHT + 14;

  // Physical left/right rather than start/end: react-native-web has no logical
  // inset handling, so the mirrored position is chosen explicitly.
  const fabSide = isRtl ? { left: 20 } : { right: 20 };

  const toggle = (next: boolean) => {
    setOpen(next);
    progress.value = withSpring(next ? 1 : 0, { damping: 16, stiffness: 180, mass: 0.7 });
  };

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 45}deg` }],
  }));

  const button = (
    <Pressable
      onPress={() => toggle(!open)}
      accessibilityRole='button'
      accessibilityLabel={open ? 'إغلاق' : 'إضافة'}
      style={[styles.fab, fabSide, { backgroundColor: primary, bottom: lift }]}
    >
      <Animated.View style={iconStyle}>
        <Plus size={26} color={primaryForeground} />
      </Animated.View>
    </Pressable>
  );

  if (!open) return button;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents='box-none'>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => toggle(false)} accessibilityLabel='إغلاق القائمة'>
        <BlurView
          intensity={40}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          blurMethod='dimezisBlurView'
          style={[StyleSheet.absoluteFill, styles.scrim]}
        />
      </Pressable>

      <View
        style={[styles.stack, { bottom: lift, borderColor: border, backgroundColor: card }]}
        pointerEvents='box-none'
      >
        {footer ? (
          <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingHorizontal: 4 }}>
            {footer}
          </Text>
        ) : null}

        {actions.map((action, index) => (
          <DialAction
            key={action.key}
            action={action}
            index={index}
            total={actions.length}
            progress={progress}
            borderColor={border}
            tint={primary}
            onPress={() => {
              toggle(false);
              action.onPress();
            }}
          />
        ))}
      </View>

      {button}
    </View>
  );
}

/** One dial entry — its own component so the per-item hooks are legal. */
function DialAction({
  action,
  index,
  total,
  progress,
  borderColor,
  tint,
  onPress,
}: {
  action: FabAction;
  index: number;
  total: number;
  progress: SharedValue<number>;
  borderColor: string;
  tint: string;
  onPress: () => void;
}) {
  const animated = useAnimatedStyle(() => {
    // Each entry starts its reveal a little later than the one below it, so the
    // stack grows out of the button rather than appearing all at once.
    const start = (index / Math.max(total, 1)) * 0.45;
    const local = Math.min(1, Math.max(0, (progress.value - start) / 0.55));
    return {
      opacity: local,
      transform: [{ translateY: (1 - local) * 20 }, { scale: 0.94 + local * 0.06 }],
    };
  });

  const Icon = action.icon;

  return (
    <Animated.View style={animated}>
      <Pressable
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={action.label}
        style={[styles.action, { borderColor }]}
      >
        <Text style={{ flex: 1, fontWeight: '700' }}>{action.label}</Text>
        <Icon size={18} color={tint} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: { backgroundColor: 'rgba(0,0,0,0.35)' },
  stack: {
    position: 'absolute',
    left: 16,
    right: 16,
    gap: 8,
    padding: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
});
