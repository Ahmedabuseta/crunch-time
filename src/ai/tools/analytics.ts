// The analytics tool: «اسألني أي حاجة» over a closed vocabulary.
//
// The model chooses a metric, a dimension, a window and a few filters; the
// backend (src/backend/analytics.ts) turns that into fixed, parameterised SQL.
// Nothing the model writes ever reaches the database as SQL, and this file
// never runs a query of its own — it only shapes the answer into a summary line
// and a table card.
import { z } from 'zod'
import {
  queryMetrics,
  type Dimension,
  type Metric,
  type QueryMetricsInput,
  type QueryMetricsResult,
} from '../../backend/analytics'
import { asOwner } from '../privileges'
import { money, percent, tableCard } from '../cards'
import type { ChatCard, ToolOutput } from '../schemas'
import { toolOutput, type ToolDef } from './types'

const METRIC_LABELS: Record<Metric, string> = {
  revenue: 'إجمالي المبيعات',
  orders: 'عدد الطلبات',
  avg_ticket: 'متوسط الفاتورة',
  discounts: 'الخصومات',
  delivery_fees: 'رسوم التوصيل',
  items_sold: 'عدد الوحدات المباعة',
  cost: 'تكلفة المبيعات',
  gross_profit: 'الربح الإجمالي',
  margin: 'هامش الربح',
}

const DIMENSION_LABELS: Record<Dimension, string> = {
  day: 'اليوم',
  week: 'الأسبوع',
  month: 'الشهر',
  category: 'القسم',
  product: 'الصنف',
  cashier: 'الكاشير',
  order_type: 'نوع الطلب',
  payment: 'طريقة الدفع',
}

/** Money metrics print with «ج.م»; counts as counts; the margin as a percent. */
function formatValue(metric: Metric, value: number): string {
  if (metric === 'margin') return percent(value)
  if (metric === 'orders' || metric === 'items_sold') {
    return Math.round(value).toLocaleString('en-US')
  }
  return money(value)
}

/** One short Arabic line: the headline number, then the shape of the table. */
function summaryLine(result: QueryMetricsResult, orderCount: number): string {
  const metricLabel = METRIC_LABELS[result.metric]
  const orders = Math.round(Number(orderCount) || 0)
  const value = formatValue(result.metric, result.total)

  let line: string
  if (result.metric === 'orders') line = `${metricLabel} ${value}`
  else if (result.metric === 'margin') line = `${metricLabel} ${value} على ${orders} طلب`
  else line = `${metricLabel} ${value} من ${orders} طلب`

  if (result.dimension) {
    const dimensionLabel = DIMENSION_LABELS[result.dimension]
    const top = result.rows[0]
    line += top
      ? ` — ${result.rowCount} ${dimensionLabel}، الأعلى ${top.label} بـ${formatValue(result.metric, top.value)}`
      : ` — مفيش بيانات حسب ${dimensionLabel}`
  }

  if (result.previousTotal !== undefined && result.changePct !== undefined) {
    const direction = result.changePct >= 0 ? 'زيادة' : 'نقص'
    line += ` — ${direction} ${percent(Math.abs(result.changePct))} عن الفترة السابقة`
  }

  return line.slice(0, 300)
}

/**
 * The table card: label, value, and the order count when it is not already the
 * value itself. Three columns, never more than the card schema allows.
 */
function tableFor(result: QueryMetricsResult): ChatCard | null {
  if (result.rows.length === 0) return null
  const dimensionLabel = result.dimension ? DIMENSION_LABELS[result.dimension] : 'الفترة'
  const valueLabel = METRIC_LABELS[result.metric]
  const showOrders = result.metric !== 'orders'
  const columns = showOrders ? [dimensionLabel, valueLabel, 'طلبات'] : [dimensionLabel, valueLabel]
  const rows = result.rows.map((row) => {
    const cells: (string | number)[] = [row.label, formatValue(result.metric, row.value)]
    if (showOrders) cells.push(row.orders ?? 0)
    return cells
  })
  return tableCard(`${valueLabel} حسب ${dimensionLabel}`, columns, rows)
}

/** A model's argument object, narrowed to the backend's contract. */
function toInput(value: unknown): QueryMetricsInput {
  return (value ?? {}) as QueryMetricsInput
}

export const ANALYTICS_TOOLS: ToolDef[] = [
  {
    name: 'query_metrics',
    description: 'تحليلات حرة على بيانات البيع: أي مقياس (مبيعات، طلبات، متوسط فاتورة، خصومات، توصيل، وحدات، تكلفة، ربح، هامش) مع تجميع حسب اليوم/الأسبوع/الشهر/القسم/الصنف/الكاشير/نوع الطلب/طريقة الدفع، وفلاتر، ومقارنة بالفترة السابقة. استخدمها لأي سؤال رقمي مش مغطّى بأداة تانية.',
    write: false,
    schema: z.object({
      metric: z.enum([
        'revenue', 'orders', 'avg_ticket', 'discounts', 'delivery_fees',
        'items_sold', 'cost', 'gross_profit', 'margin',
      ]).describe('المقياس: revenue=المبيعات، orders=عدد الطلبات، avg_ticket=متوسط الفاتورة، discounts=الخصومات، delivery_fees=رسوم التوصيل، items_sold=عدد الوحدات المباعة، cost=تكلفة المبيعات، gross_profit=الربح الإجمالي، margin=هامش الربح ٪'),
      dimension: z.enum([
        'day', 'week', 'month', 'category', 'product', 'cashier', 'order_type', 'payment',
      ]).optional().describe('التجميع: day=يوم، week=أسبوع، month=شهر، category=قسم، product=صنف، cashier=كاشير، order_type=نوع الطلب، payment=طريقة الدفع. سيبه فاضي لو عايز رقم واحد إجمالي'),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('بداية المدة YYYY-MM-DD (افتراضي النهاردة)'),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('نهاية المدة YYYY-MM-DD (افتراضي النهاردة)'),
      filters: z.object({
        category: z.string().optional().describe('قسم بالاسم أو الـ id'),
        product: z.string().optional().describe('صنف بالاسم أو الـ id'),
        cashier: z.string().optional().describe('اسم الكاشير'),
        orderType: z.string().optional().describe('نوع الطلب: delivery توصيل، dine-in صالة، takeaway سفري'),
        payment: z.string().optional().describe('طريقة الدفع: cash كاش، visa/card فيزا، wallet محفظة'),
        status: z.enum(['COMPLETED', 'REFUNDED', 'CANCELLED']).optional().describe('حالة الطلب. الافتراضي: كل حاجة ما عدا CANCELLED'),
      }).optional().describe('فلاتر اختيارية على الطلبات'),
      compare: z.literal('previous_period').optional().describe('قارن بنفس عدد أيام الفترة اللي قبل «from»'),
      limit: z.number().int().min(1).max(100).optional().describe('أقصى عدد صفوف في الجدول، افتراضي 20'),
    }),
    async run(args): Promise<ToolOutput> {
      const input = toInput(args)
      try {
        const result = asOwner(() => queryMetrics(input))
        // The headline line wants the basket count; it is not in the result
        // shape, so ask the same layer for the plain order count.
        const orderCount = result.metric === 'orders'
          ? result.total
          : asOwner(() => queryMetrics({ ...input, metric: 'orders', dimension: undefined, compare: undefined })).total

        const card = tableFor(result)
        return toolOutput(result, summaryLine(result, orderCount), card ? [card] : [])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'حصل خطأ وأنا بجمع الأرقام'
        return toolOutput({ error: message }, `مش قادر أجيب الأرقام: ${message}`.slice(0, 300))
      }
    },
  },
]
