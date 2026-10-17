import type { DeliveryProfile, Order } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useAssignDriver, usePrintOrder, useUpdateOrderStatus } from '@/hooks/mutations/orders';
import { useOrder } from '@/hooks/queries/orders';
import { useDeliveryProfiles } from '@/hooks/queries/reference';
import { useColor } from '@/hooks/useColor';
import { TAB_BAR_SPACE } from '@/theme/globals';
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_LABELS,
  fmtDate,
  fmtMoneyInt,
  fmtTime,
} from '@/lib/format';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, ChefHat, Printer, Truck, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const VOID_REASONS = [
  'العميل طلب الإلغاء',
  'خطأ في إدخال الطلب',
  'تأخير التوصيل',
  'مشكلة في جودة الطعام',
  'العميل لم يستلم',
  'دفع مكرر',
];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const secondary = useColor('secondary');
  const green = useColor('green');
  const red = useColor('red');
  const warning = useColor('warning');
  const blue = useColor('blue');

  const statusColor: Record<string, string> = {
    COMPLETED: green,
    CANCELLED: red,
    REFUNDED: warning,
  };

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');
  const [showDrivers, setShowDrivers] = useState(false);
  const [notice, setNotice] = useState('');

  const orderQuery = useOrder(id);
  const order: Order | null = orderQuery.data?.order ?? null;
  const loading = orderQuery.isLoading;
  const error = orderQuery.error ? (orderQuery.error as Error).message : '';

  // Fetched only once the driver picker is opened.
  const driversQuery = useDeliveryProfiles(showDrivers);
  const profiles: DeliveryProfile[] = driversQuery.data?.profiles ?? [];

  const updateStatusMutation = useUpdateOrderStatus();
  const assignDriverMutation = useAssignDriver();
  const printOrderMutation = usePrintOrder();

  const onRefresh = async () => {
    setRefreshing(true);
    await orderQuery.refetch();
    setRefreshing(false);
  };

  const run = async (fn: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setNotice('');
    try {
      await fn();
      setNotice(successMessage);
    } catch (err: any) {
      Alert.alert('تعذّر التنفيذ', err?.message ?? 'حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };

  const openDriverPicker = () => setShowDrivers(true);

  const doRefund = (status: 'CANCELLED' | 'REFUNDED') => {
    const text = reason.trim();
    if (!text) {
      Alert.alert('السبب مطلوب', 'اكتب سبب أو اختار سبب من القائمة');
      return;
    }
    const verb = status === 'CANCELLED' ? 'إلغاء' : 'استرداد';
    Alert.alert(`${verb} الطلب`, `متأكد من ${verb} الطلب ${order?.id}؟`, [
      { text: 'رجوع', style: 'cancel' },
      {
        text: verb,
        style: 'destructive',
        onPress: () =>
          void run(
            () => updateStatusMutation.mutateAsync({ id: String(id), status, reason: text }),
            `تم ${verb} الطلب`
          ),
      },
    ]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, padding: insets.top + 12, paddingHorizontal: 16, gap: 12 }}>
        <Skeleton height={120} style={{ borderRadius: 18 }} />
        <Skeleton height={200} style={{ borderRadius: 18 }} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <Text variant='subtitle'>{error || 'الطلب غير موجود'}</Text>
        <Button variant='outline' onPress={() => router.back()} icon={ArrowRight}>
          رجوع
        </Button>
      </View>
    );
  }

  const canVoid = order.status === 'COMPLETED';
  const isDelivery = order.orderType === 'delivery';

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: TAB_BAR_SPACE + 20 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
      }
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ArrowRight size={20} color={muted} />
        </Pressable>
        <Text style={{ fontWeight: '700', fontSize: 18 }}>{order.id}</Text>
        <View style={[styles.statusPill, { backgroundColor: `${statusColor[order.status]}22` }]}>
          <Text
            variant='caption'
            style={{ color: statusColor[order.status], fontWeight: '700', fontSize: 12 }}
          >
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Text>
        </View>
      </View>

      {notice ? (
        <Text variant='caption' style={{ color: green, textAlign: 'center', paddingBottom: 8 }}>
          {notice}
        </Text>
      ) : null}

      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <Card style={{ gap: 8 }}>
          <Row label='التاريخ' value={`${fmtDate(order.createdAt)} · ${fmtTime(order.createdAt)}`} muted={muted} />
          <Separator />
          <Row label='النوع' value={ORDER_TYPE_LABELS[order.orderType] ?? order.orderType} muted={muted} />
          <Separator />
          <Row label='الدفع' value={PAYMENT_LABELS[order.paymentType] ?? order.paymentType} muted={muted} />
          {order.cashierName ? (
            <>
              <Separator />
              <Row label='الموظف' value={order.cashierName} muted={muted} />
            </>
          ) : null}
          {isDelivery ? (
            <>
              <Separator />
              <Row
                label='الديلفري'
                value={order.deliveryProfileName || 'بدون سائق'}
                muted={muted}
                strong={order.driverStatus === 'assigned'}
              />
              {order.customerPhone ? (
                <>
                  <Separator />
                  <Row label='التليفون' value={order.customerPhone} muted={muted} />
                </>
              ) : null}
              {order.customerAddress ? (
                <>
                  <Separator />
                  <Row label='العنوان' value={order.customerAddress} muted={muted} />
                </>
              ) : null}
            </>
          ) : null}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text variant='subtitle'>الأصناف</Text>
          {(order.items ?? []).map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={{ flex: 1, fontWeight: '500' }}>
                {item.productEmoji ?? ''} {item.productName ?? 'صنف'} ×{item.quantity}
                {item.note ? (
                  <Text variant='caption' style={{ color: warning }}>{`  — ${item.note}`}</Text>
                ) : null}
              </Text>
              <Text style={{ fontWeight: '700' }}>
                {fmtMoneyInt(item.unitPrice * item.quantity)} ج.م
              </Text>
            </View>
          ))}
          <Separator />
          <Row label='المجموع الفرعي' value={`${fmtMoneyInt(order.subtotal)} ج.م`} muted={muted} />
          {order.discountAmount > 0 ? (
            <Row label='الخصم' value={`-${fmtMoneyInt(order.discountAmount)} ج.م`} muted={green} />
          ) : null}
          {order.deliveryFee > 0 ? (
            <Row label='رسوم التوصيل' value={`${fmtMoneyInt(order.deliveryFee)} ج.م`} muted={muted} />
          ) : null}
          <Row label='الضريبة' value={`${fmtMoneyInt(order.tax)} ج.م`} muted={muted} />
          <Separator />
          <Row label='الإجمالي' value={`${fmtMoneyInt(order.total)} ج.م`} muted={primary} strong />
          {order.refundedAmount > 0 ? (
            <Row label='المسترد' value={`${fmtMoneyInt(order.refundedAmount)} ج.م`} muted={warning} />
          ) : null}
        </Card>

        {isDelivery && canVoid ? (
          <Card style={{ gap: 10 }}>
            <Text variant='subtitle'>تعيين سائق</Text>
            {showDrivers ? (
              <View style={{ gap: 8 }}>
                {profiles.length === 0 ? (
                  <Text variant='caption' style={{ color: muted }}>
                    لا يوجد ديلفري مضاف من الكمبيوتر
                  </Text>
                ) : (
                  profiles.map((p) => (
                    <Pressable
                      key={p.id}
                      style={[styles.driverRow, { borderColor: border }]}
                      onPress={() =>
                        void run(
                          () => assignDriverMutation.mutateAsync({ id: order.id, profileId: p.id }),
                          `تم تعيين ${p.name}`
                        )
                      }
                    >
                      <Truck size={16} color={blue} />
                      <Text style={{ flex: 1, fontWeight: '600' }}>{p.name}</Text>
                      {p.phone ? (
                        <Text variant='caption' style={{ color: muted }}>
                          {p.phone}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))
                )}
                <Button variant='ghost' onPress={() => setShowDrivers(false)}>
                  إغلاق
                </Button>
              </View>
            ) : (
              <Button
                variant='secondary'
                icon={Truck}
                onPress={() => void openDriverPicker()}
                disabled={busy}
              >
                {order.deliveryProfileName || 'اختار ديلفري'}
              </Button>
            )}
          </Card>
        ) : null}

        <Card style={{ gap: 10 }}>
          <Text variant='subtitle'>طباعة</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                variant='outline'
                icon={Printer}
                disabled={busy}
                style={{ alignSelf: 'stretch' }}
                onPress={() =>
                  void run(
                    () => printOrderMutation.mutateAsync({ id: order.id, kind: 'receipt' }),
                    'اتبعت الإيصال'
                  )
                }
              >
                إيصال
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                variant='outline'
                icon={ChefHat}
                disabled={busy}
                style={{ alignSelf: 'stretch' }}
                onPress={() =>
                  void run(
                    () => printOrderMutation.mutateAsync({ id: order.id, kind: 'kitchen' }),
                    'اتبعت تذكرة المطبخ'
                  )
                }
              >
                المطبخ
              </Button>
            </View>
          </View>
        </Card>

        {canVoid ? (
          <Card style={{ gap: 10 }}>
            <Text variant='subtitle'>إلغاء / استرداد</Text>
            {showReason ? (
              <View style={{ gap: 10 }}>
                <Input
                  placeholder='اكتب سبب أو اختار من تحت'
                  value={reason}
                  onChangeText={setReason}
                  type='textarea'
                  rows={2}
                />
                <View style={styles.chipWrap}>
                  {VOID_REASONS.map((r) => {
                    const active = reason === r;
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setReason(r)}
                        style={[
                          styles.chip,
                          { backgroundColor: active ? primary : secondary, borderColor: 'transparent' },
                        ]}
                      >
                        <Text variant='caption' style={{ color: active ? '#0F0A03' : muted }}>
                          {r}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      variant='destructive'
                      disabled={busy}
                      style={{ alignSelf: 'stretch' }}
                      onPress={() => doRefund('CANCELLED')}
                    >
                      إلغاء كامل
                    </Button>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      variant='secondary'
                      disabled={busy}
                      style={{ alignSelf: 'stretch' }}
                      onPress={() => doRefund('REFUNDED')}
                    >
                      استرداد
                    </Button>
                  </View>
                </View>
                <Button variant='ghost' icon={X} onPress={() => setShowReason(false)}>
                  رجوع
                </Button>
              </View>
            ) : (
              <Button variant='destructive' onPress={() => setShowReason(true)} disabled={busy}>
                إلغاء / استرداد الطلب
              </Button>
            )}
          </Card>
        ) : null}
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
      <Text variant='caption' style={{ color: muted }}>
        {label}
      </Text>
      <Text style={{ fontWeight: strong ? '700' : '500' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: { padding: 6 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginLeft: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
});
