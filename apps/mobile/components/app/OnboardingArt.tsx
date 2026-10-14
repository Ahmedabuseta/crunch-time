import { Image } from 'expo-image';
import type { LucideProps } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/**
 * The onboarding hero: a soft SVG gradient plate (react-native-svg) that springs
 * in and then drifts gently, with the till mark or a tinted icon on top.
 */
export function OnboardingArt({
  id,
  color,
  size = 200,
  icon: Icon,
  logo = false,
}: {
  /** Unique per step — SVG gradient ids share one global namespace. */
  id: string;
  color: string;
  size?: number;
  icon?: React.ComponentType<LucideProps>;
  logo?: boolean;
}) {
  const enter = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 13, stiffness: 110, mass: 0.9 });
    // A slow breathe, so the screen is never completely static.
    drift.value = withDelay(
      260,
      withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      )
    );
  }, [drift, enter]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { scale: 0.86 + enter.value * 0.14 },
      { translateY: (1 - enter.value) * 18 - drift.value * 8 },
    ],
  }));

  const inner = Math.round(size * 0.6);

  return (
    <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`plate-${id}`} cx='50%' cy='42%' r='62%'>
            <Stop offset='0%' stopColor={color} stopOpacity={0.34} />
            <Stop offset='70%' stopColor={color} stopOpacity={0.14} />
            <Stop offset='100%' stopColor={color} stopOpacity={0.03} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#plate-${id})`} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 1}
          fill='none'
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={1}
        />
      </Svg>

      <View style={styles.center}>
        {logo ? (
          <Image
            source={require('../../assets/images/logo.png')}
            style={{ width: inner, height: inner }}
            contentFit='contain'
          />
        ) : Icon ? (
          <Icon color={color} size={inner} />
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
