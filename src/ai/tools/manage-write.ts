import { z } from 'zod'
import * as catalog from '../../backend/catalog'
import * as inventory from '../../backend/inventory'
import { r2 } from '../../backend/shared'
import { categoryLabel, defaultStorageForCategory, storageLabel } from '../../lib/inventory-taxonomy'
import { createAction, type ActionKind } from '../actions'
import { actionCard, money, percent, quantity, type ActionPreview } from '../cards'
import type { ToolOutput } from '../schemas'
import {
  resolveAddon,
  resolveCategory,
  resolveIngredient,
  resolveModifierGroup,
  resolveProduct,
  resolveSubRecipe,
} from './resolve'
import { toolOutput, type ToolDef, type ToolContext } from './types'

const UNIT = z.enum(['g', 'kg', 'ml', 'l', 'pcs'])
const CATEGORY = z.enum(['protein', 'dairy', 'produce', 'frozen', 'sauces', 'dry', 'packaging', 'other'])
const STORAGE = z.enum(['freezer', 'fridge', 'dry'])

const productRef = z.string().min(1).describe('اسم الصنف أو id')
const ingredientRef = z.string().min(1).describe('اسم المادة أو id')
const subRecipeRef = z.string().min(1).describe('اسم الوصفة الفرعية أو id')
const categoryRef = z.string().min(1).describe('اسم القسم أو id')

function propose(
  ctx: ToolContext,
  kind: ActionKind,
  payload: Record<string, unknown>,
  preview: ActionPreview,
  data: Record<string, unknown>,
  summary: string,
): ToolOutput {
  const action = createAction(kind, payload, preview)
  ctx.cards.push(actionCard(action.id, 'proposed', preview))
  return toolOutput({ actionId: action.id, ...data }, summary, [])
}

function recipeLines(productId: string): any[] {
  return inventory.listRecipes(productId) as any[]
}

function recipeTotal(productId: string): number {
  return Math.round(recipeLines(productId).reduce((sum, line) => sum + (Number(line.lineCost) || 0), 0) * 100) / 100
}

function subRecipeUnitCost(subRecipeId: string): number {
  const row = (inventory.listSubRecipes() as any[]).find((entry) => String(entry.id) === subRecipeId)
  return Number(row?.costPerUnit) || 0
}

function cleanSupplier(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  const trimmed = String(value ?? '').trim()
  return trimmed || null
}

function categoryForProduct(categoryId: string | null | undefined): string | null {
  if (!categoryId) return null
  const row = catalog.getCategoryById(categoryId) as any
  return row?.name ?? null
}

export const MANAGE_WRITE_TOOLS: ToolDef[] = [
  {
    name: 'create_product',
    description: 'إضافة صنف جديد للمنيو. حدد الاسم والسعر والقسم؛ الوصف والإيموجي والتكلفة اختياريين.',
    write: true,
    schema: z.object({
      name: z.string().min(1).max(80).describe('اسم الصنف'),
      price: z.number().positive().max(100000).describe('سعر البيع'),
      category: categoryRef,
      emoji: z.string().max(8).optional(),
      description: z.string().max(500).optional(),
      cost_price: z.number().nonnegative().max(100000).optional().describe('تكلفة معلومة يدويًا؛ لو فيه وصفة بتتحسب تلقائي'),
      supports_rollback: z.boolean().optional().describe('هل يرجع المخزون عند الاسترداد؟'),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const category = resolveCategory(args.category)
      if (!category.ok) return toolOutput({ error: category.error }, category.error)

      const price = r2(args.price)
      if (price <= 0) return toolOutput({ error: 'السعر لازم يكون أكبر من صفر' }, 'السعر لازم يكون أكبر من صفر')
      const costPrice = r2(args.cost_price ?? 0)
      if (costPrice < 0) return toolOutput({ error: 'التكلفة لا تقل عن صفر' }, 'التكلفة لا تقل عن صفر')

      const name = args.name.trim()
      const emoji = args.emoji?.trim() || '🍔'
      const description = args.description?.trim() || ''
      const supportsRollback = args.supports_rollback ?? true
      const preview: ActionPreview = {
        title: 'إضافة صنف',
        subject: name,
        rows: [
          { label: 'القسم', value: category.row.name },
          { label: 'السعر', value: money(price) },
          { label: 'التكلفة', value: costPrice > 0 ? money(costPrice) : '—' },
          { label: 'الإيموجي', value: emoji },
          ...(description ? [{ label: 'الوصف', value: description }] : []),
        ],
        result: `${name} هيتضاف للمنيو في قسم ${category.row.name} بسعر ${money(price)}${costPrice > 0 ? ` وتكلفة ${money(costPrice)}` : ''}.`,
      }

      return propose(ctx, 'create_product', {
        name,
        price,
        costPrice,
        categoryId: category.row.id,
        emoji,
        description,
        supportsRollback,
      }, preview, { product: name, price, category: category.row.name }, `جاهز أضيف ${name} للمنيو — مستني تأكيدك`)
    },
  },

  {
    name: 'update_product',
    description: 'تعديل بيانات صنف موجود: الاسم، السعر، القسم، الوصف، الإيموجي، التكلفة، أو ظهوره. مش بتحذف الصنف.',
    write: true,
    schema: z.object({
      product: productRef,
      name: z.string().min(1).max(80).optional(),
      price: z.number().positive().max(100000).optional(),
      category: categoryRef.optional(),
      emoji: z.string().max(8).optional(),
      description: z.string().max(500).optional(),
      cost_price: z.number().nonnegative().max(100000).optional(),
      active: z.boolean().optional().describe('false = إخفاء من المنيو'),
      supports_rollback: z.boolean().optional(),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveProduct(args.product, { includeInactive: true })
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const current = catalog.getProductById(resolved.row.id) as any
      if (!current) return toolOutput({ error: 'الصنف غير موجود' }, 'الصنف غير موجود')

      const patch: Record<string, unknown> = {}
      const rows: ActionPreview['rows'] = []
      if (args.name !== undefined && args.name.trim() !== current.name) {
        patch.name = args.name.trim()
        rows.push({ label: 'الاسم', before: current.name, after: patch.name as string })
      }
      if (args.price !== undefined && r2(args.price) !== Number(current.price)) {
        const price = r2(args.price)
        if (price <= 0) return toolOutput({ error: 'السعر لازم يكون أكبر من صفر' }, 'السعر لازم يكون أكبر من صفر')
        patch.price = price
        rows.push({ label: 'السعر', before: money(Number(current.price) || 0), after: money(price), tone: price > Number(current.price) ? 'up' : 'down' })
      }
      if (args.category !== undefined) {
        const category = resolveCategory(args.category)
        if (!category.ok) return toolOutput({ error: category.error }, category.error)
        if (category.row.id !== current.categoryId) {
          patch.categoryId = category.row.id
          rows.push({ label: 'القسم', before: categoryForProduct(current.categoryId) ?? '—', after: category.row.name })
        }
      }
      if (args.emoji !== undefined && args.emoji.trim() !== String(current.emoji ?? '')) {
        patch.emoji = args.emoji.trim() || '🍔'
        rows.push({ label: 'الإيموجي', before: String(current.emoji ?? ''), after: String(patch.emoji) })
      }
      if (args.description !== undefined && args.description.trim() !== String(current.description ?? '')) {
        patch.description = args.description.trim()
        rows.push({ label: 'الوصف', before: String(current.description ?? '') || '—', after: String(patch.description) || '—' })
      }
      if (args.cost_price !== undefined && r2(args.cost_price) !== Number(current.costPrice)) {
        const costPrice = r2(args.cost_price)
        if (costPrice < 0) return toolOutput({ error: 'التكلفة لا تقل عن صفر' }, 'التكلفة لا تقل عن صفر')
        patch.costPrice = costPrice
        rows.push({ label: 'التكلفة', before: money(Number(current.costPrice) || 0), after: money(costPrice), tone: costPrice > Number(current.costPrice) ? 'up' : 'down' })
      }
      if (args.active !== undefined && Boolean(args.active) !== Boolean(current.active)) {
        patch.active = Boolean(args.active)
        rows.push({ label: 'الحالة', before: current.active ? 'ظاهر' : 'مخفي', after: args.active ? 'ظاهر' : 'مخفي' })
      }
      if (args.supports_rollback !== undefined && Boolean(args.supports_rollback) !== Boolean(current.supportsRollback)) {
        patch.supportsRollback = Boolean(args.supports_rollback)
        rows.push({ label: 'استرداد المخزون', before: current.supportsRollback ? 'مفعّل' : 'متوقف', after: args.supports_rollback ? 'مفعّل' : 'متوقف' })
      }

      if (Object.keys(patch).length === 0) {
        return toolOutput({ error: 'مفيش أي تغيير في البيانات' }, 'مفيش أي تغيير في البيانات')
      }

      const preview: ActionPreview = {
        title: 'تعديل صنف',
        subject: current.name,
        rows: rows.slice(0, 8),
        result: `${current.name} هيتحدّث بعد التأكيد.`,
      }
      return propose(ctx, 'update_product', { productId: current.id, patch }, preview, { product: current.name, changes: Object.keys(patch) }, `جاهز أعدّل ${current.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'delete_product',
    description: 'تعطيل/حذف صنف من المنيو (حذف ناعم، مش نهائي). بيشيله من الظهور ويرجع بياناته محفوظة.',
    write: true,
    schema: z.object({
      product: productRef,
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveProduct(args.product, { includeInactive: true })
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)
      const product = catalog.getProductById(resolved.row.id) as any
      if (!product) return toolOutput({ error: 'الصنف غير موجود' }, 'الصنف غير موجود')

      const preview: ActionPreview = {
        title: 'تعطيل صنف',
        subject: product.name,
        rows: [
          { label: 'القسم', value: categoryForProduct(product.categoryId) ?? '—' },
          { label: 'السعر', value: money(Number(product.price) || 0) },
          { label: 'الحالة', before: product.active ? 'ظاهر' : 'مخفي', after: 'مخفي' },
        ],
        result: `${product.name} هيتشال من المنيو. البيانات والوصفة والطلبات القديمة هتفضل محفوظة.`,
        warning: 'هيتشال كمان من الإضافات ومجموعات الخيارات المرتبطة بيه. تقدر ترجّعه بتعديل حالة المنتج.',
      }
      return propose(ctx, 'delete_product', { productId: product.id }, preview, { product: product.name }, `جاهز أعطّل ${product.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'set_product_addons',
    description: 'تحديد الإضافات المرتبطة بصنف. بترسل أسماء الإضافات أو ids، وبتستبدل القائمة القديمة.',
    write: true,
    schema: z.object({
      product: productRef,
      addons: z.array(z.string().min(1)).max(50).describe('أسماء الإضافات أو ids؛ [] = شيل كل الإضافات'),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const product = resolveProduct(args.product, { includeInactive: true })
      if (!product.ok) return toolOutput({ error: product.error }, product.error)

      const resolved = (args.addons as string[]).map((name) => ({ name, result: resolveAddon(name) }))
      const failed = resolved.find((entry) => !entry.result.ok)
      if (failed) {
        const result = failed.result
        if (!result.ok) return toolOutput({ error: result.error }, result.error)
      }

      const ids: string[] = []
      const names: string[] = []
      for (const entry of resolved) {
        if (!entry.result.ok) continue
        if (!ids.includes(entry.result.row.id)) {
          ids.push(entry.result.row.id)
          names.push(entry.result.row.name)
        }
      }

      const preview: ActionPreview = {
        title: 'إضافات الصنف',
        subject: product.row.name,
        rows: [
          { label: 'العدد', value: String(ids.length) },
          ...(names.length ? [{ label: 'الإضافات', value: names.join('، ') }] : []),
        ],
        result: ids.length
          ? `${product.row.name} هيبقى متاح مع ${ids.length} إضافة.`
          : `كل الإضافات هتتشال من ${product.row.name}.`,
      }
      return propose(ctx, 'set_product_addons', { productId: product.row.id, addonIds: ids }, preview, { product: product.row.name, addons: names }, `جاهز أحدّد إضافات ${product.row.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'set_product_modifiers',
    description: 'تحديد مجموعات الخيارات المرتبطة بصنف. بترسل أسماء المجموعات أو ids، وبتستبدل القائمة القديمة.',
    write: true,
    schema: z.object({
      product: productRef,
      groups: z.array(z.string().min(1)).max(50).describe('أسماء مجموعات الخيارات أو ids؛ [] = شيل الكل'),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const product = resolveProduct(args.product, { includeInactive: true })
      if (!product.ok) return toolOutput({ error: product.error }, product.error)

      const resolved = (args.groups as string[]).map((name) => ({ name, result: resolveModifierGroup(name) }))
      const failed = resolved.find((entry) => !entry.result.ok)
      if (failed) {
        const result = failed.result
        if (!result.ok) return toolOutput({ error: result.error }, result.error)
      }

      const ids: string[] = []
      const names: string[] = []
      for (const entry of resolved) {
        if (!entry.result.ok) continue
        if (!ids.includes(entry.result.row.id)) {
          ids.push(entry.result.row.id)
          names.push(entry.result.row.name)
        }
      }

      const preview: ActionPreview = {
        title: 'خيارات الصنف',
        subject: product.row.name,
        rows: [
          { label: 'العدد', value: String(ids.length) },
          ...(names.length ? [{ label: 'المجموعات', value: names.join('، ') }] : []),
        ],
        result: ids.length
          ? `${product.row.name} هيبقى متاح مع ${ids.length} مجموعة خيارات.`
          : `كل مجموعات الخيارات هتتشال من ${product.row.name}.`,
      }
      return propose(ctx, 'set_product_modifiers', { productId: product.row.id, groupIds: ids }, preview, { product: product.row.name, groups: names }, `جاهز أحدّد خيارات ${product.row.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'create_ingredient',
    description: 'إضافة مادة جديدة للمخزون. حدد الاسم والوحدة والقسم، والمخزون والحد الأدنى وسعر العبوة اختياريين.',
    write: true,
    schema: z.object({
      name: z.string().min(1).max(100),
      unit: UNIT,
      category: CATEGORY.default('other'),
      storage: STORAGE.optional(),
      stock_quantity: z.number().nonnegative().max(1000000).optional(),
      min_stock: z.number().nonnegative().max(1000000).optional(),
      purchase_qty: z.number().positive().max(1000000).optional().describe('حجم العبوة بوحدة المادة، مثل 1000 جرام'),
      unit_cost: z.number().nonnegative().max(1000000).optional().describe('تكلفة الوحدة مباشرة'),
      package_price: z.number().nonnegative().max(1000000).optional().describe('سعر العبوة؛ بتتحسب منها تكلفة الوحدة'),
      supplier: z.string().max(120).nullable().optional(),
      secondary_supplier: z.string().max(120).nullable().optional(),
      supplier_ratio: z.number().min(0).max(1).optional(),
      planned_cost: z.number().nonnegative().max(1000000).optional(),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const name = args.name.trim()
      const purchaseQty = args.purchase_qty ?? (args.unit === 'g' ? 1000 : 1)
      if (purchaseQty <= 0) return toolOutput({ error: 'حجم العبوة لازم يكون أكبر من صفر' }, 'حجم العبوة لازم يكون أكبر من صفر')
      const unitCost = args.unit_cost != null
        ? r2(args.unit_cost)
        : args.package_price != null
          ? r2(args.package_price / purchaseQty)
          : 0
      if (unitCost < 0) return toolOutput({ error: 'تكلفة الوحدة لا تقل عن صفر' }, 'تكلفة الوحدة لا تقل عن صفر')

      const stockQuantity = args.stock_quantity ?? 0
      const minStock = args.min_stock ?? 0
      const category = args.category
      const storage = args.storage ?? defaultStorageForCategory(category)
      const supplier = cleanSupplier(args.supplier)
      const secondarySupplier = cleanSupplier(args.secondary_supplier)
      const supplierRatio = args.supplier_ratio ?? 0.7
      const plannedCost = r2(args.planned_cost ?? 0)

      const preview: ActionPreview = {
        title: 'إضافة مادة',
        subject: name,
        rows: [
          { label: 'القسم', value: categoryLabel(category) },
          { label: 'التخزين', value: storageLabel(storage) },
          { label: 'المخزون الافتتاحي', value: quantity(stockQuantity, args.unit) },
          { label: 'الحد الأدنى', value: quantity(minStock, args.unit) },
          { label: 'العبوة', value: `${purchaseQty} ${args.unit}` },
          { label: 'تكلفة الوحدة', value: money(unitCost) },
          ...(supplier ? [{ label: 'المورد', value: supplier }] : []),
        ],
        result: `${name} هيتضاف للمخزون برصيد ${quantity(stockQuantity, args.unit)} وتكلفة ${money(unitCost)}/${args.unit}.`,
      }

      return propose(ctx, 'create_ingredient', {
        name,
        unit: args.unit,
        category,
        storage,
        stockQuantity,
        minStock,
        costPerUnit: unitCost,
        purchaseQty,
        supplier,
        secondarySupplier,
        supplierRatio,
        plannedCost,
      }, preview, { ingredient: name, unit: args.unit, stock: stockQuantity }, `جاهز أضيف ${name} للمخزون — مستني تأكيدك`)
    },
  },

  {
    name: 'update_ingredient',
    description: 'تعديل بيانات مادة موجودة: الاسم، الوحدة، القسم، التخزين، الحد الأدنى، العبوة، التكلفة، الموردين، أو ظهورها. مش بيعدل الرصيد الحالي.',
    write: true,
    schema: z.object({
      ingredient: ingredientRef,
      name: z.string().min(1).max(100).optional(),
      unit: UNIT.optional(),
      category: CATEGORY.optional(),
      storage: STORAGE.optional(),
      min_stock: z.number().nonnegative().max(1000000).optional(),
      purchase_qty: z.number().positive().max(1000000).optional(),
      unit_cost: z.number().nonnegative().max(1000000).optional(),
      package_price: z.number().nonnegative().max(1000000).optional(),
      supplier: z.string().max(120).nullable().optional(),
      secondary_supplier: z.string().max(120).nullable().optional(),
      supplier_ratio: z.number().min(0).max(1).optional(),
      planned_cost: z.number().nonnegative().max(1000000).optional(),
      active: z.boolean().optional(),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveIngredient(args.ingredient, { includeInactive: true })
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)
      const current = inventory.getIngredientById(resolved.row.id) as any
      if (!current) return toolOutput({ error: 'المادة غير موجودة' }, 'المادة غير موجودة')

      const patch: Record<string, unknown> = {}
      const rows: ActionPreview['rows'] = []

      if (args.name !== undefined && args.name.trim() !== current.name) {
        patch.name = args.name.trim()
        rows.push({ label: 'الاسم', before: current.name, after: patch.name as string })
      }
      if (args.unit !== undefined && args.unit !== current.unit) {
        patch.unit = args.unit
        rows.push({ label: 'الوحدة', before: current.unit, after: args.unit })
      }
      if (args.category !== undefined && args.category !== current.category) {
        patch.category = args.category
        rows.push({ label: 'القسم', before: categoryLabel(current.category), after: categoryLabel(args.category) })
      }
      if (args.storage !== undefined && args.storage !== current.storage) {
        patch.storage = args.storage
        rows.push({ label: 'التخزين', before: storageLabel(current.storage), after: storageLabel(args.storage) })
      }
      if (args.min_stock !== undefined && r2(args.min_stock) !== Number(current.minStock)) {
        patch.minStock = r2(args.min_stock)
        rows.push({ label: 'الحد الأدنى', before: quantity(Number(current.minStock) || 0, current.unit), after: quantity(Number(patch.minStock), args.unit ?? current.unit) })
      }
      if (args.purchase_qty !== undefined && r2(args.purchase_qty) !== Number(current.purchaseQty)) {
        patch.purchaseQty = r2(args.purchase_qty)
        rows.push({ label: 'حجم العبوة', before: String(current.purchaseQty), after: String(patch.purchaseQty) })
      }
      const nextPack = Number(patch.purchaseQty ?? current.purchaseQty) || 1
      if (args.unit_cost !== undefined) {
        const unitCost = r2(args.unit_cost)
        if (unitCost !== Number(current.costPerUnit)) {
          patch.costPerUnit = unitCost
          rows.push({ label: 'تكلفة الوحدة', before: money(Number(current.costPerUnit) || 0), after: money(unitCost) })
        }
      } else if (args.package_price !== undefined) {
        const unitCost = r2(args.package_price / nextPack)
        if (unitCost !== Number(current.costPerUnit)) {
          patch.costPerUnit = unitCost
          rows.push({ label: 'سعر العبوة', before: money((Number(current.costPerUnit) || 0) * (Number(current.purchaseQty) || 1)), after: money(args.package_price) })
        }
      }
      if (args.supplier !== undefined) {
        const supplier = cleanSupplier(args.supplier)
        if (supplier !== (current.supplier ?? null)) {
          patch.supplier = supplier
          rows.push({ label: 'المورد', before: current.supplier || '—', after: supplier || '—' })
        }
      }
      if (args.secondary_supplier !== undefined) {
        const secondarySupplier = cleanSupplier(args.secondary_supplier)
        if (secondarySupplier !== (current.secondarySupplier ?? null)) {
          patch.secondarySupplier = secondarySupplier
          rows.push({ label: 'المورد الثاني', before: current.secondarySupplier || '—', after: secondarySupplier || '—' })
        }
      }
      if (args.supplier_ratio !== undefined && r2(args.supplier_ratio) !== Number(current.supplierRatio)) {
        patch.supplierRatio = r2(args.supplier_ratio)
        rows.push({ label: 'نسبة المورد', before: percent((Number(current.supplierRatio) || 0) * 100), after: percent(args.supplier_ratio * 100) })
      }
      if (args.planned_cost !== undefined && r2(args.planned_cost) !== Number(current.plannedCost)) {
        patch.plannedCost = r2(args.planned_cost)
        rows.push({ label: 'التكلفة المخططة', before: money(Number(current.plannedCost) || 0), after: money(patch.plannedCost as number) })
      }
      if (args.active !== undefined && Boolean(args.active) !== Boolean(current.active)) {
        patch.active = Boolean(args.active)
        rows.push({ label: 'الحالة', before: current.active ? 'نشطة' : 'معطلة', after: args.active ? 'نشطة' : 'معطلة' })
      }

      if (Object.keys(patch).length === 0) {
        return toolOutput({ error: 'مفيش أي تغيير في البيانات' }, 'مفيش أي تغيير في البيانات')
      }

      const preview: ActionPreview = {
        title: 'تعديل مادة',
        subject: current.name,
        rows: rows.slice(0, 8),
        result: `${current.name} هيتحدّث بعد التأكيد.`,
      }
      return propose(ctx, 'update_ingredient', { ingredientId: current.id, patch }, preview, { ingredient: current.name, changes: Object.keys(patch) }, `جاهز أعدّل ${current.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'delete_ingredient',
    description: 'تعطيل/حذف مادة من المخزون (حذف ناعم). لو المادة مستخدمة في وصفة، لازم تشيل ارتباطاتها الأول.',
    write: true,
    schema: z.object({
      ingredient: ingredientRef,
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveIngredient(args.ingredient, { includeInactive: true })
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)
      const ingredient = inventory.getIngredientById(resolved.row.id) as any
      if (!ingredient) return toolOutput({ error: 'المادة غير موجودة' }, 'المادة غير موجودة')

      const products = inventory.listIngredientProducts(ingredient.id) as any[]
      const preview: ActionPreview = {
        title: 'تعطيل مادة',
        subject: ingredient.name,
        rows: [
          { label: 'المخزون', value: quantity(Number(ingredient.stockQuantity) || 0, String(ingredient.unit ?? '')) },
          { label: 'منتجات مرتبطة', value: String(products.length) },
          { label: 'الحالة', before: ingredient.active ? 'نشطة' : 'معطلة', after: 'معطلة' },
        ],
        result: `${ingredient.name} هتتعطّل ومش هتظهر في المخزون.`,
        warning: products.length > 0
          ? `المادة مستخدمة في ${products.length} منتج. الحذف هيفشل إلا لو شيلت ارتباطاتها من الوصفات أولاً.`
          : undefined,
      }
      return propose(ctx, 'delete_ingredient', { ingredientId: ingredient.id }, preview, { ingredient: ingredient.name, products: products.length }, `جاهز أعطّل ${ingredient.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'add_recipe_line',
    description: 'إضافة مكون أو وصفة فرعية لوصفة صنف، بكمية للوحدة. بيحسب تكلفة الوصفة قبل وبعد.',
    write: true,
    schema: z.object({
      product: productRef,
      ingredient: ingredientRef.optional().describe('اسم المادة؛ استخدم واحد من ingredient أو subrecipe'),
      subrecipe: subRecipeRef.optional().describe('اسم الوصفة الفرعية؛ استخدم واحد من ingredient أو subrecipe'),
      quantity: z.number().positive().max(1000000).describe('الكمية للوحدة الواحدة من الصنف'),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const product = resolveProduct(args.product)
      if (!product.ok) return toolOutput({ error: product.error }, product.error)
      if (Boolean(args.ingredient) === Boolean(args.subrecipe)) {
        return toolOutput({ error: 'حدد مادة أو وصفة فرعية واحدة بس' }, 'حدد مادة أو وصفة فرعية واحدة بس')
      }

      const productRow = catalog.getProductById(product.row.id) as any
      if (!productRow) return toolOutput({ error: 'الصنف غير موجود' }, 'الصنف غير موجود')

      let ingredientId: string | null = null
      let subRecipeId: string | null = null
      let componentName = ''
      let unit = ''
      let unitCost = 0
      if (args.ingredient) {
        const ingredient = resolveIngredient(args.ingredient)
        if (!ingredient.ok) return toolOutput({ error: ingredient.error }, ingredient.error)
        ingredientId = ingredient.row.id
        componentName = ingredient.row.name
        unit = ingredient.row.unit
        unitCost = ingredient.row.costPerUnit
      } else if (args.subrecipe) {
        const sub = resolveSubRecipe(args.subrecipe)
        if (!sub.ok) return toolOutput({ error: sub.error }, sub.error)
        subRecipeId = sub.row.id
        componentName = sub.row.name
        unit = sub.row.unit
        unitCost = subRecipeUnitCost(sub.row.id)
      }

      const qty = r2(args.quantity)
      if (qty <= 0) return toolOutput({ error: 'الكمية لازم تكون أكبر من صفر' }, 'الكمية لازم تكون أكبر من صفر')
      const lineCost = Math.round(qty * unitCost * 100) / 100
      const before = recipeTotal(productRow.id)
      const after = Math.round((before + lineCost) * 100) / 100

      const preview: ActionPreview = {
        title: 'إضافة مكون للوصفة',
        subject: productRow.name,
        rows: [
          { label: 'المكون', value: componentName },
          { label: 'الكمية', value: quantity(qty, unit) },
          { label: 'تكلفة المكون', value: money(lineCost) },
          { label: 'تكلفة الوصفة', before: money(before), after: money(after), tone: 'up' },
        ],
        result: `${componentName} هيتضاف لوصفة ${productRow.name}، وتكلفة الوصفة تبقى ${money(after)}.`,
        warning: Number(productRow.price) > 0 && after > Number(productRow.price)
          ? `تكلفة الوصفة هتبقى أعلى من سعر البيع (${money(Number(productRow.price))}).`
          : undefined,
      }

      return propose(ctx, 'add_recipe_line', {
        productId: productRow.id,
        ingredientId,
        subRecipeId,
        quantityPerUnit: qty,
      }, preview, { product: productRow.name, component: componentName, quantity: qty, cost: lineCost }, `جاهز أضيف ${componentName} لوصفة ${productRow.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'update_recipe_line',
    description: 'تعديل كمية مكون موجود في وصفة صنف باستخدام line id من product_details أو recipe_costs. لتغيير المكون نفسه امسح السطر وأضف واحد جديد.',
    write: true,
    schema: z.object({
      line_id: z.string().min(1).describe('id سطر الوصفة'),
      quantity: z.number().positive().max(1000000),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const line = inventory.getRecipeById(args.line_id) as any
      if (!line) return toolOutput({ error: 'سطر الوصفة غير موجود' }, 'سطر الوصفة غير موجود')
      const product = catalog.getProductById(String(line.productId)) as any
      if (!product) return toolOutput({ error: 'الصنف غير موجود' }, 'الصنف غير موجود')

      const lines = recipeLines(String(line.productId))
      const currentLine = lines.find((entry) => String(entry.id) === String(line.id))
      if (!currentLine) return toolOutput({ error: 'مش قادر أقرأ سطر الوصفة' }, 'مش قادر أقرأ سطر الوصفة')

      const qty = r2(args.quantity)
      if (qty <= 0) return toolOutput({ error: 'الكمية لازم تكون أكبر من صفر' }, 'الكمية لازم تكون أكبر من صفر')
      const unitCost = Number(currentLine.ingredientId
        ? currentLine.costPerUnit
        : currentLine.subRecipeCostPerUnit) || 0
      const oldLineCost = Number(currentLine.lineCost) || 0
      const newLineCost = Math.round(qty * unitCost * 100) / 100
      const before = recipeTotal(String(line.productId))
      const after = Math.round((before - oldLineCost + newLineCost) * 100) / 100
      const component = String(currentLine.ingredientName ?? currentLine.subRecipeName ?? '')
      const unit = String(currentLine.unit ?? currentLine.subRecipeUnit ?? '')

      const preview: ActionPreview = {
        title: 'تعديل كمية مكون',
        subject: product.name,
        rows: [
          { label: 'المكون', value: component },
          { label: 'الكمية', before: quantity(Number(currentLine.quantityPerUnit) || 0, unit), after: quantity(qty, unit) },
          { label: 'تكلفة الوصفة', before: money(before), after: money(after), tone: newLineCost >= oldLineCost ? 'up' : 'down' },
        ],
        result: `كمية ${component} في ${product.name} هتبقى ${quantity(qty, unit)}، وتكلفة الوصفة ${money(after)}.`,
        warning: Number(product.price) > 0 && after > Number(product.price)
          ? `تكلفة الوصفة هتبقى أعلى من سعر البيع (${money(Number(product.price))}).`
          : undefined,
      }

      return propose(ctx, 'update_recipe_line', {
        recipeId: line.id,
        ingredientId: line.ingredientId,
        subRecipeId: line.subRecipeId,
        quantityPerUnit: qty,
      }, preview, { product: product.name, component, quantity: qty, cost: newLineCost }, `جاهز أعدّل كمية ${component} — مستني تأكيدك`)
    },
  },

  {
    name: 'remove_recipe_line',
    description: 'حذف مكون أو وصفة فرعية من وصفة صنف باستخدام line id.',
    write: true,
    schema: z.object({
      line_id: z.string().min(1).describe('id سطر الوصفة'),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const line = inventory.getRecipeById(args.line_id) as any
      if (!line) return toolOutput({ error: 'سطر الوصفة غير موجود' }, 'سطر الوصفة غير موجود')
      const product = catalog.getProductById(String(line.productId)) as any
      if (!product) return toolOutput({ error: 'الصنف غير موجود' }, 'الصنف غير موجود')

      const currentLine = recipeLines(String(line.productId)).find((entry) => String(entry.id) === String(line.id))
      if (!currentLine) return toolOutput({ error: 'مش قادر أقرأ سطر الوصفة' }, 'مش قادر أقرأ سطر الوصفة')
      const component = String(currentLine.ingredientName ?? currentLine.subRecipeName ?? '')
      const unit = String(currentLine.unit ?? currentLine.subRecipeUnit ?? '')
      const before = recipeTotal(String(line.productId))
      const after = Math.round((before - (Number(currentLine.lineCost) || 0)) * 100) / 100

      const preview: ActionPreview = {
        title: 'حذف مكون من الوصفة',
        subject: product.name,
        rows: [
          { label: 'المكون', value: component },
          { label: 'الكمية', value: quantity(Number(currentLine.quantityPerUnit) || 0, unit) },
          { label: 'تكلفة الوصفة', before: money(before), after: money(after), tone: 'down' },
        ],
        result: `${component} هيتشال من وصفة ${product.name}، وتكلفة الوصفة تبقى ${money(after)}.`,
      }

      return propose(ctx, 'remove_recipe_line', { recipeId: line.id }, preview, { product: product.name, component }, `جاهز أشيل ${component} من وصفة ${product.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'create_subrecipe',
    description: 'إنشاء وصفة فرعية جديدة (صوص/عجينة/تجهيز) بوحدة قياس.',
    write: true,
    schema: z.object({
      name: z.string().min(1).max(100),
      unit: z.string().min(1).max(30).optional().describe('وحدة الوصفة، افتراضي «وحدة»'),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const name = args.name.trim()
      const unit = args.unit?.trim() || 'وحدة'
      const preview: ActionPreview = {
        title: 'إضافة وصفة فرعية',
        subject: name,
        rows: [{ label: 'الوحدة', value: unit }],
        result: `${name} هتتضاف كوصفة فرعية بوحدة ${unit}.`,
      }
      return propose(ctx, 'create_subrecipe', { name, unit }, preview, { subrecipe: name, unit }, `جاهز أضيف وصفة ${name} — مستني تأكيدك`)
    },
  },

  {
    name: 'update_subrecipe',
    description: 'تعديل اسم أو وحدة أو حالة وصفة فرعية.',
    write: true,
    schema: z.object({
      subrecipe: subRecipeRef,
      name: z.string().min(1).max(100).optional(),
      unit: z.string().min(1).max(30).optional(),
      active: z.boolean().optional(),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveSubRecipe(args.subrecipe)
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)
      const rows = [] as ActionPreview['rows']
      const name = args.name?.trim() || resolved.row.name
      const unit = args.unit?.trim() || resolved.row.unit
      if (name !== resolved.row.name) rows.push({ label: 'الاسم', before: resolved.row.name, after: name })
      if (unit !== resolved.row.unit) rows.push({ label: 'الوحدة', before: resolved.row.unit, after: unit })
      if (args.active !== undefined && args.active !== resolved.row.active) rows.push({ label: 'الحالة', before: resolved.row.active ? 'نشطة' : 'معطلة', after: args.active ? 'نشطة' : 'معطلة' })
      if (rows.length === 0) return toolOutput({ error: 'مفيش أي تغيير في البيانات' }, 'مفيش أي تغيير في البيانات')

      const preview: ActionPreview = {
        title: 'تعديل وصفة فرعية',
        subject: resolved.row.name,
        rows,
        result: `${resolved.row.name} هتتحدّث بعد التأكيد.`,
      }
      return propose(ctx, 'update_subrecipe', { subRecipeId: resolved.row.id, name, unit, active: args.active ?? resolved.row.active }, preview, { subrecipe: resolved.row.name }, `جاهز أعدّل ${resolved.row.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'delete_subrecipe',
    description: 'تعطيل وصفة فرعية (حذف ناعم). لو مرتبطة بمنتجات/إضافات/خيارات، لازم تشيل الارتباطات الأول.',
    write: true,
    schema: z.object({ subrecipe: subRecipeRef }),
    async run(args, ctx): Promise<ToolOutput> {
      const resolved = resolveSubRecipe(args.subrecipe)
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)
      const preview: ActionPreview = {
        title: 'تعطيل وصفة فرعية',
        subject: resolved.row.name,
        rows: [{ label: 'الوحدة', value: resolved.row.unit }, { label: 'الحالة', before: 'نشطة', after: 'معطلة' }],
        result: `${resolved.row.name} هتتعطّل ومش هتظهر في اختيارات الوصفات.`,
        warning: 'لو الوصفة مرتبطة بمنتجات أو إضافات أو خيارات، الحذف هيفشل لحد ما تشيل الارتباطات.',
      }
      return propose(ctx, 'delete_subrecipe', { subRecipeId: resolved.row.id }, preview, { subrecipe: resolved.row.name }, `جاهز أعطّل ${resolved.row.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'add_subrecipe_ingredient',
    description: 'إضافة مادة لمكونات وصفة فرعية بكمية للوحدة.',
    write: true,
    schema: z.object({
      subrecipe: subRecipeRef,
      ingredient: ingredientRef,
      quantity: z.number().positive().max(1000000),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const sub = resolveSubRecipe(args.subrecipe)
      if (!sub.ok) return toolOutput({ error: sub.error }, sub.error)
      const ingredient = resolveIngredient(args.ingredient)
      if (!ingredient.ok) return toolOutput({ error: ingredient.error }, ingredient.error)

      const qty = r2(args.quantity)
      if (qty <= 0) return toolOutput({ error: 'الكمية لازم تكون أكبر من صفر' }, 'الكمية لازم تكون أكبر من صفر')
      const lineCost = Math.round(qty * ingredient.row.costPerUnit * 100) / 100
      const before = Math.round((inventory.listSubRecipeIngredients(sub.row.id) as any[])
        .reduce((sum, line) => sum + (Number(line.lineCost) || 0), 0) * 100) / 100
      const after = Math.round((before + lineCost) * 100) / 100

      const preview: ActionPreview = {
        title: 'إضافة مكون لوصفة فرعية',
        subject: sub.row.name,
        rows: [
          { label: 'المكون', value: ingredient.row.name },
          { label: 'الكمية', value: quantity(qty, ingredient.row.unit) },
          { label: 'التكلفة', value: money(lineCost) },
          { label: 'تكلفة الوصفة', before: money(before), after: money(after), tone: 'up' },
        ],
        result: `${ingredient.row.name} هيتضاف لوصفة ${sub.row.name}، وتكلفة الوحدة تبقى ${money(after)}.`,
      }
      return propose(ctx, 'add_subrecipe_ingredient', {
        subRecipeId: sub.row.id,
        ingredientId: ingredient.row.id,
        quantityPerUnit: qty,
      }, preview, { subrecipe: sub.row.name, ingredient: ingredient.row.name, quantity: qty }, `جاهز أضيف ${ingredient.row.name} لوصفة ${sub.row.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'update_subrecipe_ingredient',
    description: 'تعديل كمية مادة داخل وصفة فرعية باستخدام line id من subrecipe_details.',
    write: true,
    schema: z.object({
      line_id: z.string().min(1),
      quantity: z.number().positive().max(1000000),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const line = inventory.getSubRecipeIngredientById(args.line_id) as any
      if (!line) return toolOutput({ error: 'سطر مكون الوصفة غير موجود' }, 'سطر مكون الوصفة غير موجود')
      const sub = inventory.listSubRecipes().find((entry: any) => String(entry.id) === String(line.subRecipeId)) as any
      const ingredient = inventory.getIngredientById(String(line.ingredientId)) as any
      if (!sub || !ingredient) return toolOutput({ error: 'مش قادر أقرأ بيانات المكون' }, 'مش قادر أقرأ بيانات المكون')

      const qty = r2(args.quantity)
      if (qty <= 0) return toolOutput({ error: 'الكمية لازم تكون أكبر من صفر' }, 'الكمية لازم تكون أكبر من صفر')
      const oldLineCost = Math.round((Number(line.quantityPerUnit) || 0) * (Number(ingredient.costPerUnit) || 0) * 100) / 100
      const newLineCost = Math.round(qty * (Number(ingredient.costPerUnit) || 0) * 100) / 100
      const before = Math.round((inventory.listSubRecipeIngredients(String(line.subRecipeId)) as any[])
        .reduce((sum, entry) => sum + (Number(entry.lineCost) || 0), 0) * 100) / 100
      const after = Math.round((before - oldLineCost + newLineCost) * 100) / 100

      const preview: ActionPreview = {
        title: 'تعديل كمية مكون',
        subject: sub.name,
        rows: [
          { label: 'المكون', value: ingredient.name },
          { label: 'الكمية', before: quantity(Number(line.quantityPerUnit) || 0, ingredient.unit), after: quantity(qty, ingredient.unit) },
          { label: 'تكلفة الوصفة', before: money(before), after: money(after), tone: newLineCost >= oldLineCost ? 'up' : 'down' },
        ],
        result: `كمية ${ingredient.name} في ${sub.name} هتبقى ${quantity(qty, ingredient.unit)}، وتكلفة الوحدة ${money(after)}.`,
      }
      return propose(ctx, 'update_subrecipe_ingredient', {
        lineId: line.id,
        subRecipeId: line.subRecipeId,
        ingredientId: line.ingredientId,
        quantityPerUnit: qty,
      }, preview, { subrecipe: sub.name, ingredient: ingredient.name, quantity: qty }, `جاهز أعدّل كمية ${ingredient.name} — مستني تأكيدك`)
    },
  },

  {
    name: 'remove_subrecipe_ingredient',
    description: 'حذف مادة من وصفة فرعية باستخدام line id.',
    write: true,
    schema: z.object({ line_id: z.string().min(1) }),
    async run(args, ctx): Promise<ToolOutput> {
      const line = inventory.getSubRecipeIngredientById(args.line_id) as any
      if (!line) return toolOutput({ error: 'سطر مكون الوصفة غير موجود' }, 'سطر مكون الوصفة غير موجود')
      const sub = inventory.listSubRecipes().find((entry: any) => String(entry.id) === String(line.subRecipeId)) as any
      const ingredient = inventory.getIngredientById(String(line.ingredientId)) as any
      if (!sub || !ingredient) return toolOutput({ error: 'مش قادر أقرأ بيانات المكون' }, 'مش قادر أقرأ بيانات المكون')

      const before = Math.round((inventory.listSubRecipeIngredients(String(line.subRecipeId)) as any[])
        .reduce((sum, entry) => sum + (Number(entry.lineCost) || 0), 0) * 100) / 100
      const after = Math.round((before - (Number(ingredient.costPerUnit) || 0) * (Number(line.quantityPerUnit) || 0)) * 100) / 100

      const preview: ActionPreview = {
        title: 'حذف مكون من وصفة فرعية',
        subject: sub.name,
        rows: [
          { label: 'المكون', value: ingredient.name },
          { label: 'الكمية', value: quantity(Number(line.quantityPerUnit) || 0, ingredient.unit) },
          { label: 'تكلفة الوصفة', before: money(before), after: money(after), tone: 'down' },
        ],
        result: `${ingredient.name} هيتشال من وصفة ${sub.name}.`,
      }
      return propose(ctx, 'remove_subrecipe_ingredient', { lineId: line.id }, preview, { subrecipe: sub.name, ingredient: ingredient.name }, `جاهز أشيل ${ingredient.name} من ${sub.name} — مستني تأكيدك`)
    },
  },
]
