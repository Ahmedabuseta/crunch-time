import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { CornerDownLeft } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

/**
 * A horizontal row of ready-made questions.
 *
 * It never wraps on purpose: the rail above the composer is always on screen,
 * so a wrapping list would grow with every suggestion and keep pushing the
 * transcript away. Everything is one tap to send.
 */
function AskRailBase({
  items,
  onAsk,
  label,
  disabled = false,
  edgePadding = 0,
}: {
  items: readonly string[];
  onAsk: (question: string) => void;
  label?: string;
  disabled?: boolean;
  /** Horizontal inset for a rail that sits outside the list's own padding. */
  edgePadding?: number;
}) {
  const card = useColor('card');
  const border = useColor('border');
  const foreground = useColor('text');
  const muted = useColor('mutedForeground');

  if (items.length === 0) return null;

  return (
    <View style={styles.rail}>
      {label ? (
        <Text
          variant='caption'
          style={{ color: muted, paddingHorizontal: edgePadding || 16 }}
        >
          {label}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={[styles.content, { paddingHorizontal: edgePadding }]}
      >
        {items.map((question) => (
          <Pressable
            key={question}
            onPress={() => onAsk(question)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: card,
                borderColor: border,
                opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
              },
            ]}
            accessibilityRole='button'
            accessibilityLabel={question}
          >
            <CornerDownLeft size={13} color={muted} />
            <Text
              variant='caption'
              numberOfLines={1}
              style={[styles.text, { color: foreground }]}
            >
              {question}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Memoised: the screen re-renders on every streamed flush, and a settled rail
 * has nothing left to lay out.
 */
export const AskRail = React.memo(AskRailBase);

const styles = StyleSheet.create({
  rail: { gap: 8 },
  content: { gap: 8, paddingVertical: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: 300,
  },
  text: { fontSize: 13 },
});
