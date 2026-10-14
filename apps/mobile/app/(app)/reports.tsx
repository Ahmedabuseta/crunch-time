import { BarChart } from '@/components/charts/bar-chart';
import { api } from '@/api/endpoints';
import type { ZReport } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { TAB_BAR_SPACE } from '@/theme/globals';
import { PAYMENT_LABELS, fmtMoneyInt, fmtTime } from '@/lib/format';
import { useRouter } from 'expo-router';
import { ArrowRight, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DailySummary {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  cancelledOrders: number;
  refundedOrders: number;
  totalRefunded: number;
  grossProfit: number;
}

export default function ReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const green = useColor('green');
  const red = useColor('red');

  const [z, setZ] = useState<ZReport | null>(null);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [zRes, dRes] = await Promise.allSettled([api.zReport(), api.report<DailySummary>('daily')]);
    if (zRes.status === 'fulfilled') setZ(zRes.value.report);
    else setZ(null);
    if (dRes.status === 'fulfilled') setDaily(dRes.value.report);
    setError(zRes.status === 'rejected' && dRes.status === 'rejected' ? 'تعذّر تحميل التقارير' : '');
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const hourly = (z?.hourly ?? []).map((h) => ({
    label: `${h.hour}`,
    value: Math.round(h.revenue),
  }));

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE + 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
    >
      <View style={styles.topBar}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant='title'>التقارير</Text>
          <Text variant='caption' style={{ color: muted }}>
            مبيعات اليوم وتقرير الوردية
          </Text>
        </View>
        <Pressable onPress={() => void onRefresh()} style={{ padding: 6 }}>
          <RefreshCw size={18} color={muted} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {loading ? (
          <>
            <Skeleton height={140} style={{ borderRadius: 18 }} />
            <Skeleton height={180} style={{ borderRadius: 18 }} />
          </>
        ) : (
          <>
            {error ? (
              <Text variant='caption' style={{ color: red, textAlign: 'center' }}>
                {error}
              </Text>
            ) : null}

            <Card style={{ gap: 8 }}>
              <Text variant='subtitle'>ملخص اليوم</Text>
              <View style={styles.kpis}>
                <Kpi label='عدد الطلبات' value={String(daily?.totalOrders ?? 0)} color={primary} muted={muted} />
                <Kpi
                  label='الإيراد'
                  value={`${fmtMoneyInt(daily?.totalRevenue ?? 0)}`}
                  color={green}
                  muted={muted}
                />
                <Kpi
                  label='متوسط الطلب'
                  value={`${fmtMoneyInt(daily?.avgOrderValue ?? 0)}`}
                  color={primary}
                  muted={muted}
                />
                <Kpi
                  label='ملغي / مسترد'
                  value={`${daily?.cancelledOrders ?? 0} / ${daily?.refundedOrders ?? 0}`}
                  color={red}
                  muted={muted}
                />
              </View>
            </Card>

            {z ? (
              <>
                <Card style={{ gap: 8 }}>
                  <View style={styles.row}>
                    <View style={{ gap: 2 }}>
                      <Text variant='subtitle'>تقرير الوردية (Z)</Text>
                      <Text variant='caption' style={{ color: muted }}>
                        {fmtTime(z.startedAt)}
                        {z.endedAt ? ` — ${fmtTime(z.endedAt)}` : ' — مفتوحة'}
                      </Text>
                    </View>
                  </View>
                  <Separator />
                  <Row label='عدد الطلبات' value={String(z.orderCount)} muted={muted} />
                  <Row label='إجمالي المبيعات' value={`${fmtMoneyInt(z.totalRevenue)} ج.م`} muted={primary} strong />
                  <Row label='رصيد افتتاحي' value={`${fmtMoneyInt(z.openingCash)} ج.م`} muted={muted} />
                  <Row label='النقدية المتوقعة' value={`${fmtMoneyInt(z.expectedCash)} ج.م`} muted={muted} />
                  {z.cashDifference !== null ? (
                    <Row
                      label='فرق النقدية'
                      value={`${fmtMoneyInt(z.cashDifference)} ج.م`}
                      muted={Math.abs(z.cashDifference) < 1 ? green : red}
                      strong
                    />
                  ) : null}
                </Card>

                {hourly.length > 0 ? (
                  <Card style={{ gap: 10 }}>
                    <Text variant='subtitle'>المبيعات بالساعة</Text>
                    <BarChart data={hourly} config={{ height: 160, showGrid: true, showLabels: true }} />
                  </Card>
                ) : null}

                {z.payments.length > 0 ? (
                  <Card style={{ gap: 8 }}>
                    <Text variant='subtitle'>طرق الدفع</Text>
                    {z.payments.map((p) => (
                      <Row
                        key={p.method}
                        label={`${PAYMENT_LABELS[p.method] ?? p.method} (${p.count})`}
                        value={`${fmtMoneyInt(p.total)} ج.م`}
                        muted={muted}
                      />
                    ))}
                  </Card>
                ) : null}

                {z.topItems.length > 0 ? (
                  <Card style={{ gap: 8 }}>
                    <Text variant='subtitle'>الأكثر مبيعاً</Text>
                    {z.topItems.map((item) => (
                      <Row
                        key={item.name}
                        label={`${item.emoji} ${item.name} ×${item.qty}`}
                        value={`${fmtMoneyInt(item.revenue)} ج.م`}
                        muted={muted}
                      />
                    ))}
                  </Card>
                ) : null}
              </>
            ) : (
              <Card style={{ gap: 8 }}>
                <Text variant='subtitle'>مفيش وردية مفتوحة</Text>
                <Text variant='caption' style={{ color: muted }}>
                  افتح وردية من شاشة الوردية وهتلاقي تقرير Z هنا.
                </Text>
                <Button variant='secondary' icon={ArrowRight} onPress={() => router.push('/shift')}>
                  الوردية والدرج
                </Button>
              </Card>
            )}
          </>
        )}

        <View style={{ height: 1, backgroundColor: border, opacity: 0.4 }} />
        <Button variant='ghost' icon={ArrowRight} onPress={() => router.push('/shift')}>
          الوردية والدرج
        </Button>
      </View>
    </ScrollView>
  );
}

function Kpi({
  label,
  value,
  color,
  muted,
}: {
  label: string;
  value: string;
  color: string;
  muted: string;
}) {
  return (
    <View style={styles.kpi}>
      <Text variant='caption' style={{ color: muted }}>
        {label}
      </Text>
      <Text style={{ fontWeight: '700', fontSize: 20, color }}>{value}</Text>
    </View>
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
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 },
  kpi: { width: '46%', gap: 2 },
});
