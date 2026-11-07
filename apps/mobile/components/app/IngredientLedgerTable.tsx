import { DatePicker } from '@/components/app/DatePicker';
import { FilterSelect } from '@/components/app/FilterSelect';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useIngredientLedger } from '@/hooks/queries/inventory';
import { useOrder } from '@/hooks/queries/orders';
import { useColor } from '@/hooks/useColor';
import { ymd } from '@/lib/dateRanges';
import { fmtMoneyInt, fmtQty, UNIT_LABELS } from '@/lib/format';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

const PAGE_SIZE = 10;
const TODAY = () => ymd(new Date());

const TYPE_OPTIONS = [
  { value: '', label: 'كل الحركات' },
  { value: 'PURCHASE', label: 'شراء' },
  { value: 'CONSUMPTION', label: 'استهلاك' },
  { value: 'RETURN', label: 'إرجاع' },
  { value: 'WASTE', label: 'تالف' },
  { value: 'ADJUSTMENT', label: 'تسوية' },
];

const stampOf = (createdAt: string) => {
  const value = String(createdAt ?? '');
  const date = value.slice(0, 10);
  const [, month, day] = date.split('-');
  return {
    day: day && month ? `${day}/${month}` : date,
    time: value.length >= 16 ? value.slice(11, 16) : '',
  };
};

/**
 * The full movement history of one material. Paging and filtering are done by
 * the server: the table shows one page at a time and the pagination footer
 * moves between the filtered pages, so a long ledger stays cheap on the phone.
 */
export function IngredientLedgerTable({
  ingredientId,
  unit,
  refreshToken = 0,
}: {
  ingredientId: string;
  unit: string;
  /** Bumped by the parent after a manual movement, so the table returns to the
   * newest page instead of staying on whatever page the owner was reading. */
  refreshToken?: number;
}) {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const text = useColor('text');
  const border = useColor('border');
  const green = useColor('green');
  const red = useColor('red');
  const warning = useColor('warning');
  const blue = useColor('blue');

  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [refreshToken]);

  useEffect(() => {
    setExpandedOrder(null);
  }, [page, type, from, to, refreshToken]);

  const ledgerQuery = useIngredientLedger(ingredientId, {
    page,
    pageSize: PAGE_SIZE,
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const ledger = ledgerQuery.data?.ledger;
  const movements = ledger?.movements ?? [];
  const total = ledger?.total ?? 0;
  const currentPage = ledger?.page ?? page;
  const totalPages = ledger?.totalPages ?? 1;
  const hasFilters = Boolean(type || from || to);
  const unitLabel = UNIT_LABELS[ledger?.ingredient?.unit ?? unit] ?? unit;

  const typeMeta: Record<string, { label: string; color: string }> = {
    PURCHASE: { label: 'شراء', color: green },
    CONSUMPTION: { label: 'استهلاك', color: red },
    WASTE: { label: 'تالف', color: warning },
    ADJUSTMENT: { label: 'تسوية', color: primary },
    RETURN: { label: 'إرجاع', color: blue },
  };

  const changeType = (value: string) => {
    setType(value);
    setPage(1);
  };
  const changeFrom = (value: string) => {
    setFrom(value);
    setPage(1);
  };
  const changeTo = (value: string) => {
    setTo(value);
    setPage(1);
  };
  const clearFilters = () => {
    setType('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <FilterSelect label='النوع' value={type} options={TYPE_OPTIONS} onChange={changeType} />
        <DatePicker
          label='من تاريخ'
          value={from}
          onChange={changeFrom}
          maxDate={to || TODAY()}
        />
        <DatePicker
          label='إلى تاريخ'
          value={to}
          onChange={changeTo}
          minDate={from || undefined}
          maxDate={TODAY()}
        />
        {hasFilters ? (
          <Pressable onPress={clearFilters} style={[styles.clear, { borderColor: border }]}>
            <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
              مسح
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[styles.table, { borderColor: border }]}>
        <View style={[styles.head, { borderColor: border }]}>
          <Text style={[styles.th, styles.dateCol, { color: muted }]}>التاريخ</Text>
          <Text style={[styles.th, styles.typeCol, { color: muted }]}>النوع</Text>
          <Text style={[styles.th, styles.qtyCol, { color: muted }]}>الكمية</Text>
          <Text style={[styles.th, styles.balanceCol, { color: muted }]}>الرصيد</Text>
        </View>

        {ledgerQuery.isLoading && !ledger ? (
          <View style={styles.loading}>
            <ActivityIndicator color={primary} />
          </View>
        ) : ledgerQuery.isError ? (
          <Text variant='caption' style={[styles.empty, { color: red }]}>
            تعذّر تحميل سجل الحركة
          </Text>
        ) : movements.length === 0 ? (
          <Text variant='caption' style={[styles.empty, { color: muted }]}>
            {hasFilters ? 'مفيش حركات مطابقة للفلاتر' : 'مفيش حركات مسجّلة'}
          </Text>
        ) : (
          movements.map((movement, index) => {
            const meta = typeMeta[movement.type] ?? { label: movement.type, color: muted };
            const stamp = stampOf(movement.createdAt);
            const expanded = Boolean(
              movement.referenceOrderId && expandedOrder === movement.referenceOrderId
            );
            return (
              <React.Fragment key={movement.id}>
                <View
                  style={[
                    styles.row,
                    {
                      borderColor: border,
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      opacity: ledgerQuery.isFetching ? 0.65 : 1,
                    },
                  ]}
                >
                  <View style={styles.dateCol}>
                    <Text style={[styles.date, { color: text }]}>{stamp.day}</Text>
                    <Text style={[styles.time, { color: muted }]}>{stamp.time}</Text>
                  </View>
                  <View style={styles.typeCol}>
                    <View style={[styles.badge, { backgroundColor: `${meta.color}1A` }]}>
                      <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    {movement.note ? (
                      <Text numberOfLines={1} style={[styles.note, { color: muted }]}>
                        {movement.note}
                      </Text>
                    ) : null}
                    {movement.supplier ? (
                      <Text numberOfLines={1} style={[styles.note, { color: muted }]}>
                        {movement.supplier}
                      </Text>
                    ) : null}
                    {movement.referenceOrderId ? (
                      <Pressable
                        onPress={() =>
                          setExpandedOrder(expanded ? null : movement.referenceOrderId)
                        }
                        style={styles.orderLink}
                        accessibilityRole='button'
                        accessibilityLabel={`تفاصيل طلب ${movement.referenceOrderId}`}
                      >
                        <Text
                          numberOfLines={1}
                          style={[styles.note, { color: primary, fontWeight: '700' }]}
                        >
                          من طلب {movement.referenceOrderId}
                        </Text>
                        {expanded ? (
                          <ChevronUp size={12} color={primary} />
                        ) : (
                          <ChevronDown size={12} color={primary} />
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.qty,
                      { color: movement.quantity >= 0 ? green : red },
                    ]}
                  >
                    {movement.quantity > 0 ? '+' : ''}
                    {fmtQty(movement.quantity)}
                  </Text>
                  <Text style={[styles.balance, { color: text }]}>
                    {fmtQty(movement.balance)}
                  </Text>
                </View>

                {expanded && movement.referenceOrderId ? (
                  <View style={[styles.orderPanel, { borderColor: border }]}>
                    <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
                      أصناف الطلب {movement.referenceOrderId}
                    </Text>
                    <LedgerOrderDetails orderId={movement.referenceOrderId} />
                  </View>
                ) : null}
              </React.Fragment>
            );
          })
        )}

        {movements.length > 0 ? (
          <View style={[styles.summary, { borderColor: border }]}>
            <Text variant='caption' style={{ color: muted }}>
              رصيد افتتاحي {fmtQty(ledger?.openingBalance)} {unitLabel}
            </Text>
            <Text variant='caption' style={{ color: primary, fontWeight: '800' }}>
              الحالي {fmtQty(ledger?.currentStock)} {unitLabel}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.pager}>
        <Text variant='caption' style={{ color: muted }}>
          {total === 0
            ? '0 حركة'
            : `${movements.length} من ${total} · صفحة ${currentPage}/${totalPages}`}
        </Text>
        {totalPages > 1 ? (
          <View style={styles.pageRow}>
            <Pressable
              disabled={currentPage <= 1}
              onPress={() => setPage(currentPage - 1)}
              style={[
                styles.pageBtn,
                { borderColor: border, opacity: currentPage <= 1 ? 0.35 : 1 },
              ]}
            >
              <Text variant='caption' style={{ fontWeight: '700' }}>
                السابق
              </Text>
            </Pressable>
            <Pressable
              disabled={currentPage >= totalPages}
              onPress={() => setPage(currentPage + 1)}
              style={[
                styles.pageBtn,
                { borderColor: border, opacity: currentPage >= totalPages ? 0.35 : 1 },
              ]}
            >
              <Text variant='caption' style={{ fontWeight: '700' }}>
                التالي
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function LedgerOrderDetails({ orderId }: { orderId: string }) {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const text = useColor('text');
  const red = useColor('red');
  const orderQuery = useOrder(orderId);
  const order = orderQuery.data?.order;

  if (orderQuery.isLoading) {
    return (
      <View style={{ paddingVertical: 8, alignItems: 'center' }}>
        <ActivityIndicator color={primary} size='small' />
      </View>
    );
  }
  if (orderQuery.isError || !order) {
    return (
      <Text variant='caption' style={{ color: red }}>
        تعذّر تحميل تفاصيل الطلب
      </Text>
    );
  }
  const items = order.items ?? [];
  if (items.length === 0) {
    return (
      <Text variant='caption' style={{ color: muted }}>
        الطلب بدون أصناف
      </Text>
    );
  }
  return (
    <View style={{ gap: 5 }}>
      {items.map((item) => (
        <View key={item.id} style={styles.orderItem}>
          <Text variant='caption' style={{ color: text, flex: 1 }} numberOfLines={2}>
            {item.productEmoji ?? ''} {item.productName ?? 'صنف'} ×{item.quantity}
            {item.note ? `  — ${item.note}` : ''}
          </Text>
          <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
            {fmtMoneyInt((Number(item.unitPrice) || 0) * (Number(item.quantity) || 0))} ج.م
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  filters: { gap: 8, alignItems: 'center' },
  clear: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  table: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  th: { fontSize: 10, fontWeight: '800' },
  dateCol: { width: 58, textAlign: 'right' },
  typeCol: { flex: 1, minWidth: 0, textAlign: 'right' },
  qtyCol: { width: 58, textAlign: 'center' },
  balanceCol: { width: 58, textAlign: 'center' },
  loading: { paddingVertical: 24, alignItems: 'center' },
  empty: { textAlign: 'center', paddingVertical: 20 },
  row: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  date: { fontSize: 10, fontWeight: '700', writingDirection: 'ltr' },
  time: { fontSize: 9, writingDirection: 'ltr' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 9, fontWeight: '800' },
  note: { fontSize: 9, marginTop: 2, writingDirection: 'rtl' },
  orderLink: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  orderPanel: {
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  orderItem: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    gap: 8,
  },
  qty: { fontSize: 11, fontWeight: '800', textAlign: 'center', writingDirection: 'ltr' },
  balance: { fontSize: 10, fontWeight: '700', textAlign: 'center', writingDirection: 'ltr' },
  summary: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  pager: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
});
