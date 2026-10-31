import { AdminScreen, ListRow, SearchField } from '@/components/app/AdminKit';
import { FilterSelect } from '@/components/app/FilterSelect';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import type { Ingredient } from '@/api/types';
import { useIngredients } from '@/hooks/queries/inventory';
import { useReport } from '@/hooks/queries/reports';
import { useColor } from '@/hooks/useColor';
import { ymd } from '@/lib/dateRanges';
import { fmtMoneyInt, fmtQty, UNIT_LABELS } from '@/lib/format';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ClipboardList,
  LayoutGrid,
  Table2,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, type ViewStyle } from 'react-native';

interface TurnoverRow {
  ingredientId: string;
  name: string;
  unit: string;
  consumptionUnits: number;
  cogsPeriod?: number;
}

interface TurnoverReport {
  rows: TurnoverRow[];
  totalCogs?: number;
}

type SortKey = 'name' | 'stock' | 'min' | 'value';
type SortDir = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';

const PAGE_SIZE = 15;

const STATUS_OPTIONS = [
  { value: '', label: 'كل الحالات' },
  { value: 'ok', label: 'متوفر' },
  { value: 'low', label: 'تحت الحد' },
  { value: 'out', label: 'خلصت' },
];

const SORT_OPTIONS = [
  { value: 'name:asc', label: 'الاسم أ-ي' },
  { value: 'name:desc', label: 'الاسم ي-أ' },
  { value: 'stock:asc', label: 'الأقل رصيدًا' },
  { value: 'stock:desc', label: 'الأكثر رصيدًا' },
  { value: 'value:desc', label: 'الأعلى قيمة' },
  { value: 'value:asc', label: 'الأقل قيمة' },
];

const valueOf = (row: Ingredient) =>
  Math.max(0, Number(row.stockQuantity) || 0) * (Number(row.costPerUnit) || 0);

const sortValueOf = (row: Ingredient, key: SortKey) => {
  if (key === 'name') return row.name;
  if (key === 'stock') return Number(row.stockQuantity) || 0;
  if (key === 'min') return Number(row.minStock) || 0;
  return valueOf(row);
};

export default function InventoryCountScreen() {
  const router = useRouter();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const text = useColor('text');
  const green = useColor('green');
  const red = useColor('red');
  const warning = useColor('warning');
  const border = useColor('border');
  const secondary = useColor('secondary');

  const today = ymd(new Date());
  const ingredients = useIngredients();
  const dailyTurnover = useReport<TurnoverReport>('inventory-turnover', { from: today, to: today });
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [unit, setUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [view, setView] = useState<ViewMode>('table');
  const [page, setPage] = useState(1);

  const rows = ingredients.data?.ingredients ?? [];
  const stockValue = rows.reduce((sum, row) => sum + valueOf(row), 0);
  const belowMin = rows.filter(
    (row) => Number(row.stockQuantity) > 0 && Number(row.stockQuantity) <= Number(row.minStock)
  ).length;
  const outOfStock = rows.filter((row) => Number(row.stockQuantity) <= 0).length;
  const dailyConsumptionCost =
    dailyTurnover.data?.report?.totalCogs ??
    (dailyTurnover.data?.report?.rows ?? []).reduce((sum, row) => sum + (row.cogsPeriod ?? 0), 0);

  const unitOptions = [
    { value: '', label: 'كل الوحدات' },
    ...Array.from(new Set(rows.map((row) => row.unit)))
      .filter(Boolean)
      .map((value) => ({ value, label: UNIT_LABELS[value] || value })),
  ];

  const supplierOptions = [
    { value: '', label: 'كل الموردين' },
    { value: '__none__', label: 'بدون مورد' },
    ...Array.from(new Set(rows.map((row) => row.supplier)))
      .filter((value): value is string => Boolean(value))
      .map((value) => ({ value, label: value })),
  ];

  const query = search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (query && !row.name.toLowerCase().includes(query)) return false;
    if (unit && row.unit !== unit) return false;
    if (supplier === '__none__') {
      if (row.supplier) return false;
    } else if (supplier && row.supplier !== supplier) {
      return false;
    }
    const stock = Number(row.stockQuantity) || 0;
    const min = Number(row.minStock) || 0;
    if (status === 'out') return stock <= 0;
    if (status === 'low') return stock > 0 && stock <= min;
    if (status === 'ok') return stock > min;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    const left = sortValueOf(a, sortKey);
    const right = sortValueOf(b, sortKey);
    const dir = sortDir === 'asc' ? 1 : -1;
    if (typeof left === 'string' || typeof right === 'string') {
      return String(left).localeCompare(String(right), 'ar') * dir;
    }
    return (left - right) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, status, unit, supplier, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const sortValue = `${sortKey}:${sortDir}`;
  const onSortChange = (value: string) => {
    const [key, dir] = value.split(':');
    setSortKey(key as SortKey);
    setSortDir(dir === 'desc' ? 'desc' : 'asc');
  };

  const hasFilters = Boolean(query || status || unit || supplier || sortKey !== 'name' || sortDir !== 'asc');
  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setUnit('');
    setSupplier('');
    setSortKey('name');
    setSortDir('asc');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([ingredients.refetch(), dailyTurnover.refetch()]);
    setRefreshing(false);
  };

  return (
    <AdminScreen
      title='الجرد'
      subtitle={`${rows.length} مادة · ${belowMin} تحت الحد`}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      <Card style={styles.card}>
        <View style={styles.headRow}>
          <View style={[styles.iconWrap, { backgroundColor: `${primary}1A` }]}>
            <ClipboardList size={14} color={primary} />
          </View>
          <Text variant='subtitle' style={styles.headTitle}>
            إحصائيات الجرد
          </Text>
        </View>
        <View style={styles.statRow}>
          <Stat label='قيمة المخزون' value={`${fmtMoneyInt(stockValue)} ج.م`} color={primary} muted={muted} />
          <Stat label='عدد المواد' value={String(rows.length)} color={primary} muted={muted} />
        </View>
        <View style={styles.statRow}>
          <Stat label='تحت الحد' value={String(belowMin)} color={belowMin > 0 ? warning : green} muted={muted} />
          <Stat label='خلصت' value={String(outOfStock)} color={outOfStock > 0 ? red : green} muted={muted} />
        </View>
        <View style={[styles.statRow, styles.statDivider, { borderColor: border }]}>
          <Stat
            label='استهلاك النهاردة'
            value={`${fmtMoneyInt(dailyConsumptionCost)} ج.م`}
            color={primary}
            muted={muted}
          />
        </View>
      </Card>

      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchField value={search} onChange={setSearch} placeholder='ابحث عن مادة…' />
        </View>
        <View style={[styles.viewToggle, { backgroundColor: secondary }]}>
          <Pressable
            onPress={() => setView('table')}
            accessibilityRole='button'
            accessibilityLabel='عرض الجدول'
            style={[styles.viewBtn, view === 'table' && { backgroundColor: primary }]}
          >
            <Table2 size={15} color={view === 'table' ? '#0F0A03' : muted} />
          </Pressable>
          <Pressable
            onPress={() => setView('cards')}
            accessibilityRole='button'
            accessibilityLabel='عرض الكروت'
            style={[styles.viewBtn, view === 'cards' && { backgroundColor: primary }]}
          >
            <LayoutGrid size={15} color={view === 'cards' ? '#0F0A03' : muted} />
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <FilterSelect label='الحالة' value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <FilterSelect label='الوحدة' value={unit} options={unitOptions} onChange={setUnit} />
        <FilterSelect label='المورد' value={supplier} options={supplierOptions} onChange={setSupplier} />
        <FilterSelect label='الترتيب' value={sortValue} options={SORT_OPTIONS} onChange={onSortChange} />
        {hasFilters ? (
          <Pressable onPress={clearFilters} style={[styles.clearChip, { borderColor: border }]}>
            <Text variant='caption' style={{ color: muted, fontWeight: '700' }}>
              مسح
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {ingredients.isLoading ? (
        <Skeleton height={280} style={{ borderRadius: 18 }} />
      ) : view === 'table' ? (
        <Card style={styles.table}>
          <View style={[styles.tableHead, { borderColor: border }]}>
            <HeadCell
              label='المادة'
              colStyle={styles.headName}
              align='end'
              active={sortKey === 'name'}
              dir={sortDir}
              onPress={() => toggleSort('name')}
            />
            <HeadCell
              label='الرصيد'
              colStyle={styles.headQty}
              align='center'
              active={sortKey === 'stock'}
              dir={sortDir}
              onPress={() => toggleSort('stock')}
            />
            <HeadCell
              label='الحد'
              colStyle={styles.headMin}
              align='center'
              active={sortKey === 'min'}
              dir={sortDir}
              onPress={() => toggleSort('min')}
            />
            <HeadCell
              label='القيمة'
              colStyle={styles.headValue}
              align='center'
              active={sortKey === 'value'}
              dir={sortDir}
              onPress={() => toggleSort('value')}
            />
          </View>

          {pageRows.length === 0 ? (
            <Text variant='caption' style={[styles.empty, { color: muted }]}>
              {rows.length === 0 ? 'لسه مفيش مواد' : 'مفيش مواد مطابقة'}
            </Text>
          ) : (
            pageRows.map((row, index) => {
              const stock = Number(row.stockQuantity) || 0;
              const low = stock <= Number(row.minStock);
              const unitLabel = UNIT_LABELS[row.unit] || row.unit;
              return (
                <Pressable
                  key={row.id}
                  onPress={() => router.push(`/manage/ingredient?id=${row.id}`)}
                  style={[
                    styles.tableRow,
                    {
                      borderColor: border,
                      borderBottomWidth: index === pageRows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Text style={[styles.cell, styles.nameCol, { color: text }]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={[styles.cell, styles.qtyCol, { color: low ? red : text }]} numberOfLines={1}>
                    {fmtQty(stock)} {unitLabel}
                  </Text>
                  <Text style={[styles.cell, styles.minCol, { color: muted }]} numberOfLines={1}>
                    {fmtQty(row.minStock)}
                  </Text>
                  <Text style={[styles.cell, styles.valueCol, { color: muted }]} numberOfLines={1}>
                    {fmtMoneyInt(valueOf(row))}
                  </Text>
                </Pressable>
              );
            })
          )}
        </Card>
      ) : pageRows.length === 0 ? (
        <Text variant='caption' style={[styles.empty, { color: muted }]}>
          {rows.length === 0 ? 'لسه مفيش مواد' : 'مفيش مواد مطابقة'}
        </Text>
      ) : (
        <View style={styles.cardList}>
          {pageRows.map((row) => {
            const stock = Number(row.stockQuantity) || 0;
            const low = stock <= Number(row.minStock);
            const unitLabel = UNIT_LABELS[row.unit] || row.unit;
            return (
              <Card key={row.id}>
                <ListRow
                  title={row.name}
                  subtitle={`الحد ${fmtQty(row.minStock)} ${unitLabel} · ${fmtMoneyInt(valueOf(row))} ج.م`}
                  tint={low ? red : muted}
                  onPress={() => router.push(`/manage/ingredient?id=${row.id}`)}
                  trailing={
                    <View style={styles.cardTrailing}>
                      <Text style={[styles.cardQty, { color: low ? red : text }]}>
                        {fmtQty(stock)} {unitLabel}
                      </Text>
                      {low ? <AlertTriangle size={14} color={red} /> : null}
                    </View>
                  }
                />
              </Card>
            );
          })}
        </View>
      )}

      <View style={styles.footer}>
        <Text variant='caption' style={{ color: muted }}>
          {sorted.length === 0 ? '0 مادة' : `${start + 1}–${start + pageRows.length} من ${sorted.length}`}
        </Text>
        {totalPages > 1 ? (
          <View style={styles.pager}>
            <Pressable
              disabled={safePage <= 1}
              onPress={() => setPage(safePage - 1)}
              style={[styles.pageBtn, { borderColor: border, opacity: safePage <= 1 ? 0.35 : 1 }]}
            >
              <Text variant='caption' style={{ fontWeight: '700' }}>
                السابق
              </Text>
            </Pressable>
            <Text variant='caption' style={{ color: muted }}>
              {safePage} / {totalPages}
            </Text>
            <Pressable
              disabled={safePage >= totalPages}
              onPress={() => setPage(safePage + 1)}
              style={[styles.pageBtn, { borderColor: border, opacity: safePage >= totalPages ? 0.35 : 1 }]}
            >
              <Text variant='caption' style={{ fontWeight: '700' }}>
                التالي
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </AdminScreen>
  );
}

function HeadCell({
  label,
  colStyle,
  align,
  active,
  dir,
  onPress,
}: {
  label: string;
  colStyle: ViewStyle;
  align: 'end' | 'center';
  active: boolean;
  dir: SortDir;
  onPress: () => void;
}) {
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='button'
      style={[styles.thCell, colStyle, { justifyContent: align === 'end' ? 'flex-end' : 'center' }]}
    >
      <Text style={styles.th}>{label}</Text>
      {active ? (
        dir === 'asc' ? (
          <ArrowUp size={11} color={primary} />
        ) : (
          <ArrowDown size={11} color={primary} />
        )
      ) : (
        <ChevronsUpDown size={11} color={muted} />
      )}
    </Pressable>
  );
}

function Stat({
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
    <View style={styles.stat}>
      <Text variant='caption' style={{ color: muted }}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  headRow: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: 7 },
  headTitle: { flex: 1, textAlign: 'right', writingDirection: 'rtl' },
  iconWrap: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statRow: { flexDirection: 'row', direction: 'rtl', gap: 12 },
  stat: { flex: 1, minWidth: 0, gap: 2, alignItems: 'flex-start' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statDivider: { borderTopWidth: 1, paddingTop: 10 },
  searchRow: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: 8 },
  searchFlex: { flex: 1, minWidth: 0 },
  viewToggle: { flexDirection: 'row', gap: 2, borderRadius: 12, padding: 3 },
  viewBtn: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  filterRow: { gap: 8, alignItems: 'center' },
  clearChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  table: { padding: 0, overflow: 'hidden' },
  tableHead: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  thCell: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  th: { fontSize: 10, fontWeight: '700' },
  headName: { flex: 2, minWidth: 0 },
  headQty: { flex: 1.25 },
  headMin: { flex: 0.75 },
  headValue: { flex: 1 },
  tableRow: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cell: { fontSize: 11, fontWeight: '600' },
  nameCol: { flex: 2, minWidth: 0, textAlign: 'right', writingDirection: 'rtl' },
  qtyCol: { flex: 1.25, textAlign: 'center' },
  minCol: { flex: 0.75, textAlign: 'center' },
  valueCol: { flex: 1, textAlign: 'center' },
  cardList: { gap: 10 },
  cardTrailing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardQty: { fontSize: 12, fontWeight: '800', writingDirection: 'ltr' },
  empty: { textAlign: 'center', paddingVertical: 24 },
  footer: {
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
});
