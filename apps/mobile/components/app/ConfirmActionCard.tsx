import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import type { ActionChatCard } from '@/api/types';
import { useColor } from '@/hooks/useColor';
import { ArrowLeft, Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

/** What a settled card says instead of its buttons. */
const STATUS_LABEL: Record<Exclude<ActionChatCard['status'], 'proposed' | 'failed'>, string> = {
  executed: 'تم',
  cancelled: 'اتلغى',
  expired: 'انتهت صلاحية التأكيد',
};

/**
 * The one card that writes: a preview of what will change, and the two buttons
 * that decide it. Built to be read before it is pressed — every value the
 * action touches is on screen, before and after, with the direction of the
 * change coloured.
 */
export function ConfirmActionCard({
  card,
  onConfirm,
  onCancel,
}: {
  card: ActionChatCard;
  onConfirm: (card: ActionChatCard) => Promise<void>;
  onCancel: (card: ActionChatCard) => Promise<void>;
}) {
  // Only the round trip is local state: the card's own status lives with the
  // message, so a reopened transcript shows the outcome rather than the buttons.
  const [busy, setBusy] = useState(false);

  const primary = useColor('primary');
  const green = useColor('green');
  const red = useColor('red');
  const orange = useColor('orange');
  const foreground = useColor('foreground');
  const muted = useColor('mutedForeground');

  const toneColor: Record<'up' | 'down' | 'warn' | 'good', string> = {
    up: green,
    down: red,
    warn: orange,
    good: green,
  };

  const run = async (action: (card: ActionChatCard) => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action(card);
    } finally {
      setBusy(false);
    }
  };

  // A local copy, so TypeScript narrows the status inside each branch below.
  const actionStatus = card.status;
  const failed = actionStatus === 'failed';
  const settled =
    actionStatus === 'executed' || actionStatus === 'cancelled' || actionStatus === 'expired';

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Text variant='subtitle' style={styles.rtl}>
          {card.title}
        </Text>
        <Text variant='caption' style={[styles.rtl, { color: muted }]}>
          {card.subject}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        {card.rows.map((row, index) => {
          const color = row.tone ? toneColor[row.tone] : foreground;
          return (
            <View key={index} style={styles.row}>
              <Text variant='caption' style={{ color: muted }}>
                {row.label}
              </Text>
              <View style={styles.values}>
                {row.before !== undefined && row.after !== undefined ? (
                  <>
                    <Text variant='caption' style={{ color: muted, textDecorationLine: 'line-through' }}>
                      {row.before}
                    </Text>
                    {/* Left-pointing on purpose: the card reads right to left,
                        so the change runs in the direction of the text. */}
                    <ArrowLeft size={12} color={muted} />
                    <Text style={{ color, fontWeight: '700' }}>{row.after}</Text>
                  </>
                ) : (
                  <Text style={{ color, fontWeight: '700' }}>{row.value ?? row.after ?? '—'}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <Separator />

      <View style={{ gap: 4 }}>
        <Text variant='caption' style={[styles.rtl, { color: muted }]}>
          {failed ? 'الخطأ' : 'بعد التنفيذ'}
        </Text>
        <Text style={[styles.rtl, { color: failed ? red : foreground }]}>{card.result}</Text>
      </View>

      {card.warning ? (
        <View style={[styles.warning, { backgroundColor: `${orange}22`, borderColor: `${orange}55` }]}>
          <Text variant='caption' style={{ color: orange }}>
            ⚠ {card.warning}
          </Text>
        </View>
      ) : null}

      {busy ? (
        <View style={styles.busy}>
          <Spinner size='sm' color={primary} />
          <Text variant='caption' style={{ color: muted }}>
            بينفّذ…
          </Text>
        </View>
      ) : settled ? (
        <Text
          style={[styles.status, { color: actionStatus === 'executed' ? green : muted }]}
        >
          {STATUS_LABEL[actionStatus]}
        </Text>
      ) : (
        <View style={{ gap: 4 }}>
          <Button
            style={{ alignSelf: 'stretch' }}
            icon={Check}
            onPress={() => void run(onConfirm)}
          >
            تأكيد
          </Button>
          {failed ? null : (
            <Button variant='ghost' style={{ alignSelf: 'stretch' }} onPress={() => void run(onCancel)}>
              إلغاء
            </Button>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  values: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  warning: { borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  busy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  status: { textAlign: 'center', fontWeight: '700', paddingVertical: 10 },
  // The card is Arabic; its own text keeps the right edge even where the row
  // around it is laid out left to right.
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
});
