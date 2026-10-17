import { useColor } from '@/hooks/useColor';
import { FONT_FAMILY } from '@/lib/fonts';
import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/**
 * The app's real splash. The native one is a flat themed colour (it cannot read
 * our stored light/dark choice, follow a theme switch, or animate), so we hide
 * it on the first frame and draw this on top until boot finishes. Background is
 * `background`, so it flows straight into either theme with no flash.
 */
export function AppSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const background = useColor('background');
  const foreground = useColor('foreground');
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');

  const enter = useSharedValue(0);
  const rule = useSharedValue(0);
  const tag = useSharedValue(0);
  const fade = useSharedValue(1);

  // Staged reveal: mark rises in, the rule wipes across, then the tagline.
  useEffect(() => {
    enter.value = withSpring(1, { damping: 15, stiffness: 130, mass: 0.9 });
    rule.value = withDelay(220, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
    tag.value = withDelay(480, withTiming(1, { duration: 460, easing: Easing.out(Easing.quad) }));
  }, [enter, rule, tag]);

  useEffect(() => {
    if (!ready) return;
    fade.value = withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  }, [ready, fade, onDone]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 14 }, { scale: 0.96 + enter.value * 0.04 }],
  }));
  const ruleStyle = useAnimatedStyle(() => ({ opacity: rule.value, transform: [{ scaleX: rule.value }] }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tag.value }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: background }, rootStyle]}
      pointerEvents={ready ? 'none' : 'auto'}
    >
      <Animated.View style={[styles.lockup, wordStyle]}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          contentFit='contain'
        />
        <Text style={styles.word} accessibilityRole='header'>
          <Text style={{ color: primary }}>Crunch</Text>
          <Text style={{ color: foreground }}>{' '}Time</Text>
        </Text>
      </Animated.View>

      <Animated.View style={[styles.rule, { backgroundColor: primary }, ruleStyle]} />

      <Animated.View style={tagStyle}>
        <Text style={[styles.tagline, { color: muted }]}>CREPES · SWEET · JUICE</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    // Above the navigator so it covers whatever route the gate lands on.
    zIndex: 100,
  },
  word: {
    fontFamily: FONT_FAMILY.display,
    fontSize: 38,
    letterSpacing: -1.5,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  lockup: { alignItems: 'center', gap: 18 },
  logo: { width: 132, height: 132 },
  rule: {
    width: 72,
    height: 3,
    borderRadius: 999,
    marginTop: 18,
  },
  tagline: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    letterSpacing: 3.5,
    marginTop: 16,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
});
