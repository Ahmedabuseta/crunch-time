import { api } from '@/api/endpoints';
import type { CashMovement, Shift } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { TAB_BAR_SPACE } from '@/theme/globals';
import { fmtMoneyInt, fmtTime } from '@/lib/format';
import { useRouter } from 'expo-router';
import { ArrowRight, BarChart3, DoorOpen, DoorClosed, Minus, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MOVEMENT_LABELS: Record<string, string> = {
  OPENING: 'رصيد افتتاحي',
  SALE: 'بيع',
  REFUND: 'استرداد',
  CASH_IN: 'إضافة نقدية',
  CASH_OUT: 'سحب نقدية',
  CLOSING: 'إغلاق',
};

export default function ShiftScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const secondary = useColor('secondary');
  const green = useColor('green');
  const red = useColor('red');

  const [shift, setShift] = useState<Shift | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [expected, setExpected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openingCash, setOpeningCash] = useState('0');
  const [closingCash, setClosingCash] = useState('');
  const [moveType, setMoveType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveNote, setMoveNote] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.currentShift();
      setShift(res.shift);
      if (res.shift) {
        const drawer = await api.cashDrawer(res.shift.id).catch(() => null);
        setMovements(drawer?.movements ?? []);
        setExpected(drawer?.expected?.expected ?? null);
      } else {
        setMovements([]);
        setExpected(null);
      }
    } catch (err: any) {
      Alert.alert('تعذّر تحميل الوردية', err?.message ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      Alert.alert('تم', message);
    } catch (err: any) {
      Alert.alert('تعذّر التنفيذ', err?.message ?? 'حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };

  const closeShift = () => {
    if (!shift) return;
    const value = Number(closingCash);
    if (!Number.isFinite(value)) {
      Alert.alert('اكتب النقدية الفعلية في الدرج');
      return;
    }
    Alert.alert('إغلاق الوردية', `متأكد من إغلاق الوردية رقم ${shift.number}؟`, [
      { text: 'رجوع', style: 'cancel' },
      { text: 'إغلاق', style: 'destructive', onPress: () => void run(() => api.closeShift(shift.id, value), 'تم إغلاق الوردية') },
    ]);
  };

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
        <Text variant='title' style={{ flex: 1 }}>
          الوردية والدرج
        </Text>
        <Pressable onPress={() => router.push('/reports')} style={{ padding: 6 }}>
          <BarChart3 size={20} color={primary} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {loading ? (
          <Skeleton height={160} style={{ borderRadius: 18 }} />
        ) : !shift ? (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <DoorOpen size={18} color={green} />
              <Text variant='subtitle'>مفيش وردية مفتوحة</Text>
            </View>
            <Text variant='caption' style={{ color: muted }}>
              لازم تفتح وردية قبل ما تقدر تاخد أي طلب.
            </Text>
            <Input
              placeholder='رصيد بداية الدرج'
              value={openingCash}
              onChangeText={setOpeningCash}
              keyboardType='number-pad'
            />
            <Button
              icon={DoorOpen}
              disabled={busy}
              style={{ alignSelf: 'stretch' }}
              onPress={() => void run(() => api.openShift(Number(openingCash) || 0), 'تم فتح الوردية')}
            >
              بدء الوردية
            </Button>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 8 }}>
              <View style={styles.row}>
                <View style={{ gap: 2 }}>
                  <Text variant='subtitle'>وردية رقم {shift.number}</Text>
                  <Text variant='caption' style={{ color: muted }}>
                    بدأت {fmtTime(shift.startedAt)}
                  </Text>
                </View>
                <View style={[styles.pill, { backgroundColor: `${green}22` }]}>
                  <Text variant='caption' style={{ color: green, fontWeight: '700' }}>
                    مفتوحة
                  </Text>
                </View>
              </View>
              <Separator />
              <Row label='رصيد افتتاحي' value={`${fmtMoneyInt(shift.openingCash)} ج.م`} muted={muted} />
              <Row
                label='النقدية المتوقعة في الدرج'
                value={expected === null ? '—' : `${fmtMoneyInt(expected)} ج.م`}
                muted={primary}
                strong
              />
            </Card>

            <Card style={{ gap: 10 }}>
              <Text variant='subtitle'>حركات الدرج</Text>
              {movements.length === 0 ? (
                <Text variant='caption' style={{ color: muted }}>
                  مفيش حركات على الدرج في الوردية دي
                </Text>
              ) : (
                movements.map((m) => (
                  <View key={m.id} style={styles.row}>
                    <Text variant='caption' style={{ color: muted }}>
                      {MOVEMENT_LABELS[m.type] ?? m.type} · {fmtTime(m.createdAt)}
                      {m.note ? ` · ${m.note}` : ''}
                    </Text>
                    <Text style={{ fontWeight: '600' }}>{fmtMoneyInt(m.amount)} ج.م</Text>
                  </View>
                ))
              )}
            </Card>

            <Card style={{ gap: 10 }}>
              <Text variant='subtitle'>تسجيل حركة</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['CASH_IN', 'CASH_OUT'] as const).map((t) => {
                  const on = moveType === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setMoveType(t)}
                      style={[
                        styles.chip,
                        { flex: 1, backgroundColor: on ? primary : secondary, borderColor: 'transparent' },
                      ]}
                    >
                      <Text
                        variant='caption'
                        style={{ color: on ? '#0F0A03' : muted, fontWeight: '700', textAlign: 'center' }}
                      >
                        {t === 'CASH_IN' ? 'إضافة نقدية' : 'سحب نقدية'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Input placeholder='المبلغ' value={moveAmount} onChangeText={setMoveAmount} keyboardType='number-pad' />
              <Input placeholder='ملاحظة (اختياري)' value={moveNote} onChangeText={setMoveNote} />
              <Button
                variant='secondary'
                icon={moveType === 'CASH_IN' ? Plus : Minus}
                disabled={busy || !moveAmount}
                style={{ alignSelf: 'stretch' }}
                onPress={async () => {
                  await run(
                    () =>
                      api.cashMovement({
                        shiftId: shift.id,
                        type: moveType,
                        amount: Number(moveAmount) || 0,
                        note: moveNote.trim() || undefined,
                      }),
                    'تم تسجيل الحركة'
                  );
                  setMoveAmount('');
                  setMoveNote('');
                }}
              >
                تسجيل
              </Button>
            </Card>

            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <DoorClosed size={18} color={red} />
                <Text variant='subtitle'>إغلاق الوردية</Text>
              </View>
              <Input
                placeholder='النقدية الفعلية في الدرج'
                value={closingCash}
                onChangeText={setClosingCash}
                keyboardType='number-pad'
              />
              {expected !== null && closingCash ? (
                <Row
                  label='الفرق'
                  value={`${fmtMoneyInt((Number(closingCash) || 0) - expected)} ج.م`}
                  muted={Math.abs((Number(closingCash) || 0) - expected) < 1 ? green : red}
                  strong
                />
              ) : null}
              <Button
                variant='destructive'
                disabled={busy || !closingCash}
                style={{ alignSelf: 'stretch' }}
                onPress={closeShift}
              >
                إغلاق الوردية
              </Button>
            </Card>
          </>
        )}

        <View style={{ height: 1, backgroundColor: border, opacity: 0.4 }} />
        <Button variant='ghost' icon={BarChart3} onPress={() => router.push('/reports')}>
          تقرير الوردية (Z)
        </Button>
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
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
});
