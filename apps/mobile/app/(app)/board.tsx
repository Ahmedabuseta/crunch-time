import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_LABELS,
  fmtMoneyInt,
  fmtTime,
} from '@/lib/format';
import { useOrderFeed } from '@/lib/useOrderFeed';
import { TAB_BAR_SPACE } from '@/theme/globals';
import type { Order } from '@/api/types';
import { useRouter } from 'expo-router';
import { ChefHat, Radio, ShoppingBag, Truck, UtensilsCrossed } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Filter = { key: string; label: string };

const FILTERS: Filter[] = [
  { key: '', label: 'الكل' },
  { key: 'COMPLETED', label: ORDER_STATUS_LABELS.COMPLETED },
  { key: 'CANCELLED', label: ORDER_STATUS_LABELS.CANCELLED },
  { key: 'REFUNDED', label: ORDER_STATUS_LABELS.REFUNDED },
];

export default function BoardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState('');
  const { orders, loading, error, live, reload } = useOrderFeed(status);

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const card = useColor('card');
  const secondary = useColor('secondary');
  const green = useColor('green');
  const red = useColor('red');
  const warning = useColor('warning');

  const statusColor: Record<string, string> = {
    COMPLETED: green,
    CANCELLED: red,
    REFUNDED: warning,
  };

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: TAB_BAR_SPACE + 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant='title'>الطلبات</Text>
          <Text variant='caption' style={{ color: muted }}>
            {orders.length} طلب {status ? `— ${ORDER_STATUS_LABELS[status] ?? ''}` : ''}
          </Text>
        </View>
        <View
          style={[
            styles.livePill,
            { backgroundColor: live ? `${green}22` : secondary },
          ]}
        >
          <Radio size={13} color={live ? green : muted} />
          <Text variant='caption' style={{ color: live ? green : muted, fontSize: 12 }}>
            {live ? 'مباشر' : 'غير متصل'}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((f) => {
          const active = status === f.key;
          return (
            <Pressable
              key={f.key || 'all'}
              onPress={() => setStatus(f.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? primary : card,
                  borderColor: active ? primary : border,
                },
              ]}
            >
              <Text
                variant='caption'
                style={{ color: active ? '#0F0A03' : muted, fontWeight: '600' }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? (
        <Text variant='caption' style={{ color: red, textAlign: 'center', paddingHorizontal: 20 }}>
          {error}
        </Text>
      ) : null}

      {loading ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} style={{ borderRadius: 18 }} />
          ))}
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.empty}>
          <ChefHat size={40} color={muted} />
          <Text variant='subtitle'>لا توجد طلبات</Text>
          <Text variant='caption' style={{ color: muted, textAlign: 'center' }}>
            {status ? 'مفيش طلبات بالحالة دي' : 'أول ما يتعمل طلب هيظهر هنا على طول'}
          </Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              statusColor={statusColor[order.status] ?? muted}
              muted={muted}
              primary={primary}
              onPress={() => router.push(`/order/${order.id}`)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function OrderCard({
  order,
  statusColor,
  muted,
  primary,
  onPress,
}: {
  order: Order;
  statusColor: string;
  muted: string;
  primary: string;
  onPress: () => void;
}) {
  const TypeIcon =
    order.orderType === 'delivery'
      ? Truck
      : order.orderType === 'takeaway'
        ? ShoppingBag
        : UtensilsCrossed;

  return (
    <Pressable onPress={onPress}>
      <Card style={{ gap: 8 }}>
        <View style={styles.row}>
          <Text style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{order.id}</Text>
          <View
            style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}
          >
            <Text variant='caption' style={{ color: statusColor, fontWeight: '700', fontSize: 12 }}>
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TypeIcon size={14} color={muted} />
            <Text variant='caption' style={{ color: muted }}>
              {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
              {order.deliveryZoneName ? ` · ${order.deliveryZoneName}` : ''}
            </Text>
            {order.driverStatus ? (
              <Text variant='caption' style={{ color: muted }}>
                · {order.driverStatus === 'assigned' ? order.deliveryProfileName || 'مع سائق' : 'بدون سائق'}
              </Text>
            ) : null}
          </View>
          <Text variant='caption' style={{ color: muted }}>
            {fmtTime(order.createdAt)}
          </Text>
        </View>

        <View style={styles.row}>
          <Text variant='caption' style={{ color: muted }}>
            {PAYMENT_LABELS[order.paymentType] ?? order.paymentType} · {order.items?.length ?? 0} صنف
          </Text>
          <Text style={{ fontWeight: '700', color: primary }}>
            {fmtMoneyInt(order.total)} ج.م
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  filters: { gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  empty: { alignItems: 'center', gap: 8, paddingTop: 60, paddingHorizontal: 32 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
