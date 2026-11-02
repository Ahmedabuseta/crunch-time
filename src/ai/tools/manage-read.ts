// Read tools for the catalog editor.
//
// The original eight tools were report-shaped. These expose the records the
// owner edits: the full product, everything it is linked to, the full
// ingredient, and the recipe lines with the ids needed to change them.
import { z } from 'zod'
import * as addonsBackend from '../../backend/addons'
import * as catalog from '../../backend/catalog'
import * as inventory from '../../backend/inventory'
import * as modifiersBackend from '../../backend/modifiers'
import { normalizeArabic } from '../guard/arabic'
import { money, percent, quantity, metricsCard, tableCard } from '../cards'
import type { ToolOutput } from '../schemas'
import { resolveIngredient, resolveProduct, resolveSubRecipe } from './resolve'
import { toolOutput, type ToolDef } from './types'

const searchText = (value: unknown) => normalizeArabic(String(value ?? '').toLowerCase())

function matches(query: string, values: unknown[]): boolean {
  const needle = searchText(query)
  if (!needle) return true
  return values.some((value) => searchText(value).includes(needle))
}

function margin(price: number, cost: number): number {
  return price > 0 ? ((price - cost) / price) * 100 : 0
}

export const MANAGE_READ_TOOLS: ToolDef[] = [
  {
    name: 'product_price',
    description: 'سعر بيع صنف واحد وتكلفته وهامشه. استخدمها لأي سؤال «بكام؟» أو «سعر كذا كام؟»؛ مش لعرض كل الأصناف.',
    write: false,
    schema: z.object({
      product: z.string().min(1).describe('اسم الصنف أو id'),
    }),
    async run(args): Promise<ToolOutput> {
      const resolved = resolveProduct(args.product, { includeInactive: true })
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const product = catalog.getProductById(resolved.row.id) as any
      if (!product) return toolOutput({ error: 'الصنف غير موجود' }, 'الصنف غير موجود')

      const price = Number(product.price) || 0
      const cost = Number(product.costPrice) || 0
      const marginPct = Math.round(margin(price, cost) * 10) / 10
      const data = {
        product: String(product.name),
        price,
        cost,
        marginPct,
        active: Boolean(product.active),
      }
      const summary = `سعر ${product.name} ${money(price)} — التكلفة ${cost > 0 ? money(cost) : 'غير محددة'} — الهامش ${percent(marginPct)}`
      const cards = [
        metricsCard('السعر والتكلفة', [
          { label: 'سعر البيع', value: money(price) },
          { label: 'التكلفة', value: cost > 0 ? money(cost) : '—' },
          { label: 'الهامش', value: percent(marginPct), tone: marginPct >= 0 ? 'good' : 'bad' },
        ]),
      ]
      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'product_list',
    description: 'كل الأصناف أو بحث فيها: السعر، التكلفة، القسم، الوصف، الحالة، والهامش. بيدعم فلترة بحد سعر أدنى/أعلى. استخدمها قبل اختيار منتج للتعديل.',
    write: false,
    schema: z.object({
      search: z.string().optional().describe('بحث في الاسم أو الوصف أو القسم'),
      category: z.string().optional().describe('اسم القسم أو id'),
      min_price: z.number().nonnegative().max(1000000).optional().describe('أقل سعر بيع'),
      max_price: z.number().nonnegative().max(1000000).optional().describe('أعلى سعر بيع'),
      include_inactive: z.boolean().optional().describe('true = اعرض الأصناف المخفية كمان'),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async run(args): Promise<ToolOutput> {
      if (args.min_price != null && args.max_price != null && args.min_price > args.max_price) {
        return toolOutput({ error: 'أقل سعر أكبر من أعلى سعر' }, 'أقل سعر أكبر من أعلى سعر')
      }
      const categories = (catalog.listCategories() as any).all() as any[]
      const categoryById = new Map(categories.map((row) => [String(row.id), String(row.name)]))
      const categoryFilter = args.category ? searchText(args.category) : ''
      const rows = (catalog.listProducts(undefined, true) as any[])
        .filter((row) => Boolean(row.active) || Boolean(args.include_inactive))
        .filter((row) => {
          if (!categoryFilter) return true
          return searchText(row.categoryId) === categoryFilter
            || searchText(categoryById.get(String(row.categoryId))).includes(categoryFilter)
        })
        .filter((row) => {
          const price = Number(row.price) || 0
          if (args.min_price != null && price < args.min_price) return false
          if (args.max_price != null && price > args.max_price) return false
          return true
        })
        .filter((row) => matches(args.search ?? '', [
          row.name,
          row.description,
          categoryById.get(String(row.categoryId)),
        ]))

      const limit = Math.min(Number(args.limit) || 25, 50)
      const items = rows.slice(0, limit).map((row) => {
        const price = Number(row.price) || 0
        const cost = Number(row.costPrice) || 0
        return {
          id: String(row.id),
          name: String(row.name),
          price,
          costPrice: cost,
          categoryId: String(row.categoryId),
          category: categoryById.get(String(row.categoryId)) ?? null,
          emoji: String(row.emoji ?? ''),
          description: String(row.description ?? ''),
          supportsRollback: Boolean(row.supportsRollback),
          active: Boolean(row.active),
          marginPct: Math.round(margin(price, cost) * 10) / 10,
        }
      })

      const data = { items, total: rows.length, shown: items.length, minPrice: args.min_price ?? null, maxPrice: args.max_price ?? null }
      const hidden = rows.filter((row) => !row.active).length
      const range = args.min_price != null || args.max_price != null
        ? ` بين ${args.min_price != null ? money(args.min_price) : '0'} و${args.max_price != null ? money(args.max_price) : '∞'}`
        : ''
      const summary = items.length
        ? `${items.length} صنف${range}${hidden ? ` منهم ${hidden} مخفي` : ''}`
        : `مفيش أصناف مطابقة${range}`

      const cards = items.length
        ? [
            tableCard(
              'الأصناف',
              ['الصنف', 'القسم', 'السعر', 'التكلفة', 'الحالة'],
              items.map((row) => [
                row.name,
                row.category ?? '—',
                money(row.price),
                row.costPrice > 0 ? money(row.costPrice) : '—',
                row.active ? 'ظاهر' : 'مخفي',
              ]),
            ),
          ]
        : []

      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'product_details',
    description: 'كل تفاصيل صنف واحد: بياناته، الإضافات، مجموعات الخيارات، ومكونات الوصفة. لسعر صنف استخدم product_price.',
    write: false,
    schema: z.object({
      product: z.string().min(1).describe('اسم الصنف أو id'),
    }),
    async run(args): Promise<ToolOutput> {
      const resolved = resolveProduct(args.product, { includeInactive: true })
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const product = catalog.getProductById(resolved.row.id) as any
      if (!product) return toolOutput({ error: 'الصنف غير موجود' }, 'الصنف غير موجود')

      const category = catalog.getCategoryById(String(product.categoryId)) as any
      const linkedAddons = (addonsBackend.listAddonsByProduct(product.id) as any).all() as any[]
      const modifierGroups = modifiersBackend.listModifiersByProduct(product.id) as any[]
      const recipeLines = inventory.listRecipes(product.id) as any[]
      const recipe = recipeLines.map((line) => ({
        lineId: String(line.id),
        kind: line.subRecipeId ? 'sub_recipe' : 'ingredient',
        ingredientId: line.ingredientId ? String(line.ingredientId) : null,
        subRecipeId: line.subRecipeId ? String(line.subRecipeId) : null,
        name: String(line.ingredientName ?? line.subRecipeName ?? ''),
        quantity: Number(line.quantityPerUnit) || 0,
        unit: String(line.unit ?? line.subRecipeUnit ?? ''),
        lineCost: Math.round((Number(line.lineCost) || 0) * 100) / 100,
      }))
      const recipeCost = Math.round(recipe.reduce((sum, line) => sum + line.lineCost, 0) * 100) / 100

      const data = {
        product: {
          id: String(product.id),
          name: String(product.name),
          price: Number(product.price) || 0,
          costPrice: Number(product.costPrice) || 0,
          categoryId: String(product.categoryId),
          category: category?.name ?? null,
          emoji: String(product.emoji ?? ''),
          description: String(product.description ?? ''),
          supportsRollback: Boolean(product.supportsRollback),
          active: Boolean(product.active),
        },
        addons: linkedAddons,
        modifierGroups,
        recipe,
        recipeCost,
      }

      const summary = `${product.name}: ${money(Number(product.price) || 0)} — تكلفة الوصفة ${money(recipeCost)} (هامش ${percent(margin(Number(product.price) || 0, recipeCost))})`
      const cards = recipe.length
        ? [
            tableCard(
              `مكونات ${product.name}`,
              ['المكون', 'الكمية', 'التكلفة'],
              recipe.map((line) => [line.name, quantity(line.quantity, line.unit), money(line.lineCost)]),
            ),
          ]
        : [
            tableCard(
              'بيانات الصنف',
              ['القسم', 'السعر', 'التكلفة', 'الحالة'],
              [[data.product.category ?? '—', money(data.product.price), money(data.product.costPrice), data.product.active ? 'ظاهر' : 'مخفي']],
            ),
          ]

      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'ingredient_list',
    description: 'كل المواد أو بحث فيها: المخزون، الحد الأدنى، التكلفة، القسم، التخزين، المورد، وعدد المنتجات المرتبطة.',
    write: false,
    schema: z.object({
      search: z.string().optional().describe('بحث في الاسم أو القسم أو المورد'),
      category: z.string().optional().describe('قسم المخزون مثل protein أو dairy'),
      storage: z.enum(['freezer', 'fridge', 'dry']).optional(),
      low_only: z.boolean().optional().describe('true = اللي تحت الحد الأدنى بس'),
      include_inactive: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async run(args): Promise<ToolOutput> {
      const rows = (inventory.listIngredients({ includeInactive: true }) as any[])
        .filter((row) => Boolean(row.active) || Boolean(args.include_inactive))
        .filter((row) => !args.category || String(row.category) === args.category)
        .filter((row) => !args.storage || String(row.storage) === args.storage)
        .filter((row) => !args.low_only || Number(row.stockQuantity) <= Number(row.minStock))
        .filter((row) => matches(args.search ?? '', [row.name, row.category, row.storage, row.supplier, row.secondarySupplier]))

      const limit = Math.min(Number(args.limit) || 30, 50)
      const items = rows.slice(0, limit).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        unit: String(row.unit ?? ''),
        stockQuantity: Number(row.stockQuantity) || 0,
        minStock: Number(row.minStock) || 0,
        costPerUnit: Number(row.costPerUnit) || 0,
        purchaseQty: Number(row.purchaseQty) || 1,
        supplier: row.supplier ?? null,
        secondarySupplier: row.secondarySupplier ?? null,
        supplierRatio: Number(row.supplierRatio) || 0,
        plannedCost: Number(row.plannedCost) || 0,
        category: String(row.category ?? 'other'),
        storage: String(row.storage ?? 'dry'),
        active: Boolean(row.active),
        productCount: Number(row.productCount) || 0,
        recipeProductCount: Number(row.recipeProductCount) || 0,
        optionalProductCount: Number(row.optionalProductCount) || 0,
      }))

      const data = { items, total: rows.length, shown: items.length }
      const summary = items.length ? `${items.length} مادة${args.low_only ? ' تحت الحد الأدنى' : ''}` : 'مفيش مواد مطابقة'
      const cards = items.length
        ? [
            tableCard(
              'المواد',
              ['المادة', 'المخزون', 'الحد الأدنى', 'التكلفة', 'منتجات'],
              items.map((row) => [
                row.name,
                quantity(row.stockQuantity, row.unit),
                quantity(row.minStock, row.unit),
                money(row.costPerUnit),
                String(row.productCount),
              ]),
            ),
          ]
        : []

      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'ingredient_details',
    description: 'كل تفاصيل مادة: بياناتها كاملة، سعر الشراء والعبوة، الموردين، والمنتجات اللي بتدخل فيها.',
    write: false,
    schema: z.object({
      ingredient: z.string().min(1).describe('اسم المادة أو id'),
    }),
    async run(args): Promise<ToolOutput> {
      const resolved = resolveIngredient(args.ingredient, { includeInactive: true })
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const ingredient = inventory.getIngredientById(resolved.row.id) as any
      if (!ingredient) return toolOutput({ error: 'المادة غير موجودة' }, 'المادة غير موجودة')

      const products = inventory.listIngredientProducts(ingredient.id) as any[]
      const data = {
        ingredient: {
          id: String(ingredient.id),
          name: String(ingredient.name),
          unit: String(ingredient.unit ?? ''),
          stockQuantity: Number(ingredient.stockQuantity) || 0,
          minStock: Number(ingredient.minStock) || 0,
          costPerUnit: Number(ingredient.costPerUnit) || 0,
          purchaseQty: Number(ingredient.purchaseQty) || 1,
          supplier: ingredient.supplier ?? null,
          secondarySupplier: ingredient.secondarySupplier ?? null,
          supplierRatio: Number(ingredient.supplierRatio) || 0,
          plannedCost: Number(ingredient.plannedCost) || 0,
          category: String(ingredient.category ?? 'other'),
          storage: String(ingredient.storage ?? 'dry'),
          active: Boolean(ingredient.active),
        },
        products: products.map((product) => ({
          id: String(product.id),
          name: String(product.name),
          active: Boolean(product.active),
          inBase: Boolean(product.inBase),
          links: Array.isArray(product.links) ? product.links : [],
        })),
      }

      const summary = `${ingredient.name}: ${quantity(Number(ingredient.stockQuantity) || 0, String(ingredient.unit ?? ''))} — مرتبطة بـ ${products.length} منتج`
      const cards = products.length
        ? [
            tableCard(
              `منتجات ${ingredient.name}`,
              ['المنتج', 'داخل الوصفة', 'كإضافة', 'الحالة'],
              products.map((product) => [
                product.name,
                product.inBase ? 'نعم' : 'لا',
                product.inBase ? 'لا' : 'نعم',
                product.active ? 'ظاهر' : 'مخفي',
              ]),
            ),
          ]
        : []

      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'subrecipe_list',
    description: 'كل الوصفات الفرعية وتكلفة الوحدة وعدد مكوناتها. استخدمها قبل ربط وصفة فرعية بمنتج.',
    write: false,
    schema: z.object({
      search: z.string().optional(),
      include_inactive: z.boolean().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async run(args): Promise<ToolOutput> {
      const rows = (inventory.listSubRecipes() as any[])
        .filter((row) => Boolean(row.active) || Boolean(args.include_inactive))
        .filter((row) => matches(args.search ?? '', [row.name]))
      const limit = Math.min(Number(args.limit) || 30, 50)
      const items = rows.slice(0, limit).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        unit: String(row.unit ?? ''),
        costPerUnit: Number(row.costPerUnit) || 0,
        ingredientCount: Number(row.ingredientCount) || 0,
        active: Boolean(row.active),
      }))

      const summary = items.length ? `${items.length} وصفة فرعية` : 'مفيش وصفات فرعية'
      const cards = items.length
        ? [
            tableCard(
              'الوصفات الفرعية',
              ['الوصفة', 'الوحدة', 'التكلفة', 'المكونات', 'الحالة'],
              items.map((row) => [row.name, row.unit, money(row.costPerUnit), String(row.ingredientCount), row.active ? 'نشطة' : 'معطلة']),
            ),
          ]
        : []
      return toolOutput({ items, total: rows.length }, summary, cards)
    },
  },

  {
    name: 'subrecipe_details',
    description: 'مكونات وصفة فرعية وتكلفة كل مكون، مع line id لكل مكون.',
    write: false,
    schema: z.object({
      subrecipe: z.string().min(1).describe('اسم الوصفة الفرعية أو id'),
    }),
    async run(args): Promise<ToolOutput> {
      const resolved = resolveSubRecipe(args.subrecipe)
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const rows = inventory.listSubRecipeIngredients(resolved.row.id) as any[]
      const items = rows.map((line) => ({
        lineId: String(line.id),
        ingredientId: String(line.ingredientId),
        name: String(line.ingredientName ?? ''),
        quantity: Number(line.quantityPerUnit) || 0,
        unit: String(line.unit ?? ''),
        unitCost: Number(line.costPerUnit) || 0,
        lineCost: Math.round((Number(line.lineCost) || 0) * 100) / 100,
      }))
      const cost = Math.round(items.reduce((sum, line) => sum + line.lineCost, 0) * 100) / 100
      const data = { subrecipe: resolved.row, items, costPerUnit: cost }
      const summary = `${resolved.row.name}: ${items.length} مكون — ${money(cost)} للوحدة`
      const cards = items.length
        ? [
            tableCard(
              `مكونات ${resolved.row.name}`,
              ['المكون', 'الكمية', 'التكلفة'],
              items.map((line) => [line.name, quantity(line.quantity, line.unit), money(line.lineCost)]),
            ),
          ]
        : []
      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'category_list',
    description: 'أقسام المنيو المتاحة بأسمائها و ids — محتاجة قبل إنشاء أو تعديل منتج.',
    write: false,
    schema: z.object({}),
    async run(): Promise<ToolOutput> {
      const rows = (catalog.listCategories() as any).all() as any[]
      const items = rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        sortOrder: Number(row.sortOrder) || 0,
      }))
      const summary = items.length ? `${items.length} قسم` : 'مفيش أقسام'
      const cards = items.length
        ? [tableCard('أقسام المنيو', ['القسم', 'id'], items.map((row) => [row.name, row.id]))]
        : []
      return toolOutput({ categories: items }, summary, cards)
    },
  },

  {
    name: 'addon_list',
    description: 'كل الإضافات المتاحة بأسمائها وأسعارها و ids — لربطها بمنتج.',
    write: false,
    schema: z.object({
      search: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async run(args): Promise<ToolOutput> {
      const rows = ((addonsBackend.listAddons() as any).all() as any[]).filter((row) => matches(args.search ?? '', [row.name]))
      const limit = Math.min(Number(args.limit) || 30, 50)
      const items = rows.slice(0, limit).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        price: Number(row.price) || 0,
        emoji: String(row.emoji ?? ''),
        active: Boolean(row.active),
      }))
      const summary = items.length ? `${items.length} إضافة` : 'مفيش إضافات'
      const cards = items.length
        ? [tableCard('الإضافات', ['الإضافة', 'السعر', 'الحالة'], items.map((row) => [row.name, money(row.price), row.active ? 'نشطة' : 'معطلة']))]
        : []
      return toolOutput({ addons: items }, summary, cards)
    },
  },

  {
    name: 'modifier_group_list',
    description: 'مجموعات الخيارات (modifiers) وخياراتها وأسعارها — لربطها بمنتج.',
    write: false,
    schema: z.object({
      search: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    async run(args): Promise<ToolOutput> {
      const groups = ((modifiersBackend.listModifierGroups() as any).all() as any[])
        .filter((row) => matches(args.search ?? '', [row.name]))
        .slice(0, Math.min(Number(args.limit) || 30, 50))
        .map((group) => ({
          id: String(group.id),
          name: String(group.name),
          type: String(group.type ?? ''),
          modifiers: ((modifiersBackend.listModifiersByGroup(String(group.id)) as any).all() as any[]).map((modifier) => ({
            id: String(modifier.id),
            name: String(modifier.name),
            priceAdjustment: Number(modifier.priceAdjustment) || 0,
            active: Boolean(modifier.active),
          })),
        }))

      const summary = groups.length ? `${groups.length} مجموعة خيارات` : 'مفيش مجموعات خيارات'
      const cards = groups.length
        ? [
            tableCard(
              'مجموعات الخيارات',
              ['المجموعة', 'النوع', 'عدد الخيارات'],
              groups.map((group) => [group.name, group.type, String(group.modifiers.length)]),
            ),
          ]
        : []
      return toolOutput({ groups }, summary, cards)
    },
  },
]
