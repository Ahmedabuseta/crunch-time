import type { ShiftSummary } from '@/api/types';
import { AdminScreen, SearchField } from '@/components/app/AdminKit';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useShiftSummary } from '@/hooks/queries/reports';
import { useColor } from '@/hooks/useColor';
import { REPORT_RANGES } from '@/lib/dateRanges';
import { fmtMoneyInt, fmtTime } from '@/lib/format';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable } from 'react-native';

export default function ShiftReportsScreen() {
  const router = useRouter();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const secondary = useColor('secondary');
  const green = useColor('green');
  const red = useColor('red');

  const [range, setRange] = useState('month');
  const [search, setSearch] = useState('');
  const from = REPORT_RANGES.find((r) => r.key === range)?.from() ?? '';
  const summaryQuery = useShiftSummary(from ? { from } : undefined);
  const summary: ShiftSummary | null = summaryQuery.data?.report ?? null;
  const loading = summaryQuery.isLoading;
  const errorText = summaryQuery.error ? (summaryQuery.error as Error).message : '';
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await summaryQuery.refetch();
    setRefreshing(false);
  };

  const shifts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (summary?.shifts ?? []).filter(
      (shift) => !query || shift.userName.toLowerCase().includes(query)
    );
  }, [summary, search]);

  return (
    <AdminScreen
      title='تقارير الورديات'
      subtitle='كل وردية بحسابها، والفرق في الدرج'
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
          <Skeleton height={110} style={{ borderRadius: 18 }} />
          <Skeleton height={64} style={{ borderRadius: 18 }} />
        </>
      ) : !summary ? (
        <Text variant='caption' style={{ color: errorText ? red : muted, textAlign: 'center', paddingVertical: 20 }}>
          {errorText || 'مفيش بيانات'}
        </Text>
      ) : (
        <>
          <Card style={{ gap: 8 }}>
            <Text variant='subtitle'>الإجمالي</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <View style={{ width: '46%', gap: 2 }}>
                <Text variant='caption' style={{ color: muted }}>عدد الورديات</Text>
                <Text style={{ fontWeight: '700', fontSize: 20, color: primary }}>
                  {summary.totalShifts}
                </Text>
              </View>
              <View style={{ width: '46%', gap: 2 }}>
                <Text variant='caption' style={{ color: muted }}>إجمالي المبيعات</Text>
                <Text style={{ fontWeight: '700', fontSize: 20, color: green }}>
                  {fmtMoneyInt(summary.totalRevenue)}
                </Text>
              </View>
            </View>
            <Separator />
            <Row label='عدد الطلبات' value={String(summary.totalOrders)} muted={muted} />
            <Row label='مفتوحة الآن' value={String(summary.openCount)} muted={muted} />
            <Row label='النقدية المتوقعة' value={`${fmtMoneyInt(summary.totalExpectedCash)} ج.م`} muted={muted} />
            <Row label='النقدية المعدودة' value={`${fmtMoneyInt(summary.totalActualCash)} ج.م`} muted={muted} />
            <Row
              label='نواقص'
              value={`${fmtMoneyInt(summary.totalShorts)} ج.م`}
              muted={summary.totalShorts > 0 ? red : muted}
              strong={summary.totalShorts > 0}
            />
            <Row
              label='زيادات'
              value={`${fmtMoneyInt(summary.totalOverages)} ج.م`}
              muted={summary.totalOverages > 0 ? green : muted}
              strong={summary.totalOverages > 0}
            />
          </Card>

          <SearchField value={search} onChange={setSearch} placeholder='ابحث باسم الموظف…' />

          {shifts.length === 0 ? (
            <Text variant='caption' style={{ color: muted, textAlign: 'center', paddingVertical: 20 }}>
              مفيش ورديات في المدة دي
            </Text>
          ) : (
            shifts.map((shift) => {
              const shift_ = shift;
              const diff = shift_.difference;
              return (
                <Pressable key={shift_.id} onPress={() => router.push(`/reports/shifts/${shift_.id}`)}>
                  <Card style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontWeight: '700' }}>{shift_.userName}</Text>
                      {shift_.status === 'open' ? (
                        <Text variant='caption' style={{ color: green, fontWeight: '700' }}>
                          مفتوحة
                        </Text>
                      ) : (
                        <Text variant='caption' style={{ color: muted }}>
                          {shift_.duration != null ? `${shift_.duration} س` : ''}
                        </Text>
                      )}
                      <ChevronLeft size={16} color={muted} style={{ marginLeft: 'auto' }} />
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                      <Text variant='caption' style={{ color: muted }}>
                        {fmtTime(shift_.startedAt)}
                        {shift_.endedAt ? ` — ${fmtTime(shift_.endedAt)}` : ''} · {shift_.orderCount} طلب
                      </Text>
                      <Text variant='caption' style={{ fontWeight: '700', color: primary }}>
                        {fmtMoneyInt(shift_.revenue)} ج.م
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                      <Text variant='caption' style={{ color: muted }}>
                        الدرج: متوقع {fmtMoneyInt(shift_.expectedCash)}
                        {shift_.closingCash != null ? ` · معدود ${fmtMoneyInt(shift_.closingCash)}` : ''}
                      </Text>
                      {diff != null ? (
                        <Text
                          variant='caption'
                          style={{ fontWeight: '700', color: Math.abs(diff) < 1 ? green : red }}
                        >
                          {diff > 0 ? '+' : ''}
                          {fmtMoneyInt(diff)}
                        </Text>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}

          <View style={{ height: 1, backgroundColor: border, opacity: 0.3 }} />
          <Text variant='caption' style={{ color: muted }}>
            اضغط على أي وردية لعرض تقريرها الكامل: طرق الدفع، الأكثر مبيعاً، والحركات بالساعة.
          </Text>
        </>
      )}
    </AdminScreen>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text variant='caption' style={{ color: muted, fontWeight: strong ? '700' : '400' }}>
        {label}
      </Text>
      <Text style={{ fontWeight: strong ? '700' : '500' }}>{value}</Text>
    </View>
  );
}
