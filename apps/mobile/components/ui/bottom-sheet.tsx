import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight'; // Make sure this path is correct
import { useColor } from '@/hooks/useColor';
import { BORDER_RADIUS } from '@/theme/globals';
import { X } from 'lucide-react-native';
import React, { useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  TouchableWithoutFeedback,
  useWindowDimensions,
  ViewStyle,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type BottomSheetContentProps = {
  children: React.ReactNode;
  title?: string;
  style?: ViewStyle;
  rBottomSheetStyle: any;
  cardColor: string;
  mutedColor: string;
  screenHeight: number;
  /**
   * How much of the sheet is actually on screen.
   *
   * The sheet used to be a full screen tall and merely translated up, so the
   * ScrollView's viewport was taller than the visible area: the last row could
   * sit below the screen edge and the scroll range never matched what the owner
   * could see.
   *
   * Assumes a single snap point. A sheet with several would need this to follow
   * the *current* one, which means an animated height rather than a constant.
   */
  sheetHeight: number;
  /** The drag gesture lives on the handle only, so the content can scroll. */
  gesture?: any;
  /** Closes with the sheet animation; also wired to the hardware back button. */
  onClose?: () => void;
  onHandlePress?: () => void;
};

// Component for the bottom sheet content
// It now includes a ScrollView by default for better form handling.
const BottomSheetContent = ({
  children,
  title,
  style,
  rBottomSheetStyle,
  cardColor,
  mutedColor,
  screenHeight,
  sheetHeight,
  gesture,
  onClose,
  onHandlePress,
}: BottomSheetContentProps) => {
  const insets = useSafeAreaInsets();
  const danger = useColor('red');

  const handle = (
    <View
      style={{
        width: '100%',
        paddingVertical: 12,
        alignItems: 'center',
      }}
    >
      <TouchableWithoutFeedback onPress={onHandlePress}>
        <View
          style={{
            width: 64,
            height: 6,
            backgroundColor: mutedColor,
            borderRadius: 999,
          }}
        />
      </TouchableWithoutFeedback>
    </View>
  );

  return (
    <Animated.View
      style={[
        {
          height: sheetHeight,
          width: '100%',
          position: 'absolute',
          top: screenHeight,
          backgroundColor: cardColor,
          borderTopLeftRadius: BORDER_RADIUS,
          borderTopRightRadius: BORDER_RADIUS,
          direction: 'rtl',
        },
        rBottomSheetStyle,
        style,
      ]}
    >
      {/* Handle — the only place the sheet is dragged from. */}
      {gesture ? <GestureDetector gesture={gesture}>{handle}</GestureDetector> : handle}

      {/* Title row: the close button sits on the left, the title stays centred. */}
      {(title || onClose) && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View style={{ width: 36 }} />
          <Text variant='title' style={{ flex: 1, textAlign: 'center' }}>
            {title ?? ''}
          </Text>
          {onClose ? (
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{ padding: 8 }}
              accessibilityRole='button'
              accessibilityLabel='إغلاق'
            >
              <X size={20} color={danger} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>
      )}

      {/* Content now wrapped in a ScrollView */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
        keyboardShouldPersistTaps='handled'
        // Android needs this when a scroll view sits inside a transformed
        // container, or flings are dropped.
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
};

type BottomSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
  enableBackdropDismiss?: boolean;
  title?: string;
  style?: ViewStyle;
  disablePanGesture?: boolean;
};

export function BottomSheet({
  isVisible,
  onClose,
  children,
  snapPoints = [0.3, 0.6, 0.9],
  enableBackdropDismiss = true,
  title,
  style,
  disablePanGesture = false,
}: BottomSheetProps) {
  const cardColor = useColor('card');
  const mutedColor = useColor('muted');
  const { keyboardHeight, isKeyboardVisible } = useKeyboardHeight();
  const { height: screenHeight } = useWindowDimensions();
  const maxTranslateY = -screenHeight + 50;

  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });
  const opacity = useSharedValue(0);
  const currentSnapIndex = useSharedValue(0);
  // Shared value to hold keyboard height for use in worklets
  const keyboardHeightSV = useSharedValue(0);

  const snapPointsHeights = snapPoints.map((point) => -screenHeight * point);
  const defaultHeight = snapPointsHeights[0];

  const [modalVisible, setModalVisible] = React.useState(false);

  // Effect to handle opening and closing the bottom sheet
  useEffect(() => {
    if (isVisible) {
      setModalVisible(true);
      translateY.value = withSpring(defaultHeight, {
        damping: 50,
        stiffness: 400,
      });
      opacity.value = withTiming(1, { duration: 300 });
      currentSnapIndex.value = 0;
    } else {
      translateY.value = withSpring(0, { damping: 50, stiffness: 400 });
      opacity.value = withTiming(0, { duration: 300 }, (finished) => {
        if (finished) {
          runOnJS(setModalVisible)(false);
        }
      });
    }
  }, [isVisible, defaultHeight]);

  // Function to animate the sheet to a specific destination
  const scrollTo = (destination: number) => {
    'worklet';
    translateY.value = withSpring(destination, { damping: 50, stiffness: 400 });
  };

  // --- START: NEW KEYBOARD HANDLING LOGIC ---
  useEffect(() => {
    // Update the shared value whenever keyboardHeight changes
    keyboardHeightSV.value = keyboardHeight;

    // Only adjust position if the sheet is currently visible
    if (isVisible) {
      const currentSnapHeight = snapPointsHeights[currentSnapIndex.value];
      let destination: number;

      if (isKeyboardVisible) {
        // Keyboard is open, move sheet up by keyboard height
        destination = currentSnapHeight - keyboardHeight;
      } else {
        // Keyboard is closed, return to original snap point
        destination = currentSnapHeight;
      }
      scrollTo(destination);
    }
  }, [keyboardHeight, isKeyboardVisible, isVisible]);
  // --- END: NEW KEYBOARD HANDLING LOGIC ---

  const findClosestSnapPoint = (currentY: number) => {
    'worklet';
    // Adjust the currentY by the keyboard height to find the original snap point
    const adjustedY = currentY + keyboardHeightSV.value;

    let closest = snapPointsHeights[0];
    let minDistance = Math.abs(adjustedY - closest);
    let closestIndex = 0;

    for (let i = 0; i < snapPointsHeights.length; i++) {
      const snapPoint = snapPointsHeights[i];
      const distance = Math.abs(adjustedY - snapPoint);
      if (distance < minDistance) {
        minDistance = distance;
        closest = snapPoint;
        closestIndex = i;
      }
    }
    currentSnapIndex.value = closestIndex;
    return closest;
  };

  const handlePress = () => {
    const nextIndex = (currentSnapIndex.value + 1) % snapPointsHeights.length;
    currentSnapIndex.value = nextIndex;
    const destination = snapPointsHeights[nextIndex] - keyboardHeightSV.value;
    scrollTo(destination);
  };

  const animateClose = () => {
    'worklet';
    translateY.value = withSpring(0, { damping: 50, stiffness: 400 });
    opacity.value = withTiming(0, { duration: 300 }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
  };

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const newY = context.value.y + event.translationY;
      if (newY <= 0 && newY >= maxTranslateY) {
        translateY.value = newY;
      }
    })
    .onEnd((event) => {
      const currentY = translateY.value;
      const velocity = event.velocityY;

      if (velocity > 500 && currentY > -screenHeight * 0.2) {
        animateClose();
        return;
      }

      // Find the closest original snap point
      const closestSnapPoint = findClosestSnapPoint(currentY);
      // Calculate the final destination, accounting for the keyboard height
      const finalDestination = closestSnapPoint - keyboardHeightSV.value;
      scrollTo(finalDestination);
    });

  const rBottomSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const rBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const handleBackdropPress = () => {
    if (enableBackdropDismiss) {
      animateClose();
    }
  };

  return (
    <Modal
      visible={modalVisible}
      transparent
      statusBarTranslucent
      animationType='none'
      // Android hardware back: close the sheet instead of doing nothing.
      onRequestClose={animateClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[
            { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)' },
            rBackdropStyle,
          ]}
          accessibilityViewIsModal
        >
          <TouchableWithoutFeedback onPress={handleBackdropPress}>
            <Animated.View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>

          <BottomSheetContent
            children={children}
            title={title}
            style={style}
            rBottomSheetStyle={rBottomSheetStyle}
            cardColor={cardColor}
            mutedColor={mutedColor}
            screenHeight={screenHeight}
            sheetHeight={-defaultHeight}
            gesture={disablePanGesture ? undefined : gesture}
            onClose={animateClose}
            onHandlePress={() => runOnJS(handlePress)()}
          />
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// Hook for managing bottom sheet state
export function useBottomSheet() {
  const [isVisible, setIsVisible] = React.useState(false);

  const open = React.useCallback(() => {
    setIsVisible(true);
  }, []);

  const close = React.useCallback(() => {
    setIsVisible(false);
  }, []);

  const toggle = React.useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  return {
    isVisible,
    open,
    close,
    toggle,
  };
}
