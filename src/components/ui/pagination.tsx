import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  start: number
  end: number
  onPageChange: (page: number) => void
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  className?: string
}

export function Pagination({
  page,
  totalPages,
  total,
  start,
  end,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  if (total === 0) return null

  const pages: (number | 'ellipsis')[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis')
    }
  }

  return (
    <div className={cn("flex items-center justify-between flex-wrap gap-3 px-5 py-3 border-t border-border/50 shrink-0", className)}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground font-bold">
          عرض {start + 1}–{end} من {total}
        </span>
        {onPageSizeChange && total > pageSizeOptions[0] && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 rounded-lg bg-secondary text-[10px] font-bold border-0 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer"
          >
            {pageSizeOptions.map((s) => (
              <option key={s} value={s}>{s} / صفحة</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-secondary transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {pages.map((p, i) => (
          p === 'ellipsis' ? (
            <span key={`e-${i}`} className="text-[11px] text-muted-foreground px-1">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                "min-w-8 h-8 px-2 rounded-lg text-[11px] font-bold cursor-pointer transition-colors",
                p === page ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {p}
            </button>
          )
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="w-8 h-8 rounded-lg bg-secondary/60 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-secondary transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}