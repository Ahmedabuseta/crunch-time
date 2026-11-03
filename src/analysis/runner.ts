import type Database from 'better-sqlite3'
import { guardSql, wrapForLimit } from './guard'

const MAX_CELL_CHARS = 2_000

const SECRET_COLUMN = /pin|hash|secret|token|api_?key|password|cipher/i
const PHONE_COLUMN = /phone|mobile|tel$/i

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
  elapsedMs: number
}

function toJsonValue(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return { type: 'blob', bytes: value.length }
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.length > MAX_CELL_CHARS) {
    return `${value.slice(0, MAX_CELL_CHARS)}…`
  }
  return value
}

function redactCell(column: string, value: unknown): unknown {
  if (SECRET_COLUMN.test(column)) return '••••'
  if (PHONE_COLUMN.test(column) && typeof value === 'string') {
    const digits = value.replace(/\D/g, '')
    return digits.length >= 5 ? `••••${digits.slice(-4)}` : '••••'
  }
  return toJsonValue(value)
}

export function previewRows(
  rows: unknown[][],
  maxRows = 50,
  maxChars = 12_000,
): { rows: unknown[][]; truncated: boolean } {
  const selected: unknown[][] = []
  let size = 0
  for (const row of rows) {
    const rowSize = JSON.stringify(row)?.length ?? 0
    if (selected.length >= maxRows || size + rowSize > maxChars) break
    selected.push(row)
    size += rowSize
  }
  return { rows: selected, truncated: selected.length < rows.length }
}

export function runReadOnlyQuery(
  database: Database.Database,
  sql: string,
  maxRows: number,
): QueryResult {
  const guarded = guardSql(sql)
  const started = performance.now()
  const statement = database.prepare(wrapForLimit(guarded, maxRows))
  const raw = statement.raw(true).all() as unknown[][]
  const elapsedMs = Math.round(performance.now() - started)
  const columns = statement.columns().map((column) => column.name)
  const truncated = raw.length > maxRows
  const rows = (truncated ? raw.slice(0, maxRows) : raw).map((row) =>
    row.map((value, index) => redactCell(columns[index] ?? '', value)),
  )

  return { columns, rows, rowCount: rows.length, truncated, elapsedMs }
}
