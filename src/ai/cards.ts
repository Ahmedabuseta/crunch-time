// Card builders.
//
// Every card is produced here from data the backend already returned — the
// model only ever chooses which ones to show. `result` and `warning` for an
// action are computed from the same preview object the rows come from, so a
// card can never contradict its own numbers.
import { fmtMoney } from '../lib/format'
import type { ActionCard, ChatCard } from './schemas'
import type { RowTone } from './schemas'

export interface PreviewRow {
  label: string
  before?: string
  after?: string
  value?: string
  tone?: RowTone
}

export interface ActionPreview {
  /** Card heading, e.g. «تغيير سعر». */
  title: string
  /** What it is about, e.g. the product name. */
  subject: string
  rows: PreviewRow[]
  /** One sentence describing the world after confirming. */
  result: string
  warning?: string
}

export function money(n: number): string {
  return `${fmtMoney(n)} ج.م`
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return `${(Math.round(value * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })}٪`
}

export function quantity(n: number, unit: string): string {
  const value = Math.round((Number(n) || 0) * 100) / 100
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`.trim()
}

export function actionCard(actionId: string, status: ActionCard['status'], preview: ActionPreview): ActionCard {
  return {
    kind: 'action',
    actionId,
    title: preview.title,
    subject: preview.subject,
    status,
    rows: preview.rows.slice(0, 8),
    result: preview.result,
    warning: preview.warning,
  }
}

export function reportCard(title: string, report: unknown): ChatCard {
  return { kind: 'report', title, report }
}

export function metricsCard(
  title: string | undefined,
  items: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }[],
): ChatCard {
  return { kind: 'metrics', title, items: items.slice(0, 12) }
}

export function tableCard(
  title: string,
  columns: string[],
  rows: (string | number)[][],
): ChatCard {
  return {
    kind: 'table',
    title,
    columns: columns.slice(0, 5).map(String),
    rows: rows.slice(0, 50).map((row) => row.slice(0, 5).map(cellToText)),
  }
}

function cellToText(cell: string | number): string {
  if (typeof cell === 'number') {
    return Number.isInteger(cell) ? cell.toLocaleString('en-US') : cell.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  return String(cell ?? '')
}

/** Margin as a ratio of the selling price. 0 when the price is not positive. */
export function marginPercent(price: number, cost: number): number {
  const p = Number(price) || 0
  if (p <= 0) return 0
  return ((p - (Number(cost) || 0)) / p) * 100
}

/** Rounds a quantity up to whole purchase packages, minimum one. */
export function packagesFor(needed: number, packSize: number): number {
  const pack = Number(packSize) > 0 ? Number(packSize) : 1
  const neededQty = Math.max(0, Number(needed) || 0)
  if (neededQty <= 0) return 0
  return Math.max(1, Math.ceil(neededQty / pack))
}
