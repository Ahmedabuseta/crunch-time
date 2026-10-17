// Turns any `/reports/<name>` payload into something renderable, so one screen
// can show all of them instead of twenty bespoke ones. Pure and unit-tested:
// the shapes are the server's, and getting them wrong is invisible until the
// report is on screen.

export type ReportNode =
  | { kind: 'metric'; label: string; value: string }
  | { kind: 'text'; label: string; value: string }
  | { kind: 'table'; title: string; columns: string[]; rows: string[][] }
  | { kind: 'bars'; title: string; items: { label: string; value: number }[] };

const LABELS: Record<string, string> = {
  totalRevenue: 'إجمالي المبيعات',
  revenue: 'المبيعات',
  totalOrders: 'عدد الطلبات',
  orderCount: 'عدد الطلبات',
  count: 'العدد',
  qty: 'الكمية',
  total: 'الإجمالي',
  avgOrderValue: 'متوسط الطلب',
  avgRevenuePerShift: 'متوسط الوردية',
  avgOrdersPerShift: 'متوسط الطلبات',
  cancelledOrders: 'طلبات ملغية',
  refundedOrders: 'طلبات مستردة',
  totalRefunded: 'إجمالي المسترد',
  costOfGoods: 'تكلفة المبيعات',
  grossProfit: 'الربح الإجمالي',
  netProfit: 'الربح الصافي',
  totalExpenses: 'المصروفات',
  deliveryFees: 'رسوم التوصيل',
  discounts: 'الخصومات',
  discountAmount: 'قيمة الخصم',
  taxCollected: 'الضرائب',
  laborCost: 'تكلفة العمالة',
  laborCostPct: 'نسبة العمالة %',
  hoursWorked: 'ساعات العمل',
  wage: 'الأجر',
  commission: 'العمولة',
  sales: 'المبيعات',
  date: 'التاريخ',
  from: 'من',
  to: 'إلى',
  hour: 'الساعة',
  name: 'الاسم',
  label: 'البند',
  category: 'القسم',
  method: 'طريقة الدفع',
  paymentMethod: 'طريقة الدفع',
  type: 'النوع',
  status: 'الحالة',
  active: 'نشط',
  cashTotal: 'كاش',
  visaTotal: 'فيزا',
  deliveryFee: 'رسوم التوصيل',
  percentage: 'النسبة %',
  totalShifts: 'عدد الورديات',
  closedCount: 'مغلقة',
  openCount: 'مفتوحة',
  totalExpectedCash: 'النقدية المتوقعة',
  totalActualCash: 'النقدية المعدودة',
  totalShorts: 'نواقص',
  totalOverages: 'زيادات',
  difference: 'الفرق',
  expectedCash: 'المتوقع',
  actualCash: 'المعدود',
  stockQuantity: 'الرصيد',
  minStock: 'الحد الأدنى',
  costPerUnit: 'سعر الوحدة',
  avgDailyDemand: 'متوسط الطلب اليومي',
  daysOnHand: 'أيام التغطية',
  turnover: 'معدل الدوران',
  abcClass: 'تصنيف ABC',
  xyzClass: 'تصنيف XYZ',
  unitCost: 'سعر الوحدة',
  supplier: 'المورد',
  variance: 'الفرق',
  variancePct: 'نسبة الفرق %',
  employee: 'الموظف',
  userName: 'الموظف',
  cashierName: 'الكاشير',
  driver: 'الديلفري',
  orderType: 'نوع الطلب',
  // Section titles — the report names themselves.
  topItems: 'الأكثر مبيعاً',
  hourly: 'المبيعات بالساعة',
  shifts: 'الورديات',
  payments: 'طرق الدفع',
  movements: 'حركات الدرج',
  totals: 'الإجمالي',
  summary: 'الملخص',
  categoryRevenue: 'مبيعات الأقسام',
  addonStats: 'الإضافات',
  ticketDistribution: 'توزيع الفواتير',
  orderTypeSplit: 'توزيع أنواع الطلب',
  driverSummary: 'ملخص الديلفري',
  revenueTrend: 'اتجاه المبيعات',
  inventoryAlerts: 'تنبيهات المخزون',
  paymentMethods: 'طرق الدفع',
  discountSummary: 'الخصومات',
  abcXyz: 'تحليل ABC / XYZ',
  inventoryTurnover: 'دوران المخزون',
  purchasePriceVariance: 'فرق أسعار الشراء',
  salesTrend: 'توقع المبيعات',
  voidSummary: 'الإلغاءات والاسترداد',
  laborSummary: 'العمالة',
  staff: 'الموظفون',
  drivers: 'الديلفري',
};

/** camelCase / snake_case → spaced words, for keys with no translation. */
export function humanise(key: string): string {
  const spaced = key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const labelFor = (key: string): string => LABELS[key] ?? humanise(key);

/** Integers keep no decimals; anything else is trimmed to two. Western numerals
 * to match the till — `ar-EG` would render ١٢٣ where the PC shows 123. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    return Number.isInteger(value)
      ? value.toLocaleString('en-US')
      : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (typeof value === 'string') return value;
  return '';
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readable = (value: unknown) =>
  typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';

const MAX_COLUMNS = 5;

/**
 * Flattens a report into an ordered list of blocks. Scalars become metric rows,
 * arrays of objects become tables, arrays of numbers become bars, and nested
 * objects recurse one level so a report like `totals: {…}` still reads.
 */
export function formatReport(report: unknown): ReportNode[] {
  if (!isPlainObject(report)) return [];

  const nodes: ReportNode[] = [];
  const pendingMetrics: { label: string; value: string }[] = [];

  const flushMetrics = () => {
    for (const metric of pendingMetrics) nodes.push({ kind: 'metric', ...metric });
    pendingMetrics.length = 0;
  };

  for (const [key, value] of Object.entries(report)) {
    if (value === null || value === undefined) continue;

    if (readable(value)) {
      // Scalars are buffered so a run of them renders as one block of rows
      // rather than a card each.
      pendingMetrics.push({ label: labelFor(key), value: formatValue(value) });
      continue;
    }

    if (Array.isArray(value)) {
      flushMetrics();
      if (value.length === 0) continue;

      if (value.every(readable)) {
        nodes.push({
          kind: 'table',
          title: labelFor(key),
          columns: ['البند', 'القيمة'],
          rows: value.map((entry, index) => [String(index + 1), formatValue(entry)]),
        });
        continue;
      }

      const rows = value.filter(isPlainObject);
      if (rows.length === 0) continue;

      // One row per entry with a single number is a chart, not a table.
      const keysOf = rows.map((row) => Object.keys(row).filter((k) => readable(row[k])));
      const numericOnly = keysOf.every((keys) => keys.length <= 2);
      const singleValueKey = keysOf[0].find((k) => typeof rows[0][k] === 'number');
      if (numericOnly && singleValueKey) {
        const labelKey = keysOf[0].find((k) => k !== singleValueKey && typeof rows[0][k] === 'string');
        if (labelKey) {
          nodes.push({
            kind: 'bars',
            title: labelFor(key),
            items: rows.slice(0, 24).map((row) => ({
              label: String(row[labelKey] ?? ''),
              value: Number(row[singleValueKey]) || 0,
            })),
          });
          continue;
        }
      }

      const columns = keysOf[0].slice(0, MAX_COLUMNS);
      nodes.push({
        kind: 'table',
        title: labelFor(key),
        columns: columns.map(labelFor),
        rows: rows.slice(0, 50).map((row) => columns.map((column) => formatValue(row[column]))),
      });
      continue;
    }

    if (isPlainObject(value)) {
      flushMetrics();
      const nested = Object.entries(value).filter(([, entry]) => readable(entry));
      if (nested.length === 0) continue;
      nodes.push({
        kind: 'table',
        title: labelFor(key),
        columns: ['البند', 'القيمة'],
        rows: nested.map(([nestedKey, entry]) => [labelFor(nestedKey), formatValue(entry)]),
      });
    }
  }

  flushMetrics();
  return nodes;
}
