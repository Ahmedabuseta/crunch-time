import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

export type SortValue = string | number | boolean | null | undefined

export interface SortState<T> {
  key: string
  dir: 'asc' | 'desc'
  value: (item: T) => SortValue
}

/** Raw comparator: empty values last, numbers numerically, text by Arabic locale. */
export function compareSortValues(a: SortValue, b: SortValue): number {
  const aEmpty = a == null || a === ''
  const bEmpty = b == null || b === ''
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' || typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0)
  return String(a).localeCompare(String(b), 'ar', { numeric: true, sensitivity: 'base' })
}

/** Stable, non-mutating row sort. Empty values stay at the end in both directions. */
export function sortRows<T>(rows: readonly T[], sort: SortState<T> | null | undefined): T[] {
  if (!sort) return rows as T[]
  const dir = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const aEmpty = isEmpty(sort.value(a))
    const bEmpty = isEmpty(sort.value(b))
    if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
    return compareSortValues(sort.value(a), sort.value(b)) * dir
  })
}

const isEmpty = (v: SortValue) => v == null || v === ''

// Pull the plain text out of a rendered cell (badges, spans
// and formatted numbers included) so the export matches
// what's on screen.
function nodeToText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeToText).join('')
  if (React.isValidElement(node)) return nodeToText((node.props as { children?: React.ReactNode }).children)
  return ''
}

/** Header click cycle: unsorted → ascending → descending → unsorted. */
export function nextSortDir<T>(
  current: Pick<SortState<T>, 'key' | 'dir'> | null | undefined,
  key: string,
): 'asc' | 'desc' | null {
  if (!current || current.key !== key) return 'asc'
  return current.dir === 'asc' ? 'desc' : null
}

/** Full state transition for a header click, used by DataTable and hand-rolled tables. */
export function toggleSort<T>(
  current: SortState<T> | null | undefined,
  key: string,
  value: (item: T) => SortValue,
): SortState<T> | null {
  const dir = nextSortDir(current, key)
  return dir ? { key, dir, value } : null
}

/**
 * Sort affordance for a table header. Active columns show a solid arrow;
 * sortable-but-inactive columns reveal a faint one on hover so dense tables
 * stay calm. Renders the plain label when no onSort is given.
 */
export function SortButton({
  label,
  dir,
  onSort,
  className,
}: {
  label: React.ReactNode
  dir?: 'asc' | 'desc' | null
  onSort?: () => void
  className?: string
}) {
  if (!onSort) return <>{label}</>
  return (
    <button
      type="button"
      onClick={onSort}
      aria-label={typeof label === 'string' ? `ترتيب حسب ${label}` : undefined}
      className={cn(
        'group/sort inline-flex items-center gap-1 cursor-pointer select-none rounded-md px-1 -mx-1 py-0.5 -my-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
        className,
      )}
    >
      <span>{label}</span>
      {dir === 'asc' ? (
        <ArrowUp className="h-3 w-3 text-primary shrink-0" />
      ) : dir === 'desc' ? (
        <ArrowDown className="h-3 w-3 text-primary shrink-0" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-0 group-hover/sort:opacity-40 transition-opacity shrink-0" />
      )}
    </button>
  )
}

export interface DataColumn<T> {
  key: string
  label: string
  render: (item: T) => React.ReactNode
  className?: string
  headerClassName?: string
  hide?: boolean
  /** Sort key for the column. Falls back to `item[key]` when that field holds a primitive. */
  sortValue?: (item: T) => SortValue
}

interface DataTableProps<T> {
  columns: DataColumn<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  emptyText?: string
  onRowClick?: (item: T) => void
  rowClassName?: (item: T) => string
  className?: string
  renderExpanded?: (item: T) => React.ReactNode
  /** Controlled sort state — pair with useListControls' `sort`/`setSort` so sorting happens before pagination. */
  sort?: SortState<T> | null
  onSortChange?: (sort: SortState<T> | null) => void
  /** Default filename for the Excel (CSV) export button. */
  exportName?: string
}

export function DataTable<T>({ columns, data, keyExtractor, emptyText = 'لا توجد نتائج', onRowClick, rowClassName, className, renderExpanded, sort, onSortChange, exportName = 'table' }: DataTableProps<T>) {
  const visible = columns.filter((c) => !c.hide)
  if (visible.length === 0) return null

  // A column is sortable when it declares sortValue, or when its key points at
  // a primitive field on the rows (covers key === field-name columns for free).
  const accessor = (col: DataColumn<T>): ((item: T) => SortValue) | null => {
    if (col.sortValue) return col.sortValue
    const probe = data[0] as any
    const first = probe?.[col.key]
    if (typeof first === 'string' || typeof first === 'number' || typeof first === 'boolean') {
      return (item) => (item as any)?.[col.key]
    }
    return null
  }

  const doExport = async () => {
    const rows: string[][] = [visible.map((c) => c.label)]
    for (const item of data) rows.push(visible.map((c) => nodeToText(c.render(item))))
    const result = await window.api.exportCsv(exportName, rows)
    if (result?.ok) toast({ title: result.message || 'تم تصدير الجدول', variant: 'success' })
    else if (!result?.canceled) toast({ title: result?.error || 'فشل التصدير', variant: 'error' })
  }

  return (
    <div className={cn("border-2 rounded-2xl bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-end gap-1 border-b border-border bg-secondary/20 px-2 py-1">
        <button
          onClick={doExport}
          title="تصدير الجدول إلى إكسل"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          إكسل
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              {visible.map((col) => {
                const value = onSortChange ? accessor(col) : null
                const activeDir = sort?.key === col.key ? sort.dir : null
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={value ? (activeDir === 'asc' ? 'ascending' : activeDir === 'desc' ? 'descending' : 'none') : undefined}
                    className={cn("px-4 py-2.5 text-right text-[11px] font-black text-muted-foreground whitespace-nowrap", col.headerClassName)}
                  >
                    <SortButton
                      label={col.label}
                      dir={activeDir}
                      onSort={value ? () => onSortChange!(toggleSort(sort, col.key, value)) : undefined}
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {data.map((item) => (
              <React.Fragment key={keyExtractor(item)}>
                <tr
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                  className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-secondary/30", rowClassName?.(item))}
                >
                  {visible.map((col) => (
                    <td key={col.key} className={cn("px-4 py-2.5 align-middle", col.className)}>{col.render(item)}</td>
                  ))}
                </tr>
                {renderExpanded?.(item) ? (
                  <tr>
                    <td colSpan={visible.length} className="px-4 pb-4 pt-2 align-middle bg-secondary/20">
                      {renderExpanded(item)}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {data.length === 0 && (
        <div className="py-10 text-center text-xs text-muted-foreground">{emptyText}</div>
      )}
    </div>
  )
}
