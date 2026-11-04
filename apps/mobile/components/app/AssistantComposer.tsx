// The assistant's composer, on its own.
//
// The screen owns the draft and the turn; this component owns everything about
// typing: the glass field, the grow-up-to-a-cap behaviour, the clear button, the
// counter near the limit, push-to-talk state and the send/stop swap.
//
// Extensibility is deliberate: `leading`, `trailing` and `footer` are slots, and
// `inputProps` is the escape hatch for any TextInput prop this build has not
// needed yet. Adding attachments or slash commands later is a screen change,
// not a rewrite of the composer.
import { GlassPane } from '@/components/app/GlassPane';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useHaptics, type HapticIntent } from '@/hooks/useHaptics';
import { withOpacity } from '@/theme/colors';
import { AlertTriangle, ArrowUp, Mic, Square, X } from 'lucide-react-native';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  I18nManager,
  PixelRatio,
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** One line plus the field's padding; the field never starts taller than this. */
const MIN_INPUT_HEIGHT = 40;
/** Five lines: past this the field scrolls instead of eating the transcript. */
const MAX_INPUT_HEIGHT = 5 * 22 + 18;
const DEFAULT_MAX_LENGTH = 2000;

export interface ComposerVoiceState {
  recording: boolean;
  transcribing: boolean;
  /** Whole seconds of the current recording. */
  seconds: number;
  error?: string | null;
  onStart: () => void;
  onStop: () => void;
  onClearError?: () => void;
}

export interface AssistantComposerRef {
  focus: () => void;
  blur: () => void;
  clear: () => void;
}

export interface AssistantComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Sends the draft. The screen owns haptics and the empty-string guard. */
  onSubmit: () => void;
  /** Stops the in-flight answer. */
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Voice is data, not a hook: the composer stays testable and reusable. */
  voice?: ComposerVoiceState;
  /** Rendered before the field (right edge in RTL), e.g. an attach button. */
  leading?: React.ReactNode;
  /** Rendered between the field and the voice/send controls. */
  trailing?: React.ReactNode;
  /** Rendered under the composer row, full width. */
  footer?: React.ReactNode;
  maxLength?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Home-indicator inset; the screen zeroes it while the keyboard is up. */
  bottomInset?: number;
  containerStyle?: ViewStyle;
  /** Any TextInput prop this component does not own. */
  inputProps?: Omit<
    TextInputProps,
    | 'style'
    | 'value'
    | 'onChangeText'
    | 'multiline'
    | 'maxLength'
    | 'editable'
    | 'scrollEnabled'
    | 'placeholder'
    | 'placeholderTextColor'
    | 'onContentSizeChange'
    | 'selectionColor'
    | 'cursorColor'
    | 'keyboardAppearance'
    | 'accessibilityLabel'
    | 'accessibilityHint'
    | 'accessibilityState'
  >;
}

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

export const AssistantComposer = forwardRef<AssistantComposerRef, AssistantComposerProps>(
  function AssistantComposer(
    {
      value,
      onChangeText,
      onSubmit,
      onStop,
      streaming,
      disabled = false,
      placeholder = 'اكتب سؤالك لكرنش تايم…',
      voice,
      leading,
      trailing,
      footer,
      maxLength = DEFAULT_MAX_LENGTH,
      minHeight,
      maxHeight,
      bottomInset = 0,
      containerStyle,
      inputProps,
    },
    ref
  ) {
    const scheme = useColorScheme();
    const feedback = useHaptics();
    const inputRef = useRef<TextInput>(null);

    const [focused, setFocused] = useState(false);

    const primary = useColor('primary');
    const primaryForeground = useColor('primaryForeground');
    const card = useColor('card');
    const text = useColor('text');
    const muted = useColor('mutedForeground');
    const border = useColor('border');
    const secondary = useColor('secondary');
    const red = useColor('red');
    const orange = useColor('orange');

    // A number of lines is a visual unit, not a fixed pixel count: on a phone
    // with a larger accessibility font, five lines are taller. Scale the cap
    // with the system font so the field does not clip the text it is showing.
    const fontScale = Math.max(1, PixelRatio.getFontScale());
    const minFieldHeight = minHeight ?? Math.round(MIN_INPUT_HEIGHT * fontScale);
    const maxFieldHeight = maxHeight ?? Math.round(MAX_INPUT_HEIGHT * fontScale);

    const [contentHeight, setContentHeight] = useState(minFieldHeight);

    // A slow pulse while recording: the timer proves it is live, the dot makes
    // it visible at a glance.
    const pulse = useSharedValue(1);
    const recording = Boolean(voice?.recording);
    useEffect(() => {
      if (!recording) {
        pulse.value = 1;
        return;
      }
      pulse.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1
      );
    }, [pulse, recording]);
    const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

    useImperativeHandle(
      ref,
      () => ({
        focus: () => inputRef.current?.focus(),
        blur: () => inputRef.current?.blur(),
        clear: () => onChangeText(''),
      }),
      [onChangeText]
    );

    const editable = !streaming && !disabled;
    const hasDraft = value.trim().length > 0;
    // While recording, the mic button is the submit path: sending a draft that
    // is still being spoken into would interleave two turns. Same while a
    // transcript is still being decoded.
    const canSend = editable && !recording && !voice?.transcribing && hasDraft;
    const showCounter = maxLength > 0 && value.length >= Math.floor(maxLength * 0.8);
    // The slot is separate from the status row: an empty status row would add
    // 20px of nothing above a caller-provided footer.
    const showStatusRow = Boolean(
      voice?.recording || voice?.transcribing || voice?.error || showCounter
    );

    // The field grows itself; this only decides when it starts scrolling.
    const onContentSizeChange = useCallback(
      (event: { nativeEvent: { contentSize: { height: number } } }) => {
        setContentHeight(event.nativeEvent.contentSize.height);
      },
      []
    );

    const clearDraft = useCallback(() => {
      if (!value) return;
      feedback('selection');
      onChangeText('');
      inputRef.current?.focus();
    }, [feedback, onChangeText, value]);

    const borderColor = focused
      ? primary
      : disabled
        ? withOpacity(border, 0.6)
        : border;

    return (
      <View
        style={[
          styles.container,
          { paddingBottom: bottomInset + 10 },
          containerStyle,
        ]}
      >
        <View style={styles.row}>
          {leading}

          <GlassPane
            borderColor={borderColor}
            style={[
              styles.fieldGlass,
              {
                backgroundColor: withOpacity(card, disabled ? 0.24 : 0.35),
                minHeight: minFieldHeight + 8,
              },
            ]}
          >
            <View style={styles.fieldRow}>
              <TextInput
                {...inputProps}
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                placeholder={streaming ? 'استنى الرد…' : placeholder}
                placeholderTextColor={muted}
                multiline
                editable={editable}
                maxLength={maxLength}
                scrollEnabled={contentHeight > maxFieldHeight}
                selectionColor={primary}
                cursorColor={primary}
                keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
                onFocus={(event) => {
                  setFocused(true);
                  inputProps?.onFocus?.(event);
                }}
                onBlur={(event) => {
                  setFocused(false);
                  inputProps?.onBlur?.(event);
                }}
                onContentSizeChange={onContentSizeChange}
                accessibilityLabel='رسالتك لكرنش تايم'
                accessibilityHint='اكتب سؤالك، أو استخدم زر الميكروفون'
                accessibilityState={{ disabled: !editable }}
                style={[
                  styles.input,
                  {
                    color: disabled ? muted : text,
                    minHeight: minFieldHeight,
                    maxHeight: maxFieldHeight,
                    // RN mirrors textAlign under RTL, so `left` is the physical
                    // right edge there. On web, where the RTL flag can be off,
                    // ask for the right edge directly.
                    textAlign: I18nManager.isRTL ? 'left' : 'right',
                  },
                ]}
              />

              {value.length > 0 && editable ? (
                <Pressable
                  onPress={clearDraft}
                  hitSlop={8}
                  style={styles.clear}
                  accessibilityRole='button'
                  accessibilityLabel='امسح النص'
                >
                  <X size={14} color={muted} />
                </Pressable>
              ) : null}
            </View>
          </GlassPane>

          {trailing}

          {/* One action slot, swapped by state: stop the answer, stop the
              recording, wait for the transcript, send the draft, or start
              talking. The old layout showed mic and send side by side and
              spent 56px of the field's width on a button that does nothing. */}
          {streaming ? (
            <ActionButton
              label='وقف الرد'
              backgroundColor={red}
              onPress={onStop}
              haptic='impact-medium'
            >
              <Square size={15} color='#FFFFFF' />
            </ActionButton>
          ) : recording ? (
            <ActionButton
              label='وقف التسجيل'
              backgroundColor={red}
              onPress={() => voice?.onStop()}
              haptic='impact-medium'
            >
              <Square size={14} color='#FFFFFF' />
            </ActionButton>
          ) : voice?.transcribing ? (
            <ActionButton
              label='بحوّل الكلام'
              backgroundColor={secondary}
              loading
              loadingColor={muted}
            />
          ) : hasDraft || !voice ? (
            <ActionButton
              label='إرسال'
              backgroundColor={canSend ? primary : secondary}
              disabled={!canSend}
              onPress={onSubmit}
              glowColor={canSend ? primary : undefined}
            >
              <ArrowUp size={20} color={canSend ? primaryForeground : muted} />
            </ActionButton>
          ) : (
            <ActionButton
              label='اتكلم'
              backgroundColor={secondary}
              disabled={disabled}
              onPress={() => voice?.onStart()}
            >
              <Mic size={18} color={muted} />
            </ActionButton>
          )}
        </View>

        {showStatusRow ? (
          <View style={styles.footer}>
            <View style={styles.status}>
              {voice?.recording ? (
                <>
                  <Animated.View
                    style={[styles.recordingDot, { backgroundColor: red }, dotStyle]}
                  />
                  <Text variant='caption' style={[styles.statusText, { color: red }]}>
                    بيسمع… {formatDuration(voice.seconds)}
                  </Text>
                </>
              ) : voice?.transcribing ? (
                <>
                  <Spinner size='sm' color={muted} />
                  <Text variant='caption' style={[styles.statusText, { color: muted }]}>
                    بحوّل الكلام…
                  </Text>
                </>
              ) : voice?.error ? (
                <>
                  <AlertTriangle size={13} color={red} />
                  <Text
                    variant='caption'
                    style={[styles.statusText, styles.errorText, { color: red }]}
                    numberOfLines={2}
                  >
                    {voice.error}
                  </Text>
                  {voice.onClearError ? (
                    <Pressable
                      onPress={voice.onClearError}
                      hitSlop={8}
                      accessibilityRole='button'
                      accessibilityLabel='قفل تنبيه الصوت'
                    >
                      <X size={13} color={muted} />
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </View>

            {showCounter ? (
              <Text
                variant='caption'
                style={[
                  styles.counter,
                  { color: value.length >= maxLength ? red : orange },
                ]}
              >
                {value.length}/{maxLength}
              </Text>
            ) : null}
          </View>
        ) : null}

        {footer ? <View style={styles.extraFooter}>{footer}</View> : null}
      </View>
    );
  }
);

/**
 * One 46px control. Press scales with a spring and fires a haptic, matching the
 * app's buttons; the primary action also gets a soft glow so the one thing the
 * owner is about to press is the one thing that stands out.
 */
function ActionButton({
  label,
  children,
  onPress,
  disabled = false,
  loading = false,
  backgroundColor,
  loadingColor,
  glowColor,
  haptic = 'impact-light',
}: {
  label: string;
  children?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  backgroundColor: string;
  loadingColor?: string;
  glowColor?: string;
  haptic?: HapticIntent;
}) {
  const feedback = useHaptics();
  const scale = useSharedValue(1);
  const inert = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      onPressIn={() => {
        if (inert) return;
        feedback(haptic);
        scale.value = withSpring(0.9, { damping: 16, stiffness: 420 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 380 });
      }}
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: loading }}
    >
      <Animated.View
        style={[
          styles.action,
          {
            backgroundColor,
            opacity: disabled ? 0.45 : 1,
            ...(glowColor
              ? {
                  shadowColor: glowColor,
                  shadowOpacity: 0.28,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 3,
                }
              : null),
          },
          animatedStyle,
        ]}
      >
        {loading ? <Spinner size='sm' color={loadingColor} /> : children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  fieldGlass: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: MIN_INPUT_HEIGHT,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
    writingDirection: 'rtl',
  },
  clear: {
    padding: 6,
    marginBottom: 4,
    marginLeft: 2,
    borderRadius: 999,
  },
  action: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 6,
    minHeight: 20,
  },
  status: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: { fontSize: 12 },
  errorText: { flexShrink: 1, textAlign: 'right', writingDirection: 'rtl' },
  recordingDot: { width: 7, height: 7, borderRadius: 4 },
  counter: { fontSize: 12 },
  extraFooter: { paddingTop: 6 },
});
