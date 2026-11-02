// Turning what the owner typed into a row.
//
// "خلي سعر البرجر الكرنش ٩٠" arrives as a string. Resolving it to a product id
// is the one place an assistant can silently act on the wrong thing, so this
// module is deliberately strict: an exact match wins, a unique prefix or
// substring wins, and anything else comes back with candidates instead of a
// guess. Arabic is compared after normalisation, so «برجر» finds «البرجر».
//
// Two additions sit on top of that ladder, both still refusing to guess:
// an alias the owner taught («الشركة» → «برجر») wins before any name matching,
// and a single strong near-match («فرايدي» for «فرايداي») is accepted, while
// two equally close names come back as an error the owner can pick from.
import { getSqlite } from '../../db/client'
import { normalizeArabic } from '../guard/arabic'
import { getAliasTarget, logUnresolved, type AliasEntity } from './alias-store'
import { fuzzyScore, isStrongScore, withoutArticle } from './fuzzy'

export interface Resolved<T> {
  ok: true
  row: T
}

export interface ResolveFailure {
  ok: false
  error: string
}

export interface ProductRow {
  id: string
  name: string
  price: number
  costPrice: number
  categoryId: string | null
  active: boolean
}

export interface IngredientRow {
  id: string
  name: string
  unit: string
  stockQuantity: number
  minStock: number
  costPerUnit: number
  purchaseQty: number
  supplier: string | null
}

export interface SubRecipeRow {
  id: string
  name: string
  unit: string
  active: boolean
}

export interface CategoryRow {
  id: string
  name: string
}

export interface AddonRow {
  id: string
  name: string
  price: number
}

export interface ModifierGroupRow {
  id: string
  name: string
  type: string
}

interface ResolveOptions {
  includeInactive?: boolean
}

export function resolveProduct(query: string, opts?: ResolveOptions): Resolved<ProductRow> | ResolveFailure {
  return resolveByName<ProductRow>('products', query, mapProduct, 'الصنف', opts?.includeInactive, 'product')
}

export function resolveIngredient(query: string, opts?: ResolveOptions): Resolved<IngredientRow> | ResolveFailure {
  return resolveByName<IngredientRow>('ingredients', query, mapIngredient, 'المادة', opts?.includeInactive, 'ingredient')
}

export function resolveSubRecipe(query: string): Resolved<SubRecipeRow> | ResolveFailure {
  return resolveByName<SubRecipeRow>('sub_recipes', query, mapSubRecipe, 'الوصفة الفرعية', false)
}

export function resolveCategory(query: string): Resolved<CategoryRow> | ResolveFailure {
  return resolveByName<CategoryRow>('categories', query, mapCategory, 'القسم', false)
}

export function resolveAddon(query: string): Resolved<AddonRow> | ResolveFailure {
  return resolveByName<AddonRow>('addons', query, mapAddon, 'الإضافة', false)
}

export function resolveModifierGroup(query: string): Resolved<ModifierGroupRow> | ResolveFailure {
  return resolveByName<ModifierGroupRow>('modifier_groups', query, mapModifierGroup, 'مجموعة الخيارات', false)
}

function mapProduct(row: any): ProductRow {
  return {
    id: String(row.id),
    name: String(row.name),
    price: Number(row.price) || 0,
    costPrice: Number(row.cost_price) || 0,
    categoryId: row.category_id ? String(row.category_id) : null,
    active: Boolean(row.active),
  }
}

function mapIngredient(row: any): IngredientRow {
  return {
    id: String(row.id),
    name: String(row.name),
    unit: String(row.unit || ''),
    stockQuantity: Number(row.stock_quantity) || 0,
    minStock: Number(row.min_stock) || 0,
    costPerUnit: Number(row.cost_per_unit) || 0,
    purchaseQty: Number(row.purchase_qty) || 1,
    supplier: row.supplier ? String(row.supplier) : null,
  }
}

function mapSubRecipe(row: any): SubRecipeRow {
  return {
    id: String(row.id),
    name: String(row.name),
    unit: String(row.unit || 'وحدة'),
    active: Boolean(row.active),
  }
}

function mapCategory(row: any): CategoryRow {
  return { id: String(row.id), name: String(row.name) }
}

function mapAddon(row: any): AddonRow {
  return { id: String(row.id), name: String(row.name), price: Number(row.price) || 0 }
}

function mapModifierGroup(row: any): ModifierGroupRow {
  return { id: String(row.id), name: String(row.name), type: String(row.type || '') }
}

/**
 * Candidate list kept short: a model that is handed forty options picks none,
 * and a bubble listing forty names is unreadable on a phone.
 */
const MAX_CANDIDATES = 5

function resolveByName<T>(
  table: 'products' | 'ingredients' | 'sub_recipes' | 'categories' | 'addons' | 'modifier_groups',
  query: string,
  map: (row: any) => T,
  label: string,
  includeInactive = false,
  aliasEntity?: AliasEntity,
): Resolved<T> | ResolveFailure {
  const raw = String(query ?? '').trim()
  if (!raw) return { ok: false, error: `حدد اسم ${label}` }

  const sqlite = getSqlite()
  const rows = sqlite.prepare(`SELECT * FROM ${table}${includeInactive ? '' : ' WHERE active = 1'} ORDER BY name`).all() as any[]
  if (rows.length === 0) return { ok: false, error: `مفيش ${label} مسجّل` }

  const byId = rows.find((row) => String(row.id) === raw)
  if (byId) return { ok: true, row: map(byId) }

  // What the owner taught us beats any spelling of the name: «الشركة» is the
  // product they mapped it to, not whatever else it happens to look like. The
  // lookup only covers the rows this call selected, so an alias pointing at an
  // inactive row is honoured for includeInactive and refused otherwise.
  if (aliasEntity) {
    const targetId = getAliasTarget(aliasEntity, raw)
    if (targetId) {
      const aliased = rows.find((row) => String(row.id) === targetId)
      if (aliased) return { ok: true, row: map(aliased) }
      if (!includeInactive) {
        const hidden = sqlite
          .prepare(`SELECT name FROM ${table} WHERE id = ? AND active = 0`)
          .get(targetId) as { name?: string } | undefined
        if (hidden?.name) {
          return {
            ok: false,
            error: `«${raw}» مربوط بـ«${String(hidden.name)}» وهو مخفي من المنيو. ظهره الأول أو استخدم اسم تاني.`,
          }
        }
      }
    }
  }

  const needle = withoutArticle(normalizeArabic(raw))
  const scored = rows
    .map((row) => {
      const name = withoutArticle(normalizeArabic(String(row.name ?? '')))
      return { row, name, score: matchScore(needle, name) }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)

  const best = scored[0]
  if (!best) {
    // Nothing matched by name. One strong near-match is a typo the owner will
    // never notice they made; two are a choice only the owner can make.
    const fuzzy = closestByEditDistance(rows, needle)
    if (fuzzy.strong.length === 1) return { ok: true, row: map(fuzzy.strong[0].row) }
    if (fuzzy.strong.length > 1) {
      const names = uniqueNames(fuzzy.strong.slice(0, MAX_CANDIDATES))
      return { ok: false, error: `فيه أكتر من ${label} قريب من «${raw}»: ${names.join(' / ')}. حدد اسم واحد بالظبط.` }
    }

    // An unresolved catalogue name is exactly what the owner needs to see in
    // order to teach an alias. Categories and addons are not catalog names, so
    // they are never logged.
    if (aliasEntity) logUnresolved(aliasEntity, raw, uniqueNames(fuzzy.weak.slice(0, MAX_CANDIDATES)))

    return {
      ok: false,
      error: `مفيش ${label} بالاسم «${raw}». جرّب اسم تاني.`,
    }
  }

  // A tie at the top is ambiguous by definition: two different items both
  // matched the same way, so let the owner pick rather than picking for them.
  const tied = scored.filter((entry) => entry.score === best.score)
  if (tied.length > 1 && best.score < 100) {
    const names = tied.slice(0, MAX_CANDIDATES).map((entry) => String(entry.row.name))
    return { ok: false, error: `فيه أكتر من ${label} مطابق: ${names.join(' / ')}. حدد اسم واحد بالظبط.` }
  }

  return { ok: true, row: map(best.row) }
}

interface FuzzyEntry<T> {
  row: T
  name: string
  score: number
}

/**
 * Splits the near-matches into the ones strong enough to resolve and the ones
 * worth showing as "did you mean". Both lists are already sorted and small.
 */
function closestByEditDistance<T>(rows: T[], needle: string): { strong: FuzzyEntry<T>[]; weak: FuzzyEntry<T>[] } {
  const scored: FuzzyEntry<T>[] = (rows as any[])
    .map((row: any) => {
      const name = withoutArticle(normalizeArabic(String(row.name ?? '')))
      return { row: row as T, name, score: fuzzyScore(needle, name) }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)

  return {
    strong: scored.filter((entry) => isStrongScore(entry.score)),
    weak: scored,
  }
}

function uniqueNames<T>(entries: FuzzyEntry<T>[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const entry of entries) {
    const name = String((entry.row as any)?.name ?? entry.name)
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
    if (names.length === MAX_CANDIDATES) break
  }
  return names
}

/**
 * 100 exact · 80 requested phrase is a prefix of the name · 60 substring ·
 * 40 every requested word appears · 0 no match.
 */
function matchScore(needle: string, name: string): number {
  if (!needle) return 0
  if (needle === name) return 100
  if (name.startsWith(needle)) return 80 + (needle.length / Math.max(1, name.length)) * 10
  if (name.includes(needle)) return 60 + (needle.length / Math.max(1, name.length)) * 10
  const requested = needle.split(/\s+/).filter(Boolean)
  if (requested.length > 1 && requested.every((word) => name.includes(word))) return 40
  return 0
}

/** Products in a category, for the price-change preview's sibling range. */
export function siblingsOf(product: ProductRow): { min: number; max: number; count: number; cheaperThan: number } {
  const sqlite = getSqlite()
  const rows = product.categoryId
    ? sqlite.prepare('SELECT price FROM products WHERE active = 1 AND category_id = ? AND id <> ?').all(product.categoryId, product.id) as { price: number }[]
    : sqlite.prepare('SELECT price FROM products WHERE active = 1 AND id <> ?').all(product.id) as { price: number }[]
  const prices = rows.map((r) => Number(r.price) || 0).filter((n) => n > 0).sort((a, b) => a - b)
  if (prices.length === 0) return { min: 0, max: 0, count: 0, cheaperThan: 0 }
  return {
    min: prices[0],
    max: prices[prices.length - 1],
    count: prices.length,
    cheaperThan: prices.filter((p) => p < product.price).length,
  }
}
