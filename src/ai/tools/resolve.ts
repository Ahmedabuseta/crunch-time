// Turning what the owner typed into a row.
//
// "خلي سعر البرجر الكرنش ٩٠" arrives as a string. Resolving it to a product id
// is the one place an assistant can silently act on the wrong thing, so this
// module is deliberately strict: an exact match wins, a unique prefix or
// substring wins, and anything else comes back with candidates instead of a
// guess. Arabic is compared after normalisation, so «برجر» finds «البرجر».
import { getSqlite } from '../../db/client'
import { normalizeArabic } from '../guard/arabic'

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

export function resolveProduct(query: string): Resolved<ProductRow> | ResolveFailure {
  return resolveByName<ProductRow>('products', query, mapProduct, 'الصنف')
}

export function resolveIngredient(query: string): Resolved<IngredientRow> | ResolveFailure {
  return resolveByName<IngredientRow>('ingredients', query, mapIngredient, 'المادة')
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

/**
 * Candidate list kept short: a model that is handed forty options picks none,
 * and a bubble listing forty names is unreadable on a phone.
 */
const MAX_CANDIDATES = 5

function resolveByName<T>(
  table: 'products' | 'ingredients',
  query: string,
  map: (row: any) => T,
  label: string,
): Resolved<T> | ResolveFailure {
  const raw = String(query ?? '').trim()
  if (!raw) return { ok: false, error: `حدد اسم ${label}` }

  const sqlite = getSqlite()
  const rows = sqlite.prepare(`SELECT * FROM ${table} WHERE active = 1 ORDER BY name`).all() as any[]
  if (rows.length === 0) return { ok: false, error: `مفيش ${label} مسجّل` }

  const needle = normalizeArabic(raw)
  const scored = rows.map((row) => ({ row, name: normalizeArabic(String(row.name ?? '')), score: matchScore(needle, normalizeArabic(String(row.name ?? ''))) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)

  const best = scored[0]
  if (!best) {
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
