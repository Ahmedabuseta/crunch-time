import { BarChart } from '@/components/charts/bar-chart';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import type { ReportNode } from '@/lib/reportFormat';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

/** Renders whatever `formatReport` produced — one viewer for every report. */
export function ReportView({ nodes }: { nodes: ReportNode[] }) {
  const muted = useColor('mutedForeground');
  const primary = useColor('primary');
  const border = useColor('border');

  if (nodes.length === 0) {
    return (
      <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 24 }}>
        مفيش بيانات في المدة دي
      </Text>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {nodes.map((node, index) => {
        if (node.kind === 'metric') {
          return (
            <View key={index} style={styles.row}>
              <Text variant='caption' style={{ color: muted }}>
                {node.label}
              </Text>
              <Text style={{ fontWeight: '700', color: primary }}>{node.value}</Text>
            </View>
          );
        }

        if (node.kind === 'text') {
          return (
            <View key={index} style={styles.row}>
              <Text variant='caption' style={{ color: muted }}>
                {node.label}
              </Text>
              <Text style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>
                {node.value}
              </Text>
            </View>
          );
        }

        if (node.kind === 'bars') {
          return (
            <Card key={index} style={{ gap: 10 }}>
              <Text variant='subtitle'>{node.title}</Text>
              <BarChart data={node.items} config={{ height: 160, showGrid: true, showLabels: true }} />
            </Card>
          );
        }

        // Table: a horizontally scrollable grid, so five columns still fit on a
        // phone rather than being squeezed unreadable.
        return (
          <Card key={index} style={{ gap: 8 }}>
            <Text variant='subtitle'>{node.title}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={[styles.tableRow, { borderBottomColor: border, borderBottomWidth: 1 }]}>
                  {node.columns.map((column) => (
                    <Text
                      key={column}
                      variant='caption'
                      style={[styles.cell, styles.headerCell, { color: muted }]}
                      numberOfLines={1}
                    >
                      {column}
                    </Text>
                  ))}
                </View>
                {node.rows.map((row, rowIndex) => (
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
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cell: { width: 104, paddingVertical: 6, paddingHorizontal: 4, fontSize: 12 },
  headerCell: { fontWeight: '700' },
});
