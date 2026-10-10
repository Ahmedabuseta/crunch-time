import { useMemo, useState } from 'react'
import { sortRows, type SortState } from './data-table'

interface UseListControlsOptions<T> {
  items: T[]
  searchText?: (item: T) => string
  filter?: (item: T) => boolean
  pageSize?: number
}

export function useListControls<T>({ items, searchText, filter, pageSize = 10 }: UseListControlsOptions<T>) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSortState] = useState<SortState<T> | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (filter && !filter(item)) return false
      if (q && searchText && !searchText(item).toLowerCase().includes(q)) return false
      return true
    })
  }, [items, search, filter, searchText])

  // Sort happens before pagination so a column click reorders the whole set,
  // not just the visible page.
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const paginated = sorted.slice(start, start + pageSize)

  return {
    search,
    setSearch,
    sort,
    setSort: (s: SortState<T> | null) => { setSortState(s); setPage(1) },
    page: safePage,
    setPage,
    pageSize,
    total: sorted.length,
    totalPages,
    start,
    end: start + paginated.length,
    items: paginated,
    allCount: items.length,
    reset: () => { setSearch(''); setPage(1) },
  }
}
