import { AdminScreen } from '@/components/app/AdminKit';
import { ReportView } from '@/components/app/ReportView';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useReport } from '@/hooks/queries/reports';
import { useColor } from '@/hooks/useColor';
import { REPORT_RANGES } from '@/lib/dateRanges';
import { formatReport } from '@/lib/reportFormat';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable } from 'react-native';

/** One screen for every report: fetch it, flatten it, render it. */
export default function ReportViewerScreen() {
  const { name, title } = useLocalSearchParams<{ name: string; title?: string }>();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const secondary = useColor('secondary');

  const [range, setRange] = useState('month');
  const from = REPORT_RANGES.find((option) => option.key === range)?.from() ?? '';
  const reportQuery = useReport(String(name ?? ''), from ? { from } : undefined);
  const report = reportQuery.data?.report ?? null;
  const loading = reportQuery.isLoading;
  const errorText = reportQuery.error ? (reportQuery.error as Error).message : '';
  const red = useColor('red');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await reportQuery.refetch();
    setRefreshing(false);
  };

  const nodes = useMemo(() => formatReport(report), [report]);

  return (
    <AdminScreen
      title={typeof title === 'string' && title ? title : 'تقرير'}
      subtitle={typeof name === 'string' ? name : undefined}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {REPORT_RANGES.map((option) => {
          const active = range === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setRange(option.key)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? primary : secondary,
              }}
            >
              <Text variant='caption' style={{ color: active ? '#0F0A03' : muted, fontWeight: '700' }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <>
          <Skeleton height={80} style={{ borderRadius: 18 }} />
          <Skeleton height={160} style={{ borderRadius: 18 }} />
        </>
      ) : errorText ? (
        <Text variant='caption' style={{ color: red, textAlign: 'center' }}>
          {errorText}
        </Text>
      ) : (
        <ReportView nodes={nodes} />
      )}
    </AdminScreen>
  );
}
