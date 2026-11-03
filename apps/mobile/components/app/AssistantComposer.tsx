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
import { useHaptics } from '@/hooks/useHaptics';
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
    // While recording, the mic button is the submit path: sending a draft that
    // is still being spoken into would interleave two turns.
    const canSend = editable && !recording && value.trim().length > 0;
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

          {/* Push-to-talk. Hidden while an answer streams: that slot already
              holds stop, and recording mid-answer is not a real intent. */}
          {voice && !streaming ? (
            <Pressable
              onPress={voice.recording ? voice.onStop : voice.onStart}
              disabled={voice.transcribing || disabled}
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor: voice.recording ? red : secondary,
                  opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole='button'
              accessibilityLabel={voice.recording ? 'وقف التسجيل' : 'اتكلم'}
              accessibilityState={{ disabled: voice.transcribing || disabled }}
            >
              {voice.transcribing ? (
                <Spinner size='sm' color={muted} />
              ) : voice.recording ? (
                <Square size={14} color='#FFFFFF' />
              ) : (
                <Mic size={18} color={muted} />
              )}
            </Pressable>
          ) : null}

          {streaming ? (
            <Pressable
              onPress={onStop}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: red, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole='button'
              accessibilityLabel='وقف الرد'
            >
              <Square size={15} color='#FFFFFF' />
            </Pressable>
          ) : (
            <Pressable
              onPress={onSubmit}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.action,
                {
                  backgroundColor: canSend ? primary : secondary,
                  opacity: pressed && canSend ? 0.85 : 1,
                },
              ]}
              accessibilityRole='button'
              accessibilityLabel='إرسال'
              accessibilityState={{ disabled: !canSend }}
            >
              <ArrowUp size={20} color={canSend ? primaryForeground : muted} />
            </Pressable>
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
