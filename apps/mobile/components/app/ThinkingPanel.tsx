// The live thinking line.
//
// Why one collapsed row rather than a block: reasoning is long, arrives fast,
// and is read once. Reserving height for it would push the answer off screen on
// a phone, so it sits in a single line that the owner can open when they want to
// see *why* an answer is coming. It folds itself shut the moment the answer
// starts, which is when the reasoning stops being the interesting part.
//
// Collapsed it is 30px; with no reasoning text at all it renders nothing, so a
// provider that hides its reasoning costs the screen no space.
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { FONT_FAMILY } from '@/lib/fonts';
import { useColor } from '@/hooks/useColor';
import { withOpacity } from '@/theme/colors';
import { ChevronDown, Sparkles } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Keep the newest reasoning visible: that is the part being decided now. */
const TAIL_CHARS = 420;
/** Tall enough for four lines of Arabic at a phone's default size. */
const EXPANDED_MAX_HEIGHT = 120;

function ThinkingPanelBase({
  text,
  open: expanded,
  onToggle,
  active,
}: {
  /** The reasoning so far. Empty while the model has not started thinking. */
  text: string;
  open: boolean;
  onToggle: () => void;
  /** True while the model is still producing reasoning. */
  active: boolean;
}) {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const card = useColor('card');
  const border = useColor('border');

  // A slow pulse, matching the composer's recording dot: it signals "live"
  // without animating any text, which would be expensive and hard to read.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!active) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1
    );
  }, [active, pulse]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!text.trim()) return null;

  // Collapsed shows the latest thought; the whole tail is one tap away.
  const preview = text.trim().split('\n').filter(Boolean).slice(-1)[0] ?? '';
  const body = text.length > TAIL_CHARS ? text.slice(-TAIL_CHARS) : text;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole='button'
      accessibilityLabel={expanded ? 'اخفاء التفكير' : 'اعرض التفكير'}
      accessibilityState={{ expanded }}
      style={[
        styles.panel,
        {
          backgroundColor: withOpacity(card, 0.3),
          borderColor: withOpacity(border, 0.6),
        },
      ]}
    >
      <View style={styles.head}>
        <Animated.View style={[styles.dot, { backgroundColor: primary }, dotStyle]} />
        <Text
          variant='caption'
          numberOfLines={1}
          style={[styles.preview, { color: expanded ? primary : muted }]}
        >
          {expanded ? (active ? 'بيفكر…' : 'فكّر') : preview || 'بيفكر…'}
        </Text>
        <Animated.View
          style={{
            transform: [{ rotate: expanded ? '180deg' : '0deg' }],
          }}
        >
          <ChevronDown size={14} color={muted} />
        </Animated.View>
      </View>

      {expanded ? (
        <ScrollView
          style={styles.body}
          // The panel itself must not fight the transcript for the gesture:
          // overscroll is off and the list keeps the vertical drag at its edge.
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.thought, { color: muted }]}>{body}</Text>
        </ScrollView>
      ) : null}
    </Pressable>
  );
}

/**
 * Memoised for the same reason as `ChatBubble`: the screen re-renders on every
 * streamed flush, and this must only re-render when its own text changes.
 */
export const ThinkingPanel = React.memo(ThinkingPanelBase);

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    alignSelf: 'stretch',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  // `ui/Text` undoes React Native's RTL mirroring of textAlign.
  preview: { flex: 1, textAlign: 'right', writingDirection: 'rtl' },
  body: { maxHeight: EXPANDED_MAX_HEIGHT },
  // Reasoning is the model's own voice, not the product's: monospace would fall
  // back to a Latin face for Arabic, so it uses the app face at a smaller size.
  thought: {
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontFamily: FONT_FAMILY.regular,
  },
});
