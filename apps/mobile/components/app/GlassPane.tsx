import { useColorScheme } from '@/hooks/useColorScheme';
import { BLUR_INTENSITY, BLUR_REDUCTION } from '@/theme/globals';
import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type BlurTarget = { current: View | null };

/**
 * A frosted-glass surface: a bordered, rounded container with a `BlurView`
 * fill, matching the tab bar and the dial.
 *
 * Android samples a `BlurTargetView` snapshot rather than the window, so the
 * caller passes the target of the content that should show through. Omit it and
 * the blur degrades to a plain translucent tint — never an error.
 */
export function GlassPane({
  blurTarget,
  borderColor,
  style,
  children,
}: {
  blurTarget?: BlurTarget;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scheme = useColorScheme();

  return (
    <View style={[styles.pane, borderColor ? { borderColor } : null, style]}>
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        blurMethod='dimezisBlurView'
        blurReductionFactor={BLUR_REDUCTION}
        blurTarget={blurTarget}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
});
