import { ConfirmActionCard } from '@/components/app/ConfirmActionCard';
import { ReportView } from '@/components/app/ReportView';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import type { ActionChatCard, ChatCard } from '@/api/types';
import { useColor } from '@/hooks/useColor';
import { formatReport } from '@/lib/reportFormat';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

/**
 * Draws whatever card the assistant attached to an answer. A kind this build
 * does not know renders nothing at all — a newer server must never be able to
 * crash the screen.
 */
export function ChatCardView({
  card,
  onConfirm,
  onCancel,
}: {
  card: ChatCard;
  onConfirm?: (card: ActionChatCard) => Promise<void>;
  onCancel?: (card: ActionChatCard) => Promise<void>;
}) {
  switch (card.kind) {
    case 'action':
      // The callbacks only go missing if the screen mis-wires it; a card with
      // dead buttons would be worse than none.
      return onConfirm && onCancel ? (
        <ConfirmActionCard card={card} onConfirm={onConfirm} onCancel={onCancel} />
      ) : null;

    case 'report':
      // The same viewer the Reports tab uses: an assistant report is a report.
      return (
        <Card style={{ gap: 10 }}>
          <Text variant='subtitle' style={styles.rtl}>
            {card.title}
          </Text>
          <ReportView nodes={formatReport(card.report)} />
        </Card>
      );

    case 'metrics':
      return <MetricsCard title={card.title} items={card.items} />;

    case 'table':
      return <TableCard title={card.title} columns={card.columns} rows={card.rows} />;

    default:
      return null;
  }
}

const METRIC_TONE = { good: 'green', warn: 'orange', bad: 'red' } as const;

function MetricsCard({
  title,
  items,
}: {
  title?: string;
  items: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }[];
}) {
  const green = useColor('green');
  const orange = useColor('orange');
  const red = useColor('red');
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');

  const toneColor = { green, orange, red, primary };

  return (
    <Card style={{ gap: 10 }}>
      {title ? (
        <Text variant='subtitle' style={styles.rtl}>
          {title}
        </Text>
      ) : null}
      <View style={{ gap: 8 }}>
        {items.map((item, index) => (
          <View key={index} style={styles.row}>
            <Text variant='caption' style={{ color: muted }}>
              {item.label}
            </Text>
            <Text style={{ fontWeight: '700', color: item.tone ? toneColor[METRIC_TONE[item.tone]] : primary }}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Same grid as `ReportView`'s tables, so a chat table matches the Reports tab. */
function TableCard({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');

  return (
    <Card style={{ gap: 8 }}>
      <Text variant='subtitle' style={styles.rtl}>
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 12 }}>
          مفيش صفوف
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[styles.tableRow, { borderBottomColor: border, borderBottomWidth: 1 }]}>
              {columns.map((column, index) => (
                <Text
                  key={`${column}-${index}`}
                  variant='caption'
                  style={[styles.cell, styles.headerCell, { color: primary }]}
                  numberOfLines={1}
                >
                  {column}
                </Text>
              ))}
            </View>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.tableRow}>
                {row.map((cell, cellIndex) => (
                  <Text key={cellIndex} style={styles.cell} numberOfLines={2}>
                    {cell}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cell: { width: 104, paddingVertical: 6, paddingHorizontal: 4, fontSize: 12 },
  headerCell: { fontWeight: '700' },
});
