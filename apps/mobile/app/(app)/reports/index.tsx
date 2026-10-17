import { BarChart } from '@/components/charts/bar-chart';
import type { ZReport } from '@/api/types';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { useReport, useZReport } from '@/hooks/queries/reports';
import { PAYMENT_LABELS, fmtMoneyInt, fmtTime } from '@/lib/format';
import { TAB_BAR_SPACE } from '@/theme/globals';
import { useRouter } from 'expo-router';
import { ChevronLeft, RefreshCw } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DailySummary {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  cancelledOrders: number;
  refundedOrders: number;
}

/** Every report the server exposes, grouped the way an owner looks for them. */
const CATALOGUE: { group: string; items: { name: string; label: string }[] }[] = [
  {
    group: 'الورديات',
    items: [
      { name: 'labor', label: 'العمالة وساعات العمل' },
      { name: 'voids', label: 'الإلغاءات والاسترداد' },
    ],
  },
  {
    group: 'المبيعات',
    items: [
      { name: 'period', label: 'ملخص الفترة' },
      { name: 'profit', label: 'الأرباح والمصروفات' },
      { name: 'hourly', label: 'المبيعات بالساعة' },
      { name: 'order-type-split', label: 'توزيع أنواع الطلب' },
      { name: 'ticket-distribution', label: 'توزيع قيمة الفواتير' },
      { name: 'payment-methods', label: 'طرق الدفع' },
      { name: 'revenue-trend', label: 'اتجاه المبيعات' },
      { name: 'sales-trend', label: 'توقع المبيعات' },
      { name: 'discounts', label: 'الخصومات' },
    ],
  },
  {
    group: 'الأصناف',
    items: [
      { name: 'top-items', label: 'الأكثر مبيعاً' },
      { name: 'category-revenue', label: 'مبيعات الأقسام' },
      { name: 'addon-stats', label: 'الإضافات' },
    ],
  },
  {
    group: 'المخزون',
    items: [
      { name: 'inventory-alerts', label: 'تنبيهات المخزون' },
      { name: 'inventory-turnover', label: 'دوران المخزون' },
      { name: 'days-on-hand', label: 'أيام التغطية' },
      { name: 'purchase-price-variance', label: 'فرق أسعار الشراء' },
      { name: 'abc-xyz', label: 'تحليل ABC / XYZ' },
    ],
  },
  {
    group: 'التوصيل',
    items: [{ name: 'driver-summary', label: 'تسوية الديلفري' }],
  },
];

export default function ReportsHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const green = useColor('green');
  const red = useColor('red');
  const border = useColor('border');

  const zQuery = useZReport();
  const dailyQuery = useReport<DailySummary>('daily');
  const z: ZReport | null = zQuery.data?.report ?? null;
  const daily: DailySummary | null = dailyQuery.data?.report ?? null;
  const loading = zQuery.isLoading && dailyQuery.isLoading;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([zQuery.refetch(), dailyQuery.refetch()]);
    setRefreshing(false);
  };

  const open = (name: string, label: string) =>
    router.push(`/reports/view/${name}?title=${encodeURIComponent(label)}`);

  const hourly = (z?.hourly ?? []).map((h) => ({ label: `${h.hour}`, value: Math.round(h.revenue) }));

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
            مبيعات اليوم، الوردية الحالية، وكل تقارير الكمبيوتر
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
            <Card style={{ gap: 8 }}>
              <Text variant='subtitle'>ملخص اليوم</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Kpi label='عدد الطلبات' value={String(daily?.totalOrders ?? 0)} color={primary} muted={muted} />
                <Kpi label='الإيراد' value={fmtMoneyInt(daily?.totalRevenue ?? 0)} color={green} muted={muted} />
                <Kpi label='متوسط الطلب' value={fmtMoneyInt(daily?.avgOrderValue ?? 0)} color={primary} muted={muted} />
                <Kpi
                  label='ملغي / مسترد'
                  value={`${daily?.cancelledOrders ?? 0} / ${daily?.refundedOrders ?? 0}`}
                  color={red}
                  muted={muted}
                />
              </View>
            </Card>

            {/* The shift report is the one an owner opens daily, so it gets its
                own entry rather than hiding behind the generic viewer. */}
            <Pressable onPress={() => router.push('/reports/shifts')}>
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant='subtitle' style={{ flex: 1 }}>
                    تقارير الورديات
                  </Text>
                  <ChevronLeft size={16} color={muted} />
                </View>
                <Text variant='caption' style={{ color: muted }}>
                  كل وردية بإيرادها وفرق الدرج، واضغط على أي وردية لتقريرها الكامل.
                </Text>
              </Card>
            </Pressable>

            {z ? (
              <>
                <Card style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text variant='subtitle' style={{ flex: 1 }}>
                      الوردية الحالية (Z)
                    </Text>
                    <Text variant='caption' style={{ color: muted }}>
                      {fmtTime(z.startedAt)}
                      {z.endedAt ? ` — ${fmtTime(z.endedAt)}` : ''}
                    </Text>
                  </View>
                  <Separator />
                  <Row label='عدد الطلبات' value={String(z.orderCount)} muted={muted} />
                  <Row label='إجمالي المبيعات' value={`${fmtMoneyInt(z.totalRevenue)} ج.م`} muted={primary} strong />
                  <Row label='النقدية المتوقعة' value={`${fmtMoneyInt(z.expectedCash)} ج.م`} muted={muted} />
                  {z.cashDifference != null ? (
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
                    <BarChart data={hourly} config={{ height: 150, showGrid: true, showLabels: true }} />
                  </Card>
                ) : null}

                {z.payments.length > 0 ? (
                  <Card style={{ gap: 8 }}>
                    <Text variant='subtitle'>طرق الدفع</Text>
                    {z.payments.map((payment) => (
                      <Row
                        key={payment.method}
                        label={`${PAYMENT_LABELS[payment.method] ?? payment.method} (${payment.count})`}
                        value={`${fmtMoneyInt(payment.total)} ج.م`}
                        muted={muted}
                      />
                    ))}
                  </Card>
                ) : null}
              </>
            ) : (
              <Card style={{ gap: 6 }}>
                <Text variant='subtitle'>مفيش وردية مفتوحة</Text>
                <Text variant='caption' style={{ color: muted }}>
                  افتح وردية من شاشة الوردية وهتلاقي أرقامها هنا.
                </Text>
              </Card>
            )}

            {CATALOGUE.map((section) => (
              <Card key={section.group} style={{ gap: 4 }}>
                <Text variant='subtitle' style={{ paddingBottom: 4 }}>
                  {section.group}
                </Text>
                {section.items.map((item) => (
                  <Pressable
                    key={item.name}
                    onPress={() => open(item.name, item.label)}
                    style={styles.linkRow}
                  >
                    <Text style={{ flex: 1 }}>{item.label}</Text>
                    <ChevronLeft size={16} color={muted} />
                  </Pressable>
                ))}
              </Card>
            ))}

            <View style={{ height: 1, backgroundColor: border, opacity: 0.3 }} />
            <Pressable onPress={() => router.push('/shift')}>
              <Text variant='caption' style={{ color: muted, textAlign: 'center' }}>
                الوردية والدرج
              </Text>
            </Pressable>
          </>
        )}
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
    <View style={{ width: '46%', gap: 2 }}>
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
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
});
