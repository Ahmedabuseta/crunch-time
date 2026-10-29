import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import type { ChatMessage } from '@/api/types';
import { useColor } from '@/hooks/useColor';
import { BORDER_RADIUS } from '@/theme/globals';
import React from 'react';
import { StyleSheet } from 'react-native';

/** Why the server refused a turn. An unknown code falls through as itself. */
const BLOCKED_LABELS: Record<string, string> = {
  off_topic: 'خارج نطاق المساعد',
  budget: 'الحد اليومي للاستخدام خلص',
};

/**
 * One line of the transcript. The owner's lines are a plain gold bubble; the
 * assistant's sit on a card, which is also what the report and table cards are
 * drawn on, so an answer and its evidence read as one block.
 */
function ChatBubbleBase({
  message,
}: {
  /** The in-flight partial has no id yet, so only what is drawn is required. */
  message: Pick<ChatMessage, 'role' | 'content' | 'blocked'>;
}) {
  const primary = useColor('primary');
  const primaryForeground = useColor('primaryForeground');
  const foreground = useColor('foreground');
  const muted = useColor('mutedForeground');

  const isUser = message.role === 'user';
  const blocked = message.blocked ? (BLOCKED_LABELS[message.blocked] ?? message.blocked) : null;

  // An assistant turn that produced only cards has no prose to show.
  if (!message.content.trim() && !blocked) return null;

  if (isUser) {
    return (
      <View style={[styles.bubble, styles.own, { backgroundColor: primary }]}>
        <Text style={[styles.text, { color: primaryForeground }]}>{message.content}</Text>
      </View>
    );
  }

  return (
    <Card style={{ ...styles.bubble, ...styles.other }}>
      {message.content.trim() ? (
        <Text style={[styles.text, { color: foreground }]}>{message.content}</Text>
      ) : null}
      {blocked ? (
        <Badge variant='secondary' style={styles.badge} textStyle={{ color: muted, fontSize: 12 }}>
          {blocked}
        </Badge>
      ) : null}
    </Card>
  );
}

/**
 * Memoised: the assistant screen re-renders on every streamed flush, and a
 * settled bubble never changes — so it should not be laid out again.
 */
export const ChatBubble = React.memo(ChatBubbleBase);

const styles = StyleSheet.create({
  /**
   * The app runs RTL (see app/_layout.tsx), so `flex-start` is the right edge
   * and `flex-end` the left one: the owner's own lines sit right, the
   * assistant's left.
   */
  bubble: {
    maxWidth: '88%',
    borderRadius: BORDER_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  own: { alignSelf: 'flex-start' },
  // `Card` sets width: '100%'; the max width above is what keeps it a bubble.
  other: { alignSelf: 'flex-end' },
  text: { textAlign: 'right', writingDirection: 'rtl' },
  badge: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10 },
});
