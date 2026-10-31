import { api } from '@/api/endpoints';
import type { DeliveryProfile, Order } from '@/api/types';
import { FilterSelect } from '@/components/app/FilterSelect';
import { HomeDashboard } from '@/components/app/HomeDashboard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { usePagedQuery } from '@/hooks/queries/paged';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { STALE } from '@/lib/cachePolicy';
import { DATE_PRESETS, dateRange, type DatePreset } from '@/lib/dateRanges';
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_LABELS,
  fmtMoneyInt,
  fmtTime,
} from '@/lib/format';
import { rangeLabel } from '@/lib/listQuery';
import { qk, qkPrefix } from '@/lib/queryKeys';
import { useOrderSocket } from '@/lib/useOrderSocket';
import { TAB_BAR_SPACE } from '@/theme/globals';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ChefHat, Radio, ShoppingBag, Sparkles, Truck, UtensilsCrossed } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Sentinel for "delivery with no driver assigned yet". */
const NO_DRIVER = 'NONE';

const STATUS_OPTIONS = [
  { value: '', label: 'كل الحالات' },
  { value: 'COMPLETED', label: ORDER_STATUS_LABELS.COMPLETED },
  { value: 'CANCELLED', label: ORDER_STATUS_LABELS.CANCELLED },
  { value: 'REFUNDED', label: ORDER_STATUS_LABELS.REFUNDED },
];

const TYPE_OPTIONS = [
  { value: '', label: 'كل الأنواع' },
  { value: 'dine-in', label: 'صالة' },
  { value: 'takeaway', label: 'تيك أوي' },
  { value: 'delivery', label: 'توصيل' },
];

export default function BoardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [drivers, setDrivers] = useState<DeliveryProfile[]>([]);
  const [driverFilter, setDriverFilter] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('');
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);

  const { live } = useOrderSocket();
  const online = useOnlineStatus();
  const connected = live && online;

  // Server-side paging: status/type/date are filters, so changing one changes
  // the query key and the list restarts from page one. The rows already loaded
  // are re-read on a live event (see useOrderSocket).
  const load = useCallback(
    (params: Record<string, string | number | undefined>) =>
      api
        .orders(params as Parameters<typeof api.orders>[0])
        .then((res) => ({ items: res.orders, total: res.total, hasMore: res.hasMore })),
    []
  );

  const paged = usePagedQuery<Order>({
    keyFor: (query) => qk.paged('orders', query),
    load,
    initialSort: 'createdAt',
    initialDir: 'desc',
    pageSize: 30,
    staleTime: STALE.live,
  });

  const { filters, setFilter, setFilters } = paged;

  useEffect(() => {
    void api
      .deliveryProfiles()
      .then((res) => setDrivers(res.profiles))
      .catch(() => {});
  }, []);

  // Driver is not a server filter, so it narrows the rows already loaded.
  const orders = driverFilter
    ? paged.items.filter((order) => {
        if (driverFilter === NO_DRIVER) {
          return order.orderType === 'delivery' && !order.deliveryProfileId;
        }
        return order.deliveryProfileId === driverFilter;
      })
    : paged.items;

  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const border = useColor('border');
  const secondary = useColor('secondary');
  const green = useColor('green');
  const red = useColor('red');
  const warning = useColor('warning');

  const statusColor: Record<string, string> = {
    COMPLETED: green,
    CANCELLED: red,
    REFUNDED: warning,
  };

  const driverOptions = [
    { value: '', label: 'كل السائقين' },
    { value: NO_DRIVER, label: 'بدون سائق' },
    ...drivers.map((d) => ({ value: d.id, label: d.name })),
  ];

  const hasFilters = Boolean(filters.status || filters.orderType || driverFilter || datePreset);

  const clearFilters = () => {
    setFilters({});
    setDriverFilter('');
    setDatePreset('');
  };

  const onDate = (value: string) => {
    const preset = value as DatePreset;
    setDatePreset(preset);
    const { from, to } = dateRange(preset);
    setFilters((prev) => ({ ...prev, from, to }));
  };

  const onRefresh = async () => {
    setDashboardRefreshing(true);
    try {
      await Promise.all([
        paged.refresh(),
        queryClient.invalidateQueries({ queryKey: qkPrefix.reports() }),
        queryClient.invalidateQueries({ queryKey: qkPrefix.ingredients() }),
      ]);
    } finally {
      setDashboardRefreshing(false);
    }
  };

  // Fetch the next page before the list visibly reaches the bottom.
  const NEAR_BOTTOM = 240;
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!paged.hasMore || paged.loadingMore) return;
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const remaining = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (remaining < NEAR_BOTTOM) paged.loadMore();
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: TAB_BAR_SPACE + 16, direction: 'rtl' }}
      onScroll={onScroll}
      scrollEventThrottle={160}
      refreshControl={
        <RefreshControl
          refreshing={paged.refreshing || dashboardRefreshing}
          onRefresh={onRefresh}
          tintColor={primary}
        />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant='title' style={styles.rtl}>الرئيسية</Text>
          <Text variant='caption' style={[styles.rtl, { color: muted }]}>
            ملخص البيزنس والطلبات
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/assistant')}
          hitSlop={10}
          accessibilityRole='button'
          accessibilityLabel='المساعد'
          style={[styles.assistantButton, { backgroundColor: `${primary}1F`, borderColor: `${primary}59` }]}
        >
          <Sparkles size={18} color={primary} />
        </Pressable>
        <View style={[styles.livePill, { backgroundColor: connected ? `${green}22` : secondary }]}>
          <Radio size={13} color={connected ? green : muted} />
          <Text variant='caption' style={[styles.rtl, { color: connected ? green : muted, fontSize: 12 }]}>
            {connected ? 'مباشر' : 'غير متصل'}
          </Text>
        </View>
      </View>

      <HomeDashboard />

      <View style={styles.ordersHeader}>
        <Text variant='subtitle' style={styles.rtl}>الطلبات</Text>
        <Text variant='caption' style={[styles.rtl, { color: muted }]}>
          {rangeLabel(paged.items.length, paged.total)}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <FilterSelect
          label='الحالة'
          value={filters.status ?? ''}
          options={STATUS_OPTIONS}
          onChange={(value) => setFilter('status', value)}
        />
        <FilterSelect
          label='النوع'
          value={filters.orderType ?? ''}
          options={TYPE_OPTIONS}
          onChange={(value) => setFilter('orderType', value)}
        />
        <FilterSelect
          label='السائق'
          value={driverFilter}
          options={driverOptions}
          onChange={setDriverFilter}
        />
        <FilterSelect
          label='التاريخ'
          value={datePreset}
          options={DATE_PRESETS}
          onChange={onDate}
        />
        {hasFilters ? (
          <Pressable onPress={clearFilters} style={[styles.clearChip, { borderColor: border }]}>
            <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
              مسح
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {paged.error ? (
        <Text variant='caption' style={[styles.rtl, { color: red, textAlign: 'center', paddingHorizontal: 20 }]}>
          {paged.error}
        </Text>
      ) : null}

      {paged.loading ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={96} style={{ borderRadius: 18 }} />
          ))}
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.empty}>
          <ChefHat size={40} color={muted} />
          <Text variant='subtitle' style={styles.rtl}>لا توجد طلبات</Text>
          <Text variant='caption' style={[styles.rtl, { color: muted, textAlign: 'center' }]}>
            {hasFilters ? 'مفيش طلبات بالفلاتر دي' : 'أول ما يتعمل طلب هيظهر هنا على طول'}
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

      {paged.loadingMore ? (
        <View style={styles.footer}>
          <ActivityIndicator color={primary} />
        </View>
      ) : paged.hasMore ? (
        <Pressable onPress={paged.loadMore} style={styles.footer}>
          <Text variant='caption' style={{ color: primary, fontWeight: '700' }}>
            حمّل المزيد
          </Text>
        </Pressable>
      ) : null}
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
          <Text style={[styles.id, { fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{order.id}</Text>
          <View
            style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}
          >
            <Text variant='caption' style={[styles.rtl, { color: statusColor, fontWeight: '700', fontSize: 12 }]}>
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TypeIcon size={14} color={muted} />
            <Text variant='caption' style={[styles.rtl, { color: muted }]}>
              {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
              {order.deliveryZoneName ? ` · ${order.deliveryZoneName}` : ''}
            </Text>
            {order.driverStatus ? (
              <Text variant='caption' style={[styles.rtl, { color: muted }]}>
                · {order.driverStatus === 'assigned' ? order.deliveryProfileName || 'مع سائق' : 'بدون سائق'}
              </Text>
            ) : null}
          </View>
          <Text variant='caption' style={[styles.time, { color: muted }]}>
            {fmtTime(order.createdAt)}
          </Text>
        </View>

        <View style={styles.row}>
          <Text variant='caption' style={[styles.rtl, { color: muted }]}>
            {PAYMENT_LABELS[order.paymentType] ?? order.paymentType} · {order.items?.length ?? 0} صنف
          </Text>
          <Text style={[styles.rtl, { fontWeight: '700', color: primary }]}>
            {fmtMoneyInt(order.total)} ج.م
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Everything on the board is Arabic; the explicit direction makes it right
  // even before the process-wide RTL flag has had its one restart.
  // React Native mirrors left/right under RTL; `ui/Text` undoes that once.
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  id: { textAlign: 'right', writingDirection: 'ltr' },
  time: { textAlign: 'left', writingDirection: 'ltr' },
  header: {
    flexDirection: 'row',
    direction: 'rtl',
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
  /** The assistant's door on the home screen — the way most owners will find it. */
  assistantButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 14, direction: 'rtl' },
  ordersHeader: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 10,
  },
  clearChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  footer: { paddingVertical: 18, alignItems: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 60, paddingHorizontal: 32 },
  row: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', justifyContent: 'space-between' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
