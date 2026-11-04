import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useEffect, useRef } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type Props = { offset?: number; duration?: number };

export const AvoidKeyboard = ({ offset = 0, duration = 0 }: Props) => {
  const { keyboardHeight, isKeyboardVisible, keyboardAnimationDuration } =
    useKeyboardHeight();

  /**
   * Whether the OS already made room for the keyboard is measurable, not a
   * platform guess: compare the window height before the keyboard with the
   * height while it is up. `adjustResize`/edge-to-edge builds absorb most of
   * the keyboard height (no spacer, or the composer lifts twice); a window that
   * keeps its height — iOS, and Android with a panning or non-resizing window —
   * needs the spacer.
   */
  const { height: windowHeight } = useWindowDimensions();
  const baselineHeight = useRef(windowHeight);

  useEffect(() => {
    if (!isKeyboardVisible) baselineHeight.current = windowHeight;
  }, [isKeyboardVisible, windowHeight]);

  const shrink = Math.max(0, baselineHeight.current - windowHeight);
  const resizedByKeyboard = keyboardHeight > 0 ? shrink / keyboardHeight : 0;
  const needsSpacer =
    Platform.OS === 'ios' || (isKeyboardVisible && resizedByKeyboard < 0.6);
  const reduceMotion = useReducedMotion();

  // Shared value for the keyboard padding animation
  const keyboardValue = useSharedValue(0);

  // Update the shared value when keyboard height changes
  useEffect(() => {
    // Only add offset when keyboard is visible
    const targetHeight = isKeyboardVisible && needsSpacer ? keyboardHeight + offset : 0;

    if (reduceMotion) {
      keyboardValue.value = targetHeight;
      return;
    }

    // Use different easing for show vs hide to match native behavior
    const easing = isKeyboardVisible
      ? Easing.out(Easing.quad) // Smooth out for keyboard show
      : Easing.in(Easing.quad); // Smooth in for keyboard hide

    keyboardValue.value = withTiming(targetHeight, {
      duration: keyboardAnimationDuration + duration,
      easing,
    });
  }, [
    keyboardHeight,
    keyboardAnimationDuration,
    isKeyboardVisible,
    needsSpacer,
    offset,
    duration,
    reduceMotion,
  ]);

  // Animated style
  const keyboardMargin = useAnimatedStyle(() => {
    return {
      height: keyboardValue.value,
    };
  });

  return <Animated.View style={keyboardMargin} />;
};
