// The eight read tools.
//
// Each one narrows an existing report rather than dumping it: the model gets
// numbers it can reason over, and the phone gets a card built from the same
// call. Nothing here writes.
import { z } from 'zod'
import * as catalog from '../../backend/catalog'
import * as inventory from '../../backend/inventory'
import * as orders from '../../backend/orders'
import * as reports from '../../backend/reports'
import { asOwner, asOwnerAsync } from '../privileges'
import { money, percent, packagesFor, quantity, reportCard, tableCard } from '../cards'
import type { ToolOutput } from '../schemas'
import { resolveProduct } from './resolve'
import { toolOutput, type ToolDef } from './types'

const dateRange = {
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('بداية المدة YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('نهاية المدة YYYY-MM-DD'),
}

const today = (now: Date) => now.toISOString().slice(0, 10)

export const READ_TOOLS: ToolDef[] = [
  {
    name: 'sales_summary',
    description: 'إجمالي المبيعات وعدد الطلبات ومتوسط الفاتورة في مدة. استخدمها لأي سؤال عن "بعت بكام" أو مقارنة فترة بفترة.',
    write: false,
    schema: z.object(dateRange),
    async run(args, ctx): Promise<ToolOutput> {
      const from = args.from
      const to = args.to
      const report = from || to
        ? asOwner(() => reports.periodSummary(from, to))
        : asOwner(() => reports.dailySummary(today(ctx.now)))

      const summary = from || to
        ? `المبيعات ${money(Number((report as any).totalRevenue) || 0)} من ${(report as any).totalOrders ?? 0} طلب`
        : `مبيعات النهاردة ${money(Number((report as any).totalRevenue) || 0)} من ${(report as any).totalOrders ?? 0} طلب`

      return toolOutput(report, summary, [reportCard(from || to ? 'ملخص الفترة' : 'ملخص النهاردة', report)])
    },
  },

  {
    name: 'profit_summary',
    description: 'الأرباح: تكلفة المبيعات، الربح الإجمالي والصافي، المصروفات والعمالة. لأي سؤال عن "أنا كسبان ولا لا".',
    write: false,
    schema: z.object(dateRange),
    async run(args): Promise<ToolOutput> {
      const report = asOwner(() => reports.profitSummary(args.from, args.to)) as any
      const summary = `الربح الإجمالي ${money(Number(report?.grossProfit) || 0)} على مبيعات ${money(Number(report?.totalRevenue) || 0)}`
      return toolOutput(report, summary, [reportCard('الأرباح', report)])
    },
  },

  {
    name: 'top_items',
    description: 'الأصناف الأكثر مبيعاً بكمية وإيراد وهامش ربح لكل صنف. لأي سؤال عن أفضل أو أسوأ صنف.',
    write: false,
    schema: z.object({
      limit: z.number().int().min(1).max(25).optional().describe('عدد الأصناف، افتراضي 10'),
      ...dateRange,
    }),
    async run(args): Promise<ToolOutput> {
      const limit = Number(args.limit) || 10
      const items = asOwner(() => reports.topItems(limit, args.from, args.to)) as any[]
      const products = asOwner(() => catalog.listProducts(undefined, true)) as any[]
      const byId = new Map(products.map((p) => [String(p.id), p]))

      const rows = items.map((item) => {
        const product = byId.get(String(item.name)) ?? products.find((p) => p.name === item.name)
        const cost = Number(product?.costPrice) || 0
        const revenue = Number(item.totalRevenue) || 0
        const qty = Number(item.totalQuantity) || 0
        const margin = revenue > 0 ? ((revenue - cost * qty) / revenue) * 100 : 0
        return {
          name: String(item.name),
          quantity: qty,
          revenue,
          marginPct: Math.round(margin * 10) / 10,
        }
      })

      const data = { items: rows }
      const top = rows[0]
      const summary = top ? `أفضل صنف: ${top.name} — ${top.quantity} وحدة بـ${money(top.revenue)}` : 'مفيش مبيعات في المدة دي'
      const card = rows.length
        ? tableCard(
            'الأكثر مبيعاً',
            ['الصنف', 'الكمية', 'الإيراد', 'الهامش'],
            rows.map((r) => [r.name, r.quantity, money(r.revenue), percent(r.marginPct)]),
          )
        : undefined
      return toolOutput(data, summary, card ? [card] : [])
    },
  },

  {
    name: 'inventory_status',
    description: 'المخزون: اللي ناقص، والتغطية بالأيام، واقتراح كمية الشراء بالعبوات وتكلفتها. لأي سؤال عن "أطلب إيه".',
    write: false,
    schema: z.object({
      low_only: z.boolean().optional().describe('true = اللي محتاج طلب بس'),
    }),
    async run(args): Promise<ToolOutput> {
      const result = asOwner(() => reports.daysOnHand()) as any
      const rows: any[] = Array.isArray(result?.rows) ? result.rows : []
      const todaySnapshot = today(new Date())

      const enriched = rows.map((row) => {
        const stock = Number(row.stock) || 0
        const pack = Number(row.packSize) || 1
        const minStock = Number(row.minStock) || 0
        const daily = Number(row.avgDailyUse) || 0
        // Order enough to clear the minimum *and* cover a week at current use.
        const needed = Math.max(0, minStock - stock, daily * 7 - stock)
        const packages = packagesFor(needed, pack)
        const unitCost = Number(row.unitCost) || 0
        return {
          name: String(row.name),
          unit: String(row.unit ?? ''),
          stock,
          minStock,
          avgDailyUse: daily,
          daysLeft: row.dio ?? null,
          status: String(row.status ?? 'ok'),
          supplier: row.supplier ?? null,
          suggestedPackages: packages,
          suggestedQty: Math.round(packages * pack * 100) / 100,
          estimatedCost: Math.round(packages * pack * unitCost * 100) / 100,
        }
      })

      const lowOnly = Boolean(args.low_only)
      const selected = lowOnly ? enriched.filter((row) => row.status !== 'ok' || row.suggestedPackages > 0) : enriched
      const toOrder = selected.filter((row) => row.suggestedPackages > 0)
      const totalCost = toOrder.reduce((sum, row) => sum + row.estimatedCost, 0)

      const data = {
        asOf: todaySnapshot,
        lowOnly,
        toOrder: toOrder.slice(0, 20),
        totalEstimatedCost: Math.round(totalCost * 100) / 100,
        totalItems: toOrder.length,
      }

      const summary = toOrder.length
        ? `${toOrder.length} مادة محتاجة طلب، التكلفة التقديرية ${money(totalCost)}`
        : 'المخزون كويس — مفيش حاجة محتاجة طلب دلوقتي'

      const cards = toOrder.length
        ? [
            tableCard(
              'اقتراح طلب',
              ['المادة', 'المخزون', 'الطلب', 'التكلفة'],
              toOrder.slice(0, 20).map((row) => [
                row.name,
                quantity(row.stock, row.unit),
                `${row.suggestedPackages} عبوة`,
                money(row.estimatedCost),
              ]),
            ),
          ]
        : []

      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'item_margins',
    description: 'ترتيب الأصناف بأقل هامش ربح للمقارنة بين الأصناف. مش للبحث عن سعر صنف واحد — استخدم product_price للسؤال «بكام».',
    write: false,
    schema: z.object({
      category: z.string().optional().describe('اسم القسم لتصفية الأصناف'),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async run(args): Promise<ToolOutput> {
      const limit = Number(args.limit) || 15
      const products = asOwner(() => catalog.listProducts(undefined, false)) as any[]
      const categories = (await asOwnerAsync(() => catalog.listCategories())) as any[]
      const categoryNames = new Map(categories.map((c) => [String(c.id), String(c.name)]))

      const wanted = args.category ? String(args.category) : ''
      const filtered = products
        .filter((p) => {
          if (!wanted) return true
          const name = categoryNames.get(String(p.categoryId)) ?? ''
          return name.includes(wanted) || String(p.name).includes(wanted)
        })
        .map((p) => {
          const price = Number(p.price) || 0
          const cost = Number(p.costPrice) || 0
          return {
            name: String(p.name),
            category: categoryNames.get(String(p.categoryId)) ?? null,
            price,
            cost,
            marginPct: price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0,
            profit: Math.round((price - cost) * 100) / 100,
          }
        })
        .sort((a, b) => a.marginPct - b.marginPct)
        .slice(0, limit)

      const data = { items: filtered }
      const worst = filtered[0]
      const summary = worst
        ? `أقل هامش: ${worst.name} — ${percent(worst.marginPct)} (ربح ${money(worst.profit)})`
        : 'مفيش أصناف مطابقة'

      const cards = filtered.length
        ? [
            tableCard(
              'هوامش الأصناف',
              ['الصنف', 'السعر', 'التكلفة', 'الهامش'],
              filtered.map((row) => [row.name, money(row.price), money(row.cost), percent(row.marginPct)]),
            ),
          ]
        : []

      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'recipe_costs',
    description: 'مكونات صنف وتكلفة كل مكون، وإجمالي تكلفة الصنف. لأي سؤال عن "ليه تكلفة الصنف زادت".',
    write: false,
    schema: z.object({
      product: z.string().describe('اسم الصنف'),
    }),
    async run(args): Promise<ToolOutput> {
      const resolved = resolveProduct(args.product)
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const lines = asOwner(() => inventory.listRecipes(resolved.row.id)) as any[]
      const total = lines.reduce((sum, line) => sum + (Number(line.lineCost) || 0), 0)
      const items = lines.map((line) => ({
        lineId: String(line.id),
        kind: line.subRecipeId ? 'sub_recipe' : 'ingredient',
        ingredientId: line.ingredientId ? String(line.ingredientId) : null,
        subRecipeId: line.subRecipeId ? String(line.subRecipeId) : null,
        name: String(line.ingredientName ?? line.subRecipeName ?? ''),
        quantity: Number(line.quantityPerUnit) || 0,
        unit: String(line.unit ?? line.subRecipeUnit ?? ''),
        unitCost: Number(line.costPerUnit ?? line.subRecipeCostPerUnit) || 0,
        lineCost: Math.round((Number(line.lineCost) || 0) * 100) / 100,
      }))

      const data = { product: resolved.row.name, price: resolved.row.price, cost: Math.round(total * 100) / 100, items }
      const summary = `تكلفة ${resolved.row.name} ${money(total)} من ${items.length} مكون`
      const cards = items.length
        ? [
            tableCard(
              `مكونات ${resolved.row.name}`,
              ['المكون', 'الكمية', 'التكلفة'],
              items.map((item) => [item.name, quantity(item.quantity, item.unit), money(item.lineCost)]),
            ),
          ]
        : []

      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'staff_performance',
    description: 'أداء الموظفين: الإلغاءات والاسترداد لكل كاشير، فروق الدرج لكل وردية، وساعات العمل. لأي سؤال عن الموظفين أو الورديات.',
    write: false,
    schema: z.object(dateRange),
    async run(args): Promise<ToolOutput> {
      const voids = asOwner(() => reports.voidSummary(args.from, args.to)) as any
      const labor = asOwner(() => reports.laborSummary(args.from, args.to)) as any
      const shifts = asOwner(() => reports.shiftSummary(args.from, args.to)) as any

      const data = {
        voids: {
          staff: Array.isArray(voids?.staff) ? voids.staff.slice(0, 12) : [],
          totalVoided: voids?.totalRefunded ?? voids?.voidedAmount ?? null,
          cancelled: voids?.cancelledOrders ?? null,
        },
        labor: {
          hoursWorked: labor?.hoursWorked ?? null,
          laborCost: labor?.laborCost ?? null,
          laborCostPct: labor?.laborCostPct ?? null,
          staff: Array.isArray(labor?.staff) ? labor.staff.slice(0, 12) : [],
        },
        shifts: {
          totalShifts: shifts?.totalShifts ?? null,
          shorts: shifts?.totalShorts ?? null,
          overages: shifts?.totalOverages ?? null,
        },
      }

      const summary = `الورديات: ${data.shifts.totalShifts ?? 0} — نواقص ${money(Number(data.shifts.shorts) || 0)}`
      return toolOutput(data, summary, [reportCard('الموظفون والورديات', data)])
    },
  },

  {
    name: 'orders_search',
    description: 'البحث في الطلبات بحالة أو مدة. يرجّع أحدث الطلبات مع الإجمالي والحالة. أرقام هواتف العملاء مقنّعة.',
    write: false,
    schema: z.object({
      status: z.string().optional().describe('حالة الطلب، مثل COMPLETED أو CANCELLED'),
      ...dateRange,
      limit: z.number().int().min(1).max(25).optional(),
    }),
    async run(args): Promise<ToolOutput> {
      const limit = Math.min(Number(args.limit) || 10, 25)
      const rows = asOwner(() => orders.listOrders({
        status: args.status,
        from: args.from,
        to: args.to,
      })) as any[]

      const items = rows.slice(0, limit).map((row) => ({
        id: String(row.id),
        status: String(row.status ?? ''),
        type: String(row.orderType ?? ''),
        total: Number(row.total) || 0,
        createdAt: String(row.createdAt ?? ''),
        cashier: row.cashierName ?? null,
        customer: row.customerName ?? null,
        phone: maskPhone(row.customerPhone),
      }))

      const data = { orders: items, matched: rows.length }
      const summary = items.length ? `${items.length} طلب — أولهم ${money(items[0].total)}` : 'مفيش طلبات مطابقة'

      const cards = items.length
        ? [
            tableCard(
              'الطلبات',
              ['رقم', 'الحالة', 'النوع', 'الإجمالي'],
              items.map((item) => [item.id.slice(0, 8), item.status, item.type, money(item.total)]),
            ),
          ]
        : []

      return toolOutput(data, summary, cards)
    },
  },
]

/**
 * Last four digits only. The owner can recognise their own customer; the model
 * gets nothing it could leak.
 */
export function maskPhone(phone: unknown): string | null {
  const clean = String(phone ?? '').replace(/\D/g, '')
  if (clean.length < 5) return clean ? '••••' : null
  return `••••${clean.slice(-4)}`
}
