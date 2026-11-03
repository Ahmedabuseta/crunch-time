import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ClipboardList,
  Clock,
  Flame,
  Package,
  Percent,
  PieChart,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { FilterSelect } from '@/components/app/FilterSelect';
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useColor } from '@/hooks/useColor';
import { useIngredients } from '@/hooks/queries/inventory';
import { useDailySummary, useReport, useZReport } from '@/hooks/queries/reports';
import { daysBefore, startOfMonth, ymd } from '@/lib/dateRanges';
import {
  fmtMoneyInt,
  fmtQty,
  fmtTime,
  ORDER_TYPE_LABELS,
  PAYMENT_LABELS,
  UNIT_LABELS,
} from '@/lib/format';

interface PeriodSummary {
  from: string | null;
  to: string | null;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  costOfGoods: number;
  grossProfit: number;
}

interface ProfitSummary {
  from: string;
  to: string;
  revenue: number;
  netSales: number;
  costOfGoods: number;
  grossProfit: number;
  totalExpenses: number;
  fixedMonthlyExpenses: number;
  oneTimeExpenses: number;
  /** Stable ratio from the menu + last month's mix — not from today's sales. */
  contributionRatio: number;
  breakEvenBasis: 'mix' | 'menu';
  breakEvenRevenue: number;
  breakEvenProgress: number;
  breakEvenRemaining: number;
  netProfit: number;
}

interface TopItem {
  name: string;
  emoji: string;
  totalQuantity: number;
  totalRevenue: number;
}

interface HourlyRow {
  hour: number;
  orderCount: number;
  revenue: number;
}

interface HourBlock {
  startHour: number;
  endHour: number;
  orderCount: number;
  revenue: number;
}

interface HourlyReport {
  hourly: HourlyRow[];
  blocks: HourBlock[];
}

interface TurnoverRow {
  ingredientId: string;
  name: string;
  unit: string;
  consumptionUnits: number;
  cogsPeriod?: number;
}

interface ProductCostRow {
  productId: string;
  name: string;
  emoji: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

interface ProductCostReport {
  from: string | null;
  to: string | null;
  totalCost: number;
  rows: ProductCostRow[];
}

interface TurnoverReport {
  rows: TurnoverRow[];
  totalCogs?: number;
}

interface IngredientAlert {
  id: string;
  name: string;
  unit: string;
  stockQuantity: number;
  minStock: number;
}

interface RevenuePoint {
  date: string;
  revenue: number;
  orderCount: number;
}

interface PaymentRow {
  method: string;
  count: number;
  total: number;
}

interface OrderTypeSplit {
  delivery: { count: number; revenue: number; percentage: number };
  dineIn: { count: number; revenue: number; percentage: number };
  takeaway: { count: number; revenue: number; percentage: number };
}

interface VoidSummary {
  cancelCount: number;
  cancelAmount: number;
  refundCount: number;
  refundAmount: number;
  discountCount: number;
  discountAmount: number;
}

type IconType = React.ComponentType<{ size?: number; color?: string }>;

const WEEKDAYS = ['الأحد', 'الاتنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const PERIOD_OPTIONS = [
  { value: '30', label: 'آخر 30 يوم' },
  { value: '90', label: 'آخر 90 يوم' },
  { value: 'month', label: 'من أول الشهر' },
];

const BLOCK_OPTIONS = [
  { value: '2', label: 'كل ساعتين' },
  { value: '4', label: 'كل 4 ساعات' },
  { value: '6', label: 'كل 6 ساعات' },
  { value: '12', label: 'كل 12 ساعة' },
];

const PERIOD_LABELS: Record<string, string> = {
  '30': 'آخر 30 يوم',
  '90': 'آخر 90 يوم',
  month: 'من أول الشهر',
};

/** Isolates a value so digits, units and currency keep the Arabic order even
 * when the surrounding Text has no explicit base direction. */
const rtl = (text: string) => `\u2067${text}\u2069`;

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : rtl(`${fmtMoneyInt(value)} ج.م`);

const hourText = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'ص' : 'م'}`;

const blockRange = (block: HourBlock) =>
  rtl(`من ${hourText(block.startHour)} إلى ${hourText(block.endHour)}`);

export function HomeDashboard() {
  const router = useRouter();
  const primary = useColor('primary');
  const muted = useColor('mutedForeground');
  const text = useColor('text');
  const green = useColor('green');
  const red = useColor('red');
  const warning = useColor('warning');
  const blue = useColor('blue');
  const orange = useColor('orange');
  const purple = useColor('purple');
  const teal = useColor('teal');
  const indigo = useColor('indigo');
  const secondary = useColor('secondary');
  const border = useColor('border');

  const [peakPeriod, setPeakPeriod] = useState('30');
  const [peakBlock, setPeakBlock] = useState('4');

  const today = ymd(new Date());
  const monthStart = startOfMonth();
  const weekStart = ymd(daysBefore(6));

  // One filter drives the whole peak-period group: the days cards and the
  // hour cards all read from the same window and the same block size.
  const peakFrom =
    peakPeriod === 'month' ? monthStart : ymd(daysBefore(Number(peakPeriod) - 1));
  const peakDays =
    peakPeriod === 'month'
      ? Math.max(7, Number(today.slice(8, 10)))
      : Number(peakPeriod);
  const periodLabel = PERIOD_LABELS[peakPeriod] ?? PERIOD_LABELS['30'];

  const daily = useDailySummary(today);
  const week = useReport<PeriodSummary>('period', { from: weekStart, to: today });
  const month = useReport<PeriodSummary>('period', { from: monthStart, to: today });
  const profit = useReport<ProfitSummary>('profit', { to: today });
  const top = useReport<TopItem[]>('top-items', { limit: 5, from: monthStart, to: today });
  const turnover = useReport<TurnoverReport>('inventory-turnover', { from: monthStart, to: today });
  const productCosts = useReport<ProductCostReport>('product-costs', { from: today, to: today, limit: 5 });
  const ingredients = useIngredients();
  const hourly = useReport<HourlyReport>('hourly', { from: peakFrom, to: today, block: peakBlock });
  const alerts = useReport<IngredientAlert[]>('inventory-alerts');
  const trend = useReport<RevenuePoint[]>('revenue-trend', { days: peakDays });
  const shift = useZReport();
  const payments = useReport<PaymentRow[]>('payment-methods', { from: monthStart, to: today });
  const orderTypes = useReport<OrderTypeSplit>('order-type-split', { from: monthStart, to: today });
  const voids = useReport<VoidSummary>('voids', { from: monthStart, to: today });

  const summary = daily.data?.report;
  const weekReport = week.data?.report;
  const monthReport = month.data?.report;
  const profitReport = profit.data?.report;
  const topItems = (top.data?.report ?? []).slice(0, 5);
  // Rank by cost, not raw quantity: grams and pieces are not comparable, and
  // the cost is the number the owner is actually spending.
  const consumedItems = [...(turnover.data?.report?.rows ?? [])]
    .filter((row) => row.consumptionUnits > 0)
    .sort((a, b) => (b.cogsPeriod ?? 0) - (a.cogsPeriod ?? 0))
    .slice(0, 7);
  const productCostReport = productCosts.data?.report;
  const productCostRows = productCostReport?.rows ?? [];
  const lowStock = alerts.data?.report ?? [];
  const inventoryRows = ingredients.data?.ingredients ?? [];
  const stockValue = inventoryRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.stockQuantity) || 0) * (Number(row.costPerUnit) || 0),
    0
  );
  const outOfStock = inventoryRows.filter((row) => Number(row.stockQuantity) <= 0).length;
  const belowMin = inventoryRows.filter(
    (row) => Number(row.stockQuantity) > 0 && Number(row.stockQuantity) <= Number(row.minStock)
  ).length;
  // The total is stock × unit cost across every active ingredient. Show the
  // five that actually make up that total, not the first five by name.
  const inventoryValueRows = inventoryRows
    .map((row) => ({
      ...row,
      stockValue: Math.max(0, Number(row.stockQuantity) || 0) * (Number(row.costPerUnit) || 0),
    }))
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, 5);
  const paymentRows = payments.data?.report ?? [];
  const orderTypeReport = orderTypes.data?.report;
  const orderTypeRows = orderTypeReport
    ? [
        { key: 'delivery', label: ORDER_TYPE_LABELS.delivery, ...orderTypeReport.delivery },
        { key: 'dineIn', label: ORDER_TYPE_LABELS['dine-in'], ...orderTypeReport.dineIn },
        { key: 'takeaway', label: ORDER_TYPE_LABELS.takeaway, ...orderTypeReport.takeaway },
      ]
    : [];
  const voidReport = voids.data?.report;

  // Hour blocks: best and slowest block of the selected window, plus how the
  // best block compares with everything else in the day.
  const blocks = hourly.data?.report?.blocks ?? [];
  const soldBlocks = blocks.filter((block) => block.orderCount > 0 || block.revenue > 0);
  const sortedBlocks = [...soldBlocks].sort((a, b) => b.revenue - a.revenue);
  const bestBlock = sortedBlocks[0] ?? null;
  const leastBlock = soldBlocks.length > 1 ? sortedBlocks[sortedBlocks.length - 1] : null;
  const totalBlockRevenue = blocks.reduce((sum, block) => sum + block.revenue, 0);
  const bestShare =
    bestBlock && totalBlockRevenue > 0 ? bestBlock.revenue / totalBlockRevenue : 0;
  const otherBlocks = bestBlock
    ? soldBlocks.filter((block) => block !== bestBlock && block.revenue > 0)
    : [];
  const otherMean =
    otherBlocks.length > 0
      ? otherBlocks.reduce((sum, block) => sum + block.revenue, 0) / otherBlocks.length
      : 0;
  const bestRatio = otherMean > 0 ? (bestBlock ? bestBlock.revenue / otherMean : 0) : 0;

  // Today is still in progress, so it must not drag its weekday's average down
  // — the cards compare complete days over the selected period.
  const trendRows = (trend.data?.report ?? []).filter((row) => row.date !== today);
  const weekdayStats = WEEKDAYS.map((name, weekday) => {
    const points = trendRows.filter((row) => new Date(`${row.date}T12:00:00`).getDay() === weekday);
    return {
      name,
      avg: points.length > 0 ? points.reduce((sum, row) => sum + row.revenue, 0) / points.length : 0,
    };
  });
  const sortedWeekdays = [...weekdayStats].sort((a, b) => b.avg - a.avg);
  const bestDays = sortedWeekdays.slice(0, 3);
  const leastDays = [...sortedWeekdays].reverse().slice(0, 3);
  const maxDay = bestDays[0]?.avg ?? 0;
  const hasWeekdayData = weekdayStats.some((day) => day.avg > 0);

  const z = shift.data?.report ?? null;
  const revenue = profitReport?.revenue ?? 0;
  // Fixed monthly only, and the ratio is the stable one from the backend (menu
  // + last month's mix). Nothing here depends on today's orders, so the target
  // no longer moves with every sale.
  const fixed = profitReport?.fixedMonthlyExpenses ?? 0;
  const gross = profitReport?.grossProfit ?? 0;
  const margin = profitReport?.contributionRatio ?? 0;
  const breakEven = profitReport?.breakEvenRevenue ?? 0;
  const remaining = profitReport?.breakEvenRemaining ?? 0;
  const progress = profitReport?.breakEvenProgress ?? 0;
  const breakMessage = !profitReport
    ? '—'
    : fixed === 0
      ? 'مفيش مصروفات ثابتة'
      : margin <= 0
        ? 'التسعير مش بيغطي التكلفة'
        : remaining <= 0
          ? 'وصلت للتعادل'
          : `فاضل ${money(remaining)}`;
  const net = profitReport?.netProfit ?? 0;
  const marginPct = revenue > 0 ? (gross / revenue) * 100 : 0;

  const anyError = [
    daily,
    week,
    month,
    profit,
    top,
    turnover,
    productCosts,
    ingredients,
    hourly,
    alerts,
    trend,
    payments,
    orderTypes,
    voids,
  ].some((query) => query.isError);

  return (
    <View style={styles.wrap}>
      <BentoCard title='المبيعات' icon={TrendingUp} tint={primary} style={styles.full}>
        <Text variant='caption' style={styles.label}>مبيعات النهاردة</Text>
        <Text style={[styles.hero, { color: text }]}>{money(summary?.totalRevenue)}</Text>
        <Text variant='caption' style={styles.sub}>
          {summary
            ? rtl(`${summary.totalOrders} طلب · متوسط ${money(summary.avgOrderValue)}`)
            : '—'}
        </Text>
        <View style={styles.salesSplit}>
          <MiniStat label='آخر 7 أيام' value={money(weekReport?.totalRevenue)} />
          <MiniStat label='من أول الشهر' value={money(monthReport?.totalRevenue)} />
        </View>
        <View style={styles.metricsRow}>
          <MiniStat label='طلبات الأسبوع' value={weekReport ? String(weekReport.totalOrders) : '—'} />
          <MiniStat label='طلبات الشهر' value={monthReport ? String(monthReport.totalOrders) : '—'} />
        </View>
      </BentoCard>

      <View style={styles.row}>
        <BentoCard title='أكثر 5 منتجات مبيعًا' icon={Flame} tint={orange} style={styles.half}>
          {top.isLoading ? (
            <CardLoading color={muted} />
          ) : topItems.length === 0 ? (
            <Empty text='لسه مفيش مبيعات' />
          ) : (
            topItems.map((item, index) => (
              <View key={`${item.name}-${index}`} style={styles.listRow}>
                <Text style={[styles.rank, { color: muted }]}>{index + 1}</Text>
                <View style={styles.listMain}>
                  <Text style={[styles.listName, { color: text }]} numberOfLines={1}>
                    {item.emoji} {item.name}
                  </Text>
                  <Text variant='caption' style={styles.listSub}>
                    {money(item.totalRevenue)}
                  </Text>
                </View>
                <Text style={[styles.listQty, { color: text }]}>{rtl(fmtQty(item.totalQuantity))}</Text>
              </View>
            ))
          )}
        </BentoCard>

        <BentoCard title='أكثر 7 مواد استهلاكًا' icon={Package} tint={blue} style={styles.half}>
          {turnover.isLoading ? (
            <CardLoading color={muted} />
          ) : consumedItems.length === 0 ? (
            <Empty text='لسه مفيش استهلاك' />
          ) : (
            consumedItems.map((row, index) => (
              <View key={row.ingredientId} style={styles.listRow}>
                <Text style={[styles.rank, { color: muted }]}>{index + 1}</Text>
                <View style={styles.listMain}>
                  <Text style={[styles.consumedName, { color: text }]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text variant='caption' style={styles.listSub}>
                    {rtl(`${fmtQty(row.consumptionUnits)} ${UNIT_LABELS[row.unit] || row.unit}`)}
                  </Text>
                </View>
                <Text style={[styles.listQty, { color: text }]}>{money(row.cogsPeriod)}</Text>
              </View>
            ))
          )}
        </BentoCard>
      </View>

      <BentoCard title='تكلفة مبيعات النهاردة' icon={Wallet} tint={orange} style={styles.full}>
        {productCosts.isLoading ? (
          <CardLoading color={muted} />
        ) : (
          <>
            <Text variant='caption' style={styles.sub}>
              كمية المبيعات × تكلفة كل منتج من شاشة المنتجات
            </Text>
            <Text style={[styles.hero, { color: text }]}>{money(productCostReport?.totalCost)}</Text>
            {productCostRows.length === 0 ? (
              <Empty text='لسه مفيش مبيعات النهاردة' />
            ) : (
              productCostRows.map((row) => (
                <View key={row.productId} style={styles.listRow}>
                  <View style={styles.listMain}>
                    <Text style={[styles.listName, { color: text }]} numberOfLines={1}>
                      {row.emoji} {row.name}
                    </Text>
                    <Text variant='caption' style={styles.listSub}>
                      {rtl(`${fmtQty(row.quantity)} × ${money(row.unitCost)}`)}
                    </Text>
                  </View>
                  <Text style={[styles.listQty, { color: text }]}>{money(row.totalCost)}</Text>
                </View>
              ))
            )}
          </>
        )}
      </BentoCard>

      <BentoCard
        title='جرد المخزون النهاردة'
        icon={ClipboardList}
        tint={indigo}
        style={styles.full}
        onPress={() => router.push('/inventory')}
      >
        {ingredients.isLoading ? (
          <CardLoading color={muted} />
        ) : inventoryRows.length === 0 ? (
          <Empty text='لسه مفيش مواد' />
        ) : (
          <>
            <View style={styles.salesSplit}>
              <MiniStat label='قيمة المخزون (بالتكلفة)' value={money(stockValue)} />
              <MiniStat label='منتجات مبيعة النهاردة' value={String(productCostRows.length)} />
            </View>
            {inventoryValueRows.map((row) => (
              <View key={row.id} style={styles.listRow}>
                <View style={styles.listMain}>
                  <Text style={[styles.stockNameLine, { color: text }]} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text variant='caption' style={styles.listSub}>
                    {rtl(
                      `${fmtQty(row.stockQuantity)} ${UNIT_LABELS[row.unit] || row.unit} × ${money(row.costPerUnit)}`
                    )}
                  </Text>
                </View>
                <Text style={[styles.listQty, { color: text }]}>
                  {money(row.stockValue)}
                </Text>
              </View>
            ))}
            <Text variant='caption' style={styles.sub}>
              {rtl(`${inventoryRows.length} مادة · ${belowMin} تحت الحد · ${outOfStock} خلصت`)}
            </Text>
          </>
        )}
      </BentoCard>

      <BentoCard title='توزيع المبيعات' icon={PieChart} tint={blue} style={styles.full}>
        {payments.isLoading || orderTypes.isLoading ? (
          <CardLoading color={muted} />
        ) : (
          <View style={styles.mixGrid}>
            <View style={styles.mixCol}>
              <Text variant='caption' style={styles.label}>طرق الدفع</Text>
              {paymentRows.length === 0 ? (
                <Empty text='لسه مفيش مدفوعات' />
              ) : (
                paymentRows.map((row) => (
                  <View key={row.method} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={[styles.listName, { color: text }]}>{PAYMENT_LABELS[row.method] || row.method}</Text>
                      <Text variant='caption' style={styles.listSub}>{row.count} طلب</Text>
                    </View>
                    <Text style={[styles.listQty, { color: text }]}>{money(row.total)}</Text>
                  </View>
                ))
              )}
            </View>
            <View style={styles.mixCol}>
              <Text variant='caption' style={styles.label}>أنواع الطلبات</Text>
              {orderTypeRows.length === 0 ? (
                <Empty text='لسه مفيش طلبات' />
              ) : (
                orderTypeRows.map((row) => (
                  <View key={row.key} style={styles.listRow}>
                    <View style={styles.listMain}>
                      <Text style={[styles.listName, { color: text }]}>{row.label}</Text>
                      <Text variant='caption' style={styles.listSub}>{row.count} طلب</Text>
                    </View>
                    <Text style={[styles.listQty, { color: text }]}>{money(row.revenue)}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </BentoCard>

      <BentoCard title='الخصومات والمرتجعات' icon={Percent} tint={orange} style={styles.full}>
        {voids.isLoading ? (
          <CardLoading color={muted} />
        ) : voidReport ? (
          <View style={styles.metricsRow}>
            <MiniStat
              label={rtl(`خصومات (${voidReport.discountCount})`)}
              value={money(voidReport.discountAmount)}
              tone={warning}
            />
            <MiniStat
              label={rtl(`مرتجعات (${voidReport.refundCount})`)}
              value={money(voidReport.refundAmount)}
              tone={red}
            />
            <MiniStat
              label={rtl(`ملغاة (${voidReport.cancelCount})`)}
              value={money(voidReport.cancelAmount)}
              tone={muted}
            />
          </View>
        ) : (
          <Empty text='لسه مفيش بيانات' />
        )}
      </BentoCard>

      <View style={styles.row}>
        <BentoCard title='الوردية الحالية' icon={Wallet} tint={teal} style={styles.half}>
          {shift.isLoading ? (
            <CardLoading color={muted} />
          ) : z ? (
            <>
              <Text variant='caption' style={styles.sub}>
                {rtl(`${z.userName} · بداية ${fmtTime(z.startedAt)}`)}
              </Text>
              <View style={styles.metricsRow}>
                <MiniStat label='طلبات' value={String(z.orderCount)} />
                <MiniStat label='مبيعات' value={money(z.totalRevenue)} />
              </View>
              <View style={styles.metricsRow}>
                <MiniStat label='المتوقع في الدرج' value={money(z.expectedCash)} />
                <MiniStat
                  label='فرق الكاش'
                  value={z.cashDifference == null ? '—' : rtl(`${z.cashDifference > 0 ? '+' : ''}${fmtMoneyInt(z.cashDifference)} ج.م`)}
                  tone={z.cashDifference != null ? (z.cashDifference >= 0 ? green : red) : undefined}
                />
              </View>
            </>
          ) : (
            <Empty text='مفيش وردية مفتوحة' />
          )}
        </BentoCard>

        <BentoCard title='مواد قربت تخلص' icon={AlertTriangle} tint={warning} style={styles.half}>
          <Text style={[styles.heroSmall, { color: lowStock.length > 0 ? warning : green }]}>
            {alerts.isLoading ? '…' : lowStock.length}
          </Text>
          <Text variant='caption' style={styles.sub}>
            {lowStock.length > 0 ? 'مادة تحت الحد الأدنى' : 'المخزون كله تمام'}
          </Text>
          {!alerts.isLoading &&
            lowStock.slice(0, 4).map((item) => (
              <View key={item.id} style={styles.listRow}>
                <Text style={[styles.stockName, { color: text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant='caption' style={styles.stockValue}>
                  {rtl(`${fmtQty(item.stockQuantity)}/${fmtQty(item.minStock)}`)}
                </Text>
              </View>
            ))}
          {!alerts.isLoading && lowStock.length > 4 ? (
            <Text variant='caption' style={styles.more}>{rtl(`+${lowStock.length - 4} مواد أخرى`)}</Text>
          ) : null}
        </BentoCard>
      </View>

      <View style={styles.filterRow}>
        <FilterSelect label='الفترة' value={peakPeriod} options={PERIOD_OPTIONS} onChange={setPeakPeriod} />
        <FilterSelect label='الساعات' value={peakBlock} options={BLOCK_OPTIONS} onChange={setPeakBlock} />
      </View>

      <BentoCard title='أقوى فترة في اليوم' icon={Flame} tint={warning} style={styles.full}>
        {hourly.isLoading ? (
          <CardLoading color={muted} />
        ) : !bestBlock ? (
          <Empty text='لسه مفيش مبيعات في الفترة دي' />
        ) : (
          <>
            <Text variant='caption' style={styles.label}>{blockRange(bestBlock)}</Text>
            <Text style={[styles.heroSmall, { color: text }]}>{money(bestBlock.revenue)}</Text>
            <Text variant='caption' style={styles.sub}>
              {rtl(`${bestBlock.orderCount} طلب · ${periodLabel}`)}
            </Text>
            <View style={[styles.track, { backgroundColor: secondary }]}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: warning,
                    width: `${Math.max(4, Math.min(100, bestShare * 100))}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.metricsRow}>
              <MiniStat
                label='نسبة من مبيعات الفترة'
                value={rtl(`${Math.round(bestShare * 100)}%`)}
                tone={warning}
              />
              <MiniStat
                label='مقارنة بالفترات التانية'
                value={
                  otherMean > 0
                    ? rtl(`أعلى بـ ×${bestRatio.toFixed(1)}`)
                    : 'الفترة الوحيدة اللي فيها مبيعات'
                }
              />
            </View>
          </>
        )}
      </BentoCard>

      <View style={styles.row}>
        <BentoCard title='أعلى فترة بيع' icon={Clock} tint={purple} style={styles.half}>
          {hourly.isLoading ? (
            <CardLoading color={muted} />
          ) : bestBlock ? (
            <HourStat
              label={periodLabel}
              value={blockRange(bestBlock)}
              sub={rtl(`${bestBlock.orderCount} طلب · ${money(bestBlock.revenue)}`)}
              near={text}
              far={muted}
            />
          ) : (
            <Empty text='مفيش مبيعات' />
          )}
        </BentoCard>

        <BentoCard title='أقل فترة بيع' icon={Clock} tint={indigo} style={styles.half}>
          {hourly.isLoading ? (
            <CardLoading color={muted} />
          ) : leastBlock ? (
            <HourStat
              label={periodLabel}
              value={blockRange(leastBlock)}
              sub={rtl(`${leastBlock.orderCount} طلب · ${money(leastBlock.revenue)}`)}
              near={text}
              far={muted}
            />
          ) : (
            <Empty text='مفيش مبيعات' />
          )}
        </BentoCard>
      </View>

      <View style={styles.row}>
        <BentoCard title='أكتر أيام مبيعًا' icon={CalendarDays} tint={teal} style={styles.half}>
          <Text variant='caption' style={styles.sub}>{periodLabel}</Text>
          {trend.isLoading ? (
            <CardLoading color={muted} />
          ) : !hasWeekdayData ? (
            <Empty text='لسه مفيش بيانات كفاية' />
          ) : (
            bestDays.map((day, index) => (
              <View key={day.name} style={styles.dayRow}>
                <Text style={[styles.rank, { color: muted }]}>{index + 1}</Text>
                <Text style={[styles.dayName, { color: text }]}>{day.name}</Text>
                <View style={[styles.dayTrack, { backgroundColor: secondary }]}>
                  <View
                    style={[
                      styles.dayFill,
                      {
                        backgroundColor: teal,
                        width: `${day.avg > 0 && maxDay > 0 ? Math.max(6, (day.avg / maxDay) * 100) : 0}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.dayValue, { color: muted }]}>{fmtMoneyInt(day.avg)}</Text>
              </View>
            ))
          )}
        </BentoCard>

        <BentoCard title='أقل أيام مبيعًا' icon={CalendarDays} tint={orange} style={styles.half}>
          <Text variant='caption' style={styles.sub}>{periodLabel}</Text>
          {trend.isLoading ? (
            <CardLoading color={muted} />
          ) : !hasWeekdayData ? (
            <Empty text='لسه مفيش بيانات كفاية' />
          ) : (
            leastDays.map((day, index) => (
              <View key={day.name} style={styles.dayRow}>
                <Text style={[styles.rank, { color: muted }]}>{index + 1}</Text>
                <Text style={[styles.dayName, { color: text }]}>{day.name}</Text>
                <View style={[styles.dayTrack, { backgroundColor: secondary }]}>
                  <View
                    style={[
                      styles.dayFill,
                      {
                        backgroundColor: orange,
                        width: `${day.avg > 0 && maxDay > 0 ? Math.max(6, (day.avg / maxDay) * 100) : 0}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.dayValue, { color: muted }]}>{fmtMoneyInt(day.avg)}</Text>
              </View>
            ))
          )}
        </BentoCard>
      </View>

      <BentoCard title='نقطة التعادل' icon={Target} tint={green} style={styles.full}>
        <Text variant='caption' style={styles.sub}>
          {`هدف ثابت — بيتغير بس مع المصروفات الشهرية أو أسعار/تكاليف المنتجات (${profitReport?.breakEvenBasis === 'mix' ? 'مزيج مبيعات الشهر السابق' : 'أسعار المنيو'})`}
        </Text>
        <View style={styles.breakTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant='caption' style={styles.label}>المتبقي للتعادل</Text>
            <Text style={[styles.breakValue, { color: text }]} numberOfLines={1}>
              {breakMessage}
            </Text>
          </View>
          <Text style={[styles.pct, { color: progress >= 100 ? green : primary }]}>
            {profitReport ? rtl(`${Math.round(progress)}%`) : '—'}
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: secondary }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: progress >= 100 ? green : primary,
                width: `${Math.max(0, Math.min(100, progress))}%`,
              },
            ]}
          />
        </View>
        <View style={styles.metricsRow}>
          <MiniStat label='المصروفات الشهرية' value={money(fixed)} />
          <MiniStat label='هدف التعادل' value={breakEven > 0 ? money(breakEven) : '—'} />
        </View>
        {profitReport && fixed > 0 && margin <= 0 ? (
          <Text variant='caption' style={styles.hint}>راجع التسعير أو التكلفة — الهامش مش موجب.</Text>
        ) : null}
      </BentoCard>

      <BentoCard title='الأرباح والتكلفة' icon={Wallet} tint={green} style={styles.full}>
        <Text variant='caption' style={styles.label}>صافي ربح الشهر</Text>
        <Text style={[styles.hero, { color: profitReport ? (net >= 0 ? green : red) : text }]}>
          {money(profitReport?.netProfit)}
        </Text>
        <View style={styles.metricsGrid}>
          <MiniStat label='المبيعات' value={money(profitReport?.revenue)} style={styles.metric} />
          <MiniStat label='تكلفة المبيعات' value={money(profitReport?.costOfGoods)} style={styles.metric} />
          <MiniStat label='الربح الإجمالي' value={money(profitReport?.grossProfit)} style={styles.metric} />
          <MiniStat label='المصروفات الثابتة' value={money(profitReport?.totalExpenses)} style={styles.metric} />
        </View>
        {profitReport ? (
          <Text variant='caption' style={styles.sub}>{rtl(`هامش الربح الإجمالي ${marginPct.toFixed(0)}%`)}</Text>
        ) : null}
      </BentoCard>

      {anyError ? (
        <Text variant='caption' style={[styles.error, { color: red }]}>
          تعذر تحميل بعض الأرقام — اسحب للتحديث
        </Text>
      ) : null}
      <View style={{ height: 2, backgroundColor: border }} />
    </View>
  );
}

function BentoCard({
  title,
  icon: Icon,
  tint,
  style,
  onPress,
  children,
}: {
  title: string;
  icon: IconType;
  tint: string;
  style?: ViewStyle;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const card = useColor('card');
  const border = useColor('border');
  const text = useColor('text');
  const muted = useColor('mutedForeground');

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, { backgroundColor: card, borderColor: border }, style]}
    >
      <View style={styles.cardHead}>
        <View style={[styles.iconWrap, { backgroundColor: `${tint}1A` }]}>
          <Icon size={14} color={tint} />
        </View>
        <Text style={[styles.cardTitle, { color: text }]} numberOfLines={1}>
          {title}
        </Text>
        {/* The spacer takes the rest of the row, so the title always hugs the
            icon instead of floating at the far edge of a `flex: 1` box. */}
        <View style={styles.cardSpacer} />
        {onPress ? <ChevronLeft size={14} color={muted} /> : null}
      </View>
      {children}
    </Pressable>
  );
}

function MiniStat({
  label,
  value,
  tone,
  style,
}: {
  label: string;
  value: string;
  tone?: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.mini, style]}>
      <Text variant='caption' style={styles.miniLabel}>{label}</Text>
      <Text style={[styles.miniValue, tone ? { color: tone } : undefined]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function HourStat({
  label,
  value,
  sub,
  near,
  far,
}: {
  label: string;
  value: string;
  sub: string;
  near: string;
  far: string;
}) {
  return (
    <View style={styles.hourCol}>
      <Text variant='caption' style={styles.hourLabel}>{label}</Text>
      <Text style={[styles.hourRange, { color: near }]}>{value}</Text>
      <Text variant='caption' style={[styles.sub, { color: far }]}>{sub}</Text>
    </View>
  );
}

function CardLoading({ color }: { color: string }) {
  return <ActivityIndicator size='small' color={color} style={styles.loading} />;
}

function Empty({ text }: { text: string }) {
  return <Text variant='caption' style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingHorizontal: 16, paddingBottom: 18, direction: 'rtl' },
  row: { flexDirection: 'row', direction: 'rtl', gap: 10, alignItems: 'stretch' },
  full: { width: '100%' },
  half: { flex: 1, minWidth: 0 },
  card: { borderWidth: 1, borderRadius: 18, padding: 13, gap: 5, direction: 'rtl' },
  cardHead: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: 7, marginBottom: 2 },
  iconWrap: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 11, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl', flexShrink: 1 },
  cardSpacer: { flex: 1 },
  label: { fontSize: 10, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  hero: { fontSize: 30, fontWeight: '800', lineHeight: 34, textAlign: 'right', writingDirection: 'rtl' },
  heroSmall: { fontSize: 22, fontWeight: '800', lineHeight: 26, textAlign: 'right', writingDirection: 'rtl' },
  sub: { fontSize: 10, textAlign: 'right', writingDirection: 'rtl' },
  salesSplit: { flexDirection: 'row', direction: 'rtl', gap: 8, marginTop: 6 },
  mini: { flex: 1, minWidth: 0, gap: 1 },
  miniLabel: { fontSize: 9, textAlign: 'right', writingDirection: 'rtl' },
  miniValue: { fontSize: 13, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  listRow: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: 6, paddingVertical: 3 },
  rank: { width: 16, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  listMain: { flex: 1, minWidth: 0 },
  listName: { fontSize: 11, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  listSub: { fontSize: 9, textAlign: 'right', writingDirection: 'rtl' },
  listQty: { fontSize: 12, fontWeight: '800', textAlign: 'left', writingDirection: 'ltr' },
  consumedName: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  stockName: { flex: 1, minWidth: 0, fontSize: 10, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  stockNameLine: { fontSize: 10, fontWeight: '600', textAlign: 'right', writingDirection: 'rtl' },
  stockValue: { fontSize: 9, textAlign: 'left', writingDirection: 'ltr' },
  more: { fontSize: 9, textAlign: 'right', writingDirection: 'rtl' },
  dayRow: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', gap: 6, paddingVertical: 3 },
  dayName: { width: 46, fontSize: 10, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  dayTrack: { flex: 1, height: 6, borderRadius: 999, overflow: 'hidden', direction: 'rtl' },
  dayFill: { height: 6, borderRadius: 999 },
  dayValue: { width: 54, fontSize: 10, fontWeight: '700', textAlign: 'left', writingDirection: 'ltr' },
  filterRow: { flexDirection: 'row', direction: 'rtl', gap: 8, alignItems: 'center' },
  breakTop: { flexDirection: 'row', direction: 'rtl', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  breakValue: { fontSize: 18, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  pct: { fontSize: 18, fontWeight: '800', textAlign: 'left', writingDirection: 'ltr' },
  track: { height: 8, borderRadius: 999, overflow: 'hidden', marginVertical: 4, direction: 'rtl' },
  fill: { height: 8, borderRadius: 999 },
  metricsRow: { flexDirection: 'row', direction: 'rtl', gap: 8, marginTop: 2 },
  metricsGrid: { flexDirection: 'row', direction: 'rtl', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  metric: { width: '47%' },
  hourCol: { flex: 1, minWidth: 0, gap: 1 },
  hourLabel: { fontSize: 9, textAlign: 'right', writingDirection: 'rtl' },
  hourRange: { fontSize: 15, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  mixGrid: { flexDirection: 'row', direction: 'rtl', gap: 12, marginTop: 2 },
  mixCol: { flex: 1, minWidth: 0, gap: 2 },
  hint: { fontSize: 9, textAlign: 'right', writingDirection: 'rtl', marginTop: 2 },
  error: { fontSize: 10, textAlign: 'center', writingDirection: 'rtl', paddingTop: 2 },
  loading: { alignSelf: 'flex-start', marginVertical: 8 },
  empty: { fontSize: 10, textAlign: 'center', writingDirection: 'rtl', paddingVertical: 10 },
});
