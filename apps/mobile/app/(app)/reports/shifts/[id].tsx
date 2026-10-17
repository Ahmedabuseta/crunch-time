import { BarChart } from '@/components/charts/bar-chart';
import type { ZReport } from '@/api/types';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useShiftReport } from '@/hooks/queries/reports';
import { useColor } from '@/hooks/useColor';
import { PAYMENT_LABELS, fmtMoneyInt, fmtTime } from '@/lib/format';
import { TAB_BAR_SPACE } from '@/theme/globals';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ShiftReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const green = useColor('green');
  const red = useColor('red');
  const border = useColor('border');

  const reportQuery = useShiftReport(id);
  const report: ZReport | null = reportQuery.data?.report ?? null;
  const loading = reportQuery.isLoading;
  const error = reportQuery.error ? (reportQuery.error as Error).message : '';
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await reportQuery.refetch();
    setRefreshing(false);
  };

  const hourly = (report?.hourly ?? []).map((h) => ({ label: `${h.hour}`, value: Math.round(h.revenue) }));

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE + 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={{ padding: 6 }}>
          <ArrowRight size={20} color={muted} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant='title'>تقرير الوردية</Text>
          {report ? (
            <Text variant='caption' style={{ color: muted }}>
              {report.userName} · {fmtTime(report.startedAt)}
              {report.endedAt ? ` — ${fmtTime(report.endedAt)}` : ' — مفتوحة'}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {loading ? (
          <>
            <Skeleton height={140} style={{ borderRadius: 18 }} />
            <Skeleton height={180} style={{ borderRadius: 18 }} />
          </>
        ) : error || !report ? (
          <Text variant='caption' style={{ color: red, textAlign: 'center' }}>
            {error || 'مفيش بيانات'}
          </Text>
        ) : (
          <>
            <Card style={{ gap: 8 }}>
              <Text variant='subtitle'>الحصيلة</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <View style={{ width: '46%', gap: 2 }}>
                  <Text variant='caption' style={{ color: muted }}>عدد الطلبات</Text>
                  <Text style={{ fontWeight: '700', fontSize: 20, color: primary }}>
                    {report.orderCount}
                  </Text>
                </View>
                <View style={{ width: '46%', gap: 2 }}>
                  <Text variant='caption' style={{ color: muted }}>إجمالي المبيعات</Text>
                  <Text style={{ fontWeight: '700', fontSize: 20, color: green }}>
                    {fmtMoneyInt(report.totalRevenue)}
                  </Text>
                </View>
              </View>
              <Separator />
              <Row label='رصيد افتتاحي' value={`${fmtMoneyInt(report.openingCash)} ج.م`} muted={muted} />
              <Row label='النقدية المتوقعة' value={`${fmtMoneyInt(report.expectedCash)} ج.م`} muted={muted} />
              {report.closingCash != null ? (
                <Row label='النقدية المعدودة' value={`${fmtMoneyInt(report.closingCash)} ج.م`} muted={muted} />
              ) : null}
              {report.cashDifference != null ? (
                <Row
                  label='الفرق'
                  value={`${report.cashDifference > 0 ? '+' : ''}${fmtMoneyInt(report.cashDifference)} ج.م`}
                  muted={Math.abs(report.cashDifference) < 1 ? green : red}
                  strong
                />
              ) : null}
            </Card>

            {hourly.length > 0 ? (
              <Card style={{ gap: 10 }}>
                <Text variant='subtitle'>المبيعات بالساعة</Text>
                <BarChart data={hourly} config={{ height: 150, showGrid: true, showLabels: true }} />
              </Card>
            ) : null}

            {report.payments.length > 0 ? (
              <Card style={{ gap: 8 }}>
                <Text variant='subtitle'>طرق الدفع</Text>
                {report.payments.map((payment) => (
                  <Row
                    key={payment.method}
                    label={`${PAYMENT_LABELS[payment.method] ?? payment.method} (${payment.count})`}
                    value={`${fmtMoneyInt(payment.total)} ج.م`}
                    muted={muted}
                  />
                ))}
              </Card>
            ) : null}

            {report.movements.length > 0 ? (
              <Card style={{ gap: 8 }}>
                <Text variant='subtitle'>حركات الدرج</Text>
                {report.movements.map((movement) => (
                  <Row
                    key={movement.type}
                    label={movement.type}
                    value={`${fmtMoneyInt(movement.amount)} ج.م`}
                    muted={muted}
                  />
                ))}
              </Card>
            ) : null}

            {report.topItems.length > 0 ? (
              <Card style={{ gap: 8 }}>
                <Text variant='subtitle'>الأكثر مبيعاً</Text>
                {report.topItems.map((item) => (
                  <Row
                    key={item.name}
                    label={`${item.emoji} ${item.name} ×${item.qty}`}
                    value={`${fmtMoneyInt(item.revenue)} ج.م`}
                    muted={muted}
                  />
                ))}
              </Card>
            ) : null}

            <View style={{ height: 1, backgroundColor: border, opacity: 0.3 }} />
            <Text variant='caption' style={{ color: muted, textAlign: 'center' }}>
              نفس أرقام تقرير الوردية على الكمبيوتر.
            </Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text variant='caption' style={{ color: muted, fontWeight: strong ? '700' : '400' }}>
        {label}
      </Text>
      <Text style={{ fontWeight: strong ? '700' : '500' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
