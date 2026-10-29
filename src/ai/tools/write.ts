// The five write tools.
//
// None of them writes. Each resolves a name, computes the preview from live
// data, stores a pending action and returns a confirm card. `confirm` is the
// only path to `backend.*`, and it lives in src/ai/actions.ts.
import { z } from 'zod'
import { money, percent, quantity, actionCard, marginPercent, packagesFor } from '../cards'
import { createAction } from '../actions'
import type { ToolOutput } from '../schemas'
import { resolveIngredient, resolveProduct, siblingsOf } from './resolve'
import { toolOutput, type ToolDef } from './types'

const ingredientRef = z.string().min(1).describe('اسم المادة كما هو في المخزون')

export const WRITE_TOOLS: ToolDef[] = [
  {
    name: 'set_product_price',
    description: 'تغيير سعر بيع صنف. بيرجّع كارت تأكيد بسعر قديم وجديد والهامش بعد التغيير. متستخدمهاش قبل ما تعرف الصنف بالظبط.',
    write: true,
    schema: z.object({
      product: z.string().min(1).describe('اسم الصنف'),
      price: z.number().positive().max(100000).describe('السعر الجديد بالجنيه'),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveProduct(args.product)
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const product = resolved.row
      const price = Math.round(Number(args.price) * 100) / 100
      if (!Number.isFinite(price) || price <= 0) {
        return toolOutput({ error: 'السعر لازم يكون أكبر من صفر' }, 'السعر لازم يكون أكبر من صفر')
      }
      if (price === product.price) {
        return toolOutput({ error: 'السعر هو هو' }, `${product.name} سعره ${money(product.price)} بالفعل`)
      }

      const siblings = siblingsOf(product)
      const marginBefore = marginPercent(product.price, product.costPrice)
      const marginAfter = marginPercent(price, product.costPrice)
      const belowCost = price < product.costPrice
      const aboveRange = siblings.count >= 3 && price > siblings.max * 1.3

      const preview = {
        title: 'تغيير سعر',
        subject: product.name,
        rows: [
          { label: 'السعر', before: money(product.price), after: money(price), tone: price > product.price ? ('up' as const) : ('down' as const) },
          { label: 'التكلفة', value: money(product.costPrice) },
          { label: 'الهامش', before: percent(marginBefore), after: percent(marginAfter) },
        ],
        result: describePriceResult(product.name, price, marginAfter, siblings),
        warning: belowCost
          ? `السعر الجديد أقل من التكلفة (${money(product.costPrice)}) — هتخسر ${money(product.costPrice - price)} في كل وحدة.`
          : aboveRange
            ? `السعر الجديد أعلى بكتير من باقي القسم (${money(siblings.min)}–${money(siblings.max)}).`
            : undefined,
      }

      const action = createAction('set_product_price', { productId: product.id, price }, preview)
      ctx.cards.push(actionCard(action.id, 'proposed', preview))

      return toolOutput(
        { actionId: action.id, product: product.name, from: product.price, to: price, marginAfter },
        `جاهز أغير سعر ${product.name} من ${money(product.price)} لـ ${money(price)} — مستني تأكيدك`,
        [],
      )
    },
  },

  {
    name: 'restock',
    description: 'استلام كمية لمادة في المخزون. حدد عدد العبوات أو كمية مباشرة بالوحدة. بيرجّع كارت تأكيد بالمخزون بعد الاستلام.',
    write: true,
    schema: z.object({
      ingredient: ingredientRef,
      packages: z.number().positive().optional().describe('عدد العبوات المستلمة'),
      qty: z.number().positive().optional().describe('كمية مباشرة بوحدة المادة (معناها by_quantity=true)'),
      by_quantity: z.boolean().optional(),
      unit_cost: z.number().nonnegative().optional().describe('سعر الوحدة'),
      package_price: z.number().nonnegative().optional().describe('سعر العبوة'),
      supplier: z.string().optional(),
      note: z.string().max(200).optional(),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveIngredient(args.ingredient)
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const item = resolved.row
      const byQuantity = Boolean(args.by_quantity) || (args.packages === undefined && args.qty !== undefined)
      const amount = byQuantity ? Number(args.qty ?? 0) : Number(args.packages ?? 0)
      if (!Number.isFinite(amount) || amount <= 0) {
        return toolOutput({ error: 'حدد كمية أكبر من صفر' }, 'حدد كمية أكبر من صفر')
      }

      const packSize = item.purchaseQty > 0 ? item.purchaseQty : 1
      const stockDelta = byQuantity ? amount : amount * packSize
      const newStock = item.stockQuantity + stockDelta
      const unitCost = args.unit_cost ?? (args.package_price != null && packSize > 0
        ? Math.round((Number(args.package_price) / packSize) * 100) / 100
        : item.costPerUnit)
      const totalCost = Math.round(stockDelta * unitCost * 100) / 100

      const preview = {
        title: 'استلام مخزون',
        subject: item.name,
        rows: [
          { label: 'المخزون', before: quantity(item.stockQuantity, item.unit), after: quantity(newStock, item.unit), tone: 'up' as const },
          { label: 'الكمية', value: byQuantity ? quantity(amount, item.unit) : `${amount} عبوة × ${packSize}` },
          { label: 'سعر الوحدة', value: money(unitCost) },
          { label: 'إجمالي التكلفة', value: money(totalCost) },
          ...(args.supplier ? [{ label: 'المورد', value: String(args.supplier) }] : []),
        ],
        result: `${item.name} هيبقى ${quantity(newStock, item.unit)} بعد الاستلام، بتكلفة ${money(totalCost)}${args.supplier ? ` من ${args.supplier}` : ''}.`,
        warning: item.minStock > 0 && newStock <= item.minStock
          ? `لسه تحت الحد الأدنى (${quantity(item.minStock, item.unit)}) بعد الاستلام.`
          : undefined,
      }

      const action = createAction('restock', {
        ingredientId: item.id,
        qty: amount,
        byQuantity,
        unitCost: args.unit_cost,
        packagePrice: args.package_price,
        supplier: args.supplier,
        note: args.note,
      }, preview)
      ctx.cards.push(actionCard(action.id, 'proposed', preview))

      return toolOutput(
        { actionId: action.id, ingredient: item.name, added: stockDelta, newStock, totalCost },
        `جاهز أسجّل استلام ${quantity(stockDelta, item.unit)} من ${item.name} — مستني تأكيدك`,
        [],
      )
    },
  },

  {
    name: 'adjust_stock',
    description: 'تسوية مخزون مادة بزيادة أو نقص (جرد). موجبة للزيادة، سالبة للنقص. بيرجّع كارت تأكيد.',
    write: true,
    schema: z.object({
      ingredient: ingredientRef,
      delta: z.number().describe('الفرق: موجب زيادة، سالب نقص'),
      note: z.string().max(200).optional(),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveIngredient(args.ingredient)
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const item = resolved.row
      const delta = Math.round(Number(args.delta) * 100) / 100
      if (!Number.isFinite(delta) || delta === 0) {
        return toolOutput({ error: 'حدد فرق أكبر من صفر' }, 'حدد فرق أكبر من صفر')
      }
      const newStock = item.stockQuantity + delta
      if (newStock < 0) {
        return toolOutput({ error: `النقص أكبر من المخزون المتاح (${quantity(item.stockQuantity, item.unit)})` }, 'النقص أكبر من المخزون المتاح')
      }

      const preview = {
        title: 'تسوية مخزون',
        subject: item.name,
        rows: [
          { label: 'المخزون', before: quantity(item.stockQuantity, item.unit), after: quantity(newStock, item.unit), tone: delta > 0 ? ('up' as const) : ('down' as const) },
          { label: 'الفرق', value: `${delta > 0 ? '+' : ''}${quantity(delta, item.unit)}` },
          ...(args.note ? [{ label: 'السبب', value: String(args.note) }] : []),
        ],
        result: `${item.name} هيبقى ${quantity(newStock, item.unit)} بعد التسوية.`,
      }

      const action = createAction('adjust_stock', { ingredientId: item.id, delta, note: args.note }, preview)
      ctx.cards.push(actionCard(action.id, 'proposed', preview))

      return toolOutput(
        { actionId: action.id, ingredient: item.name, delta, newStock },
        `جاهز أعدّل ${item.name} بمقدار ${delta > 0 ? '+' : ''}${quantity(delta, item.unit)} — مستني تأكيدك`,
        [],
      )
    },
  },

  {
    name: 'record_waste',
    description: 'تسجيل كمية تالفة من مادة. بتنقص المخزون بقيمة التالف. بيرجّع كارت تأكيد.',
    write: true,
    schema: z.object({
      ingredient: ingredientRef,
      qty: z.number().positive().describe('الكمية التالفة بوحدة المادة'),
      note: z.string().max(200).optional(),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveIngredient(args.ingredient)
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const item = resolved.row
      const qty = Math.round(Number(args.qty) * 100) / 100
      if (!Number.isFinite(qty) || qty <= 0) {
        return toolOutput({ error: 'حدد كمية أكبر من صفر' }, 'حدد كمية أكبر من صفر')
      }
      if (qty > item.stockQuantity) {
        return toolOutput({ error: `الكمية أكبر من المخزون المتاح (${quantity(item.stockQuantity, item.unit)})` }, 'الكمية أكبر من المخزون المتاح')
      }

      const newStock = item.stockQuantity - qty
      const value = Math.round(qty * item.costPerUnit * 100) / 100

      const preview = {
        title: 'تسجيل تالف',
        subject: item.name,
        rows: [
          { label: 'المخزون', before: quantity(item.stockQuantity, item.unit), after: quantity(newStock, item.unit), tone: 'down' as const },
          { label: 'الكمية التالفة', value: quantity(qty, item.unit) },
          { label: 'قيمة التالف', value: money(value) },
          ...(args.note ? [{ label: 'السبب', value: String(args.note) }] : []),
        ],
        result: `${quantity(qty, item.unit)} هتتسجل تالف من ${item.name}، بقيمة ${money(value)}. المخزون هيبقى ${quantity(newStock, item.unit)}.`,
      }

      const action = createAction('record_waste', { ingredientId: item.id, qty, note: args.note }, preview)
      ctx.cards.push(actionCard(action.id, 'proposed', preview))

      return toolOutput(
        { actionId: action.id, ingredient: item.name, qty, newStock, value },
        `جاهز أسجّل ${quantity(qty, item.unit)} تالف من ${item.name} — مستني تأكيدك`,
        [],
      )
    },
  },

  {
    name: 'exchange_brand',
    description: 'مبادلة ماركة قديمة بماركة جديدة: إرجاع عبوات من القديمة واستلام عبوات من الجديدة بسعرها. بيرجّع كارت تأكيد بالطرفين.',
    write: true,
    schema: z.object({
      from: ingredientRef.describe('المادة القديمة اللي بترجع'),
      to: ingredientRef.describe('المادة الجديدة اللي بتستلم'),
      from_packages: z.number().nonnegative().optional().describe('عدد عبوات القديمة الراجعة'),
      to_packages: z.number().nonnegative().optional().describe('عدد عبوات الجديدة المستلمة'),
      package_price: z.number().nonnegative().optional().describe('سعر عبوة الجديدة'),
      supplier: z.string().optional(),
      note: z.string().max(200).optional(),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const fromResolved = resolveIngredient(args.from)
      if (!fromResolved.ok) return toolOutput({ error: fromResolved.error }, fromResolved.error)
      const toResolved = resolveIngredient(args.to)
      if (!toResolved.ok) return toolOutput({ error: toResolved.error }, toResolved.error)

      const fromItem = fromResolved.row
      const toItem = toResolved.row
      if (fromItem.id === toItem.id) {
        return toolOutput({ error: 'الطرفين نفس المادة' }, 'الطرفين نفس المادة')
      }

      const fromPackages = Math.max(0, Number(args.from_packages ?? 0))
      const toPackages = Math.max(0, Number(args.to_packages ?? 0))
      if (fromPackages === 0 && toPackages === 0) {
        return toolOutput({ error: 'حدد كمية على الأقل في طرف' }, 'حدد كمية على الأقل في طرف')
      }

      const fromQty = fromPackages * (fromItem.purchaseQty || 1)
      const toQty = toPackages * (toItem.purchaseQty || 1)
      if (fromQty > fromItem.stockQuantity) {
        return toolOutput({ error: `الكمية الراجعة أكبر من مخزون ${fromItem.name}` }, 'الكمية الراجعة أكبر من المخزون')
      }

      const newFrom = fromItem.stockQuantity - fromQty
      const newTo = toItem.stockQuantity + toQty

      const preview = {
        title: 'مبادلة ماركة',
        subject: `${fromItem.name} ← ${toItem.name}`,
        rows: [
          { label: fromItem.name, before: quantity(fromItem.stockQuantity, fromItem.unit), after: quantity(newFrom, fromItem.unit), tone: 'down' as const },
          { label: toItem.name, before: quantity(toItem.stockQuantity, toItem.unit), after: quantity(newTo, toItem.unit), tone: 'up' as const },
          { label: 'الراجع', value: `${fromPackages} عبوة` },
          { label: 'المستلم', value: `${toPackages} عبوة` },
          ...(args.package_price != null ? [{ label: 'سعر عبوة الجديدة', value: money(Number(args.package_price)) }] : []),
        ],
        result: `${fromQty > 0 ? `${quantity(fromQty, fromItem.unit)} هترجع من ${fromItem.name}` : ''}${fromQty > 0 && toQty > 0 ? ' و' : ''}${toQty > 0 ? `${quantity(toQty, toItem.unit)} هتستلم من ${toItem.name}` : ''}.`,
      }

      const action = createAction('exchange_brand', {
        fromIngredientId: fromItem.id,
        toIngredientId: toItem.id,
        fromPackages,
        toPackages,
        packagePrice: args.package_price,
        supplier: args.supplier,
        note: args.note,
      }, preview)
      ctx.cards.push(actionCard(action.id, 'proposed', preview))

      return toolOutput(
        { actionId: action.id, from: fromItem.name, to: toItem.name, newFrom, newTo },
        `جاهز أعمل المبادلة — مستني تأكيدك`,
        [],
      )
    },
  },
]

function describePriceResult(name: string, price: number, marginAfter: number, siblings: { min: number; max: number; count: number; cheaperThan: number }): string {
  const parts = [`${name} هيبقى ${money(price)} — الهامش ${percent(marginAfter)}`]
  if (siblings.count > 0) {
    parts.push(
      siblings.cheaperThan > 0
        ? `أغلى من ${siblings.cheaperThan} صنف في نفس القسم (${money(siblings.min)}–${money(siblings.max)})`
        : `أرخص من باقي القسم (${money(siblings.min)}–${money(siblings.max)})`,
    )
  }
  parts.push('لو فيه كود خصم على الصنف، الخصم هيتحسب من السعر الجديد')
  return `${parts.join('. ')}.`
}

/** Rounds a suggested package count for the restock preview. */
export const suggestPackages = packagesFor
