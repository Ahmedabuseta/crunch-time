// A bounded, cached description of the shop's tables for the assistant prompt.
//
// `query_database` is exposed on almost every turn, but until now the model had
// no idea what the tables were called — it guessed, and a guess costs a failed
// step. `src/analysis/ask.ts` already solved this for the desktop analyst; this
// is the same information at a size that fits in a small model's prompt.
//
// Reads PRAGMAs off the live database rather than the analysis snapshot: no
// copy is made, so asking for this costs a few milliseconds and nothing else.
import { getSqlite } from '../../db/client'
import { COLUMN_NOTES, TABLE_NOTES } from '../../analysis/ask'
import { describeSchema, type TableInfo } from '../../analysis/schema'

/** Tables that describe the assistant itself, not the shop. */
const INTERNAL = /^(ai_|schema_migrations$|idempotency_keys$)/

/** Never describe a column that holds a secret. */
const SENSITIVE = /pin|hash|secret|token|api_?key|password|cipher/i

/** The shop's real tables first, so a truncated digest still has the useful half. */
const PRIORITY = [
  'orders', 'order_items', 'products', 'categories', 'ingredients',
  'recipes', 'inventory_transactions', 'payments', 'shifts', 'users',
  'expenses', 'delivery_zones', 'customers', 'discount_codes', 'settings',
]

/** A schema changes when a migration runs, not while the app is up. */
const TTL_MS = 5 * 60 * 1000

let cached: { text: string; at: number } | null = null

/**
 * The digest, cached for `TTL_MS`. Returns `''` when the schema cannot be read —
 * the caller then renders no schema section at all, which is exactly the
 * behaviour the prompt had before this existed.
 */
export function schemaDigest(maxChars = 2200): string {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return clamp(cached.text, maxChars)

  let text = ''
  try {
    const tables = describeSchema(getSqlite(), { includeCounts: false, exclude: INTERNAL })
    text = render(tables)
  } catch {
    return ''
  }

  cached = { text, at: now }
  return clamp(text, maxChars)
}

/** Drops the cache. Exported for tests and for a migration that just ran. */
export function clearSchemaDigest(): void {
  cached = null
}

/** One table in full, for `db_schema`. */
export function tableDigest(name: string): string {
  const wanted = String(name ?? '').trim()
  if (!wanted) return ''
  try {
    const tables = describeSchema(getSqlite(), { includeCounts: true, exclude: INTERNAL })
    const table = tables.find((entry) => entry.name.toLowerCase() === wanted.toLowerCase())
    if (!table) return ''
    return renderTable(table, { withRows: true })
  } catch {
    return ''
  }
}

/** Every table name with its size, for `db_schema` with no argument. */
export function tableList(): { name: string; rows: number }[] {
  try {
    return describeSchema(getSqlite(), { includeCounts: true, exclude: INTERNAL })
      .map((table) => ({ name: table.name, rows: table.rowCount }))
      .sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

function render(tables: TableInfo[]): string {
  const rank = new Map(PRIORITY.map((name, index) => [name, index]))
  const ordered = [...tables].sort((a, b) => {
    const ai = rank.get(a.name) ?? PRIORITY.length
    const bi = rank.get(b.name) ?? PRIORITY.length
    return ai - bi || a.name.localeCompare(b.name)
  })
  return ordered.map((table) => renderTable(table, { withRows: false })).filter(Boolean).join('\n')
}

function renderTable(table: TableInfo, options: { withRows: boolean }): string {
  const columns = table.columns
    .filter((column) => !SENSITIVE.test(column.name))
    .map((column) => {
      const note = COLUMN_NOTES[`${table.name}.${column.name}`]
      return `${column.name}${column.primaryKey ? '*' : ''}${note ? `[${note}]` : ''}`
    })

  if (columns.length === 0) return ''

  const lines = [`- ${table.name}${options.withRows ? ` (${table.rowCount} صف)` : ''}: ${columns.join(', ')}`]
  const note = TABLE_NOTES[table.name]
  if (note) lines.push(`  ${note}`)
  if (table.foreignKeys.length > 0 && options.withRows) {
    lines.push(`  FK: ${table.foreignKeys.map((fk) => `${fk.from}→${fk.table}.${fk.to}`).join(', ')}`)
  }
  return lines.join('\n')
}

/** Truncates on a table boundary so the last line is never half a column list. */
function clamp(text: string, maxChars: number): string {
  const limit = Math.max(200, Math.trunc(Number(maxChars) || 2200))
  if (text.length <= limit) return text
  const cut = text.lastIndexOf('\n', limit)
  const head = cut > 0 ? text.slice(0, cut) : text.slice(0, limit)
  return `${head}\n… (باقي الجداول محذوفة — استخدم db_schema)` 
}
