// Sending all 44 schemas on every turn is too expensive for small on-demand
// models (Groq's gpt-oss-120b has an 8k TPM limit). The router keeps a small
// always-on core and adds the groups the owner's message actually needs.
//
// This is deterministic routing, not retrieval: the model still chooses the
// tool and its arguments from the exposed schemas.
import { normalizeArabic } from '../guard/arabic'
import type { ToolDef } from './types'

const CORE = [
  'query_metrics',
  'product_price',
  'product_list',
  'inventory_status',
]

/** Action turns need confirmation tools, not every report snapshot. */
const ACTION_CORE = CORE

const PRODUCT_READ = ['product_details']
const PRODUCT_MARGIN = ['item_margins']
const PRODUCT_WRITE = [
  'set_product_price',
  'create_product',
  'update_product',
  'delete_product',
  'set_product_addons',
  'set_product_modifiers',
]
const INGREDIENT_READ = ['ingredient_list', 'ingredient_details']
const INGREDIENT_WRITE = [
  'create_ingredient',
  'update_ingredient',
  'delete_ingredient',
  'restock',
  'adjust_stock',
  'record_waste',
  'exchange_brand',
]
const RECIPE_READ = ['recipe_costs', 'subrecipe_list', 'subrecipe_details']
const RECIPE_LINE_WRITE = ['add_recipe_line', 'update_recipe_line', 'remove_recipe_line']
const RECIPE_WRITE = [
  ...RECIPE_LINE_WRITE,
  'create_subrecipe',
  'update_subrecipe',
  'delete_subrecipe',
  'add_subrecipe_ingredient',
  'update_subrecipe_ingredient',
  'remove_subrecipe_ingredient',
]
const ADDON_READ = ['addon_list', 'modifier_group_list']
const ADDON_WRITE = ['set_product_addons', 'set_product_modifiers']
const ALIAS = ['unresolved_queries', 'list_aliases', 'learn_alias']

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Keywords are normalised once, exactly like the incoming message. */
function keywords(words: string[]): RegExp {
  return new RegExp(`(?:${words.map((word) => escapeRegex(normalizeArabic(word))).join('|')})`)
}

const ACTION = keywords(['ضيف', 'أضف', 'اعمل', 'عدل', 'عدّل', 'غير', 'غيّر', 'احذف', 'امسح', 'شيل', 'خلي', 'خلى', 'استلم', 'استلام', 'سجل', 'تالف', 'تسوية', 'مبادل', 'مبادلة', 'بدل', 'اربط', 'علم', 'صحح'])
const PRODUCT = keywords(['منتج', 'صنف', 'أصناف', 'منيو', 'قسم', 'إضافة', 'إضافات', 'خيار', 'خيارات', 'modifier', 'addon'])
const PRODUCT_PRICE = keywords(['بكام', 'بكم', 'سعر', 'أسعار', 'تمن'])
const INGREDIENT = keywords(['مادة', 'مواد', 'مخزون', 'مورد', 'رصيد', 'تالف', 'استلام', 'تسوية', 'عبوة', 'حد أدنى', 'جرام', 'كيلو', 'لتر'])
const RECIPE = keywords(['وصفة', 'وصفات', 'مكون', 'مكونات', 'ريسيبي', 'صوص', 'عجينة', 'فرعي', 'فرعية'])
const SUB_RECIPE = keywords(['فرعي', 'فرعية', 'وصفة جديدة', 'وصفه جديده', 'صوص', 'عجينة'])
const ADDON = keywords(['إضافة', 'إضافات', 'خيار', 'خيارات', 'موديفاير', 'modifier', 'addon'])
const ALIAS_INTENT = keywords(['اسم بديل', 'بديل', 'مش فاهم', 'معرفش', 'يعني', 'قصد', 'سحيق', 'غلط', 'غلطت'])
const STAFF = keywords(['موظف', 'موظفين', 'كاشير', 'وردية', 'ورديات', 'درج', 'شيفت'])
const ORDERS = keywords(['طلب', 'طلبات', 'أوردر', 'دليفري', 'توصيل', 'صالة', 'تيك أوي', 'تيكاوي'])
const SALES = keywords(['مبيعات', 'بيع', 'إيراد', 'دخل', 'فاتورة', 'فواتير'])
const PROFIT = keywords(['ربح', 'أرباح', 'تكلفة', 'هامش', 'مصروف', 'مصروفات'])
const TOP = keywords(['أكثر', 'أفضل', 'أسوأ', 'مبيع', 'مبيعات'])
const MARGIN = keywords(['هامش', 'أقل ربح', 'أعلى ربح'])
const CATEGORY = keywords(['قسم', 'أقسام', 'منيو'])

const CORE_SET = new Set(CORE)

function add(target: Set<string>, names: string[]): void {
  for (const name of names) target.add(name)
}

/**
 * The exposed tools for one user message. The returned names are a subset of
 * `all`; unknown names are ignored so a renamed tool cannot break the turn.
 */
export function selectToolNames(message: string): string[] {
  const text = normalizeArabic(String(message ?? ''))
  const action = ACTION.test(text)
  const selected = new Set<string>(action ? ACTION_CORE : CORE)

  const product = PRODUCT.test(text)
  const price = PRODUCT_PRICE.test(text)
  const ingredient = INGREDIENT.test(text)
  const recipe = RECIPE.test(text)
  const subRecipe = SUB_RECIPE.test(text)
  const addon = ADDON.test(text)
  const alias = ALIAS_INTENT.test(text)
  const staff = STAFF.test(text)
  const orders = ORDERS.test(text)
  const sales = SALES.test(text)
  const profit = PROFIT.test(text)
  const top = TOP.test(text)

  if (sales) selected.add('sales_summary')
  if (profit) selected.add('profit_summary')
  if (top) selected.add('top_items')
  if (staff) selected.add('staff_performance')
  if (orders) selected.add('orders_search')

  if (product || price) {
    add(selected, PRODUCT_READ)
    if (MARGIN.test(text)) add(selected, PRODUCT_MARGIN)
    if (action || CATEGORY.test(text)) selected.add('category_list')
  }
  if (ingredient) add(selected, INGREDIENT_READ)
  if (recipe) {
    add(selected, RECIPE_READ)
    add(selected, INGREDIENT_READ)
  }
  if (addon) add(selected, ADDON_READ)
  if (alias) add(selected, ALIAS)

  if (action) {
    if (product || price || addon) add(selected, PRODUCT_WRITE)
    if (addon) add(selected, ADDON_WRITE)
    if (ingredient) add(selected, INGREDIENT_WRITE)
    if (recipe) {
      add(selected, subRecipe ? RECIPE_WRITE : RECIPE_LINE_WRITE)
      add(selected, INGREDIENT_READ)
    }
    if (alias) add(selected, ALIAS)
    // A generic «اعمل/عدّل» with no catalogue noun still needs the common
    // product and stock actions; the model asks a clarifying question if it
    // needs one of the rarer sub-recipe tools.
    if (!product && !price && !ingredient && !recipe && !addon && !alias) {
      add(selected, PRODUCT_WRITE)
      add(selected, INGREDIENT_WRITE)
    }
  }

  return [...selected]
}

export function selectTools(all: ToolDef[], message: string): ToolDef[] {
  const byName = new Map(all.map((tool) => [tool.name, tool]))
  return selectToolNames(message)
    .map((name) => byName.get(name))
    .filter((tool): tool is ToolDef => Boolean(tool))
}

export function isCoreTool(name: string): boolean {
  return CORE_SET.has(name)
}
