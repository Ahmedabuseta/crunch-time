import { useColor } from '@/hooks/useColor';
import { BORDER_RADIUS, CORNERS } from '@/theme/globals';
import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  style?: ViewStyle;
  variant?: 'default' | 'rounded';
}

// SVG gradient ids share one global namespace, so each instance needs its own.
let shimmerId = 0;

/**
 * A loading placeholder: a muted block crossed by a highlight that sweeps left
 * to right. The highlight is an SVG gradient rather than an opacity pulse, so
 * the block reads as actively loading instead of just blinking.
 */
export const Skeleton = React.memo(function Skeleton({
  width = '100%',
  height = 100,
  style,
  variant = 'default',
}: SkeletonProps) {
  const base = useColor('muted');
  const highlight = useColor('foreground');
  const id = useRef(`skeleton-${(shimmerId += 1)}`).current;

  // The gradient has to be a fixed width in pixels, so wait for layout.
  const [measured, setMeasured] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      // Snap back to the start before each sweep, so it always travels one way
      // instead of bouncing.
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [progress]);

  const shimmerStyle = useAnimatedStyle(() => ({
    // −1 block-width → +1 block-width, so the band enters and leaves cleanly.
    transform: [{ translateX: (progress.value * 2 - 1) * measured }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== measured) setMeasured(next);
  };

  return (
    <View
      onLayout={onLayout}
      accessibilityElementsHidden
      accessibilityLabel='Loading content'
      style={[
        {
          width: width as any,
          height,
          backgroundColor: base,
          borderRadius: variant === 'default' ? CORNERS : BORDER_RADIUS,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {measured > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
          <Svg width={measured} height={height}>
            <Defs>
              <LinearGradient id={id} x1='0' y1='0' x2='1' y2='0'>
                <Stop offset='0' stopColor={highlight} stopOpacity={0} />
                <Stop offset='0.5' stopColor={highlight} stopOpacity={0.5} />
                <Stop offset='1' stopColor={highlight} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={measured} height={height} fill={`url(#${id})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
});
