import * as React from 'react'
import { cn } from '@/lib/utils'

export interface DataColumn<T> {
  key: string
  label: string
  render: (item: T) => React.ReactNode
  className?: string
  headerClassName?: string
  hide?: boolean
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
}

export function DataTable<T>({ columns, data, keyExtractor, emptyText = 'لا توجد نتائج', onRowClick, rowClassName, className, renderExpanded }: DataTableProps<T>) {
  const visible = columns.filter((c) => !c.hide)
  if (visible.length === 0) return null

  return (
    <div className={cn("border-2 rounded-2xl bg-card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              {visible.map((col) => (
                <th key={col.key} className={cn("px-4 py-2.5 text-right text-[11px] font-black text-muted-foreground whitespace-nowrap", col.headerClassName)}>
                  {col.label}
                </th>
              ))}
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