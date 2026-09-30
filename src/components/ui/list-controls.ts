import { useMemo, useState } from 'react'

interface UseListControlsOptions<T> {
  items: T[]
  searchText?: (item: T) => string
  filter?: (item: T) => boolean
  pageSize?: number
}

export function useListControls<T>({ items, searchText, filter, pageSize = 10 }: UseListControlsOptions<T>) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (filter && !filter(item)) return false
      if (q && searchText && !searchText(item).toLowerCase().includes(q)) return false
      return true
    })
  }, [items, search, filter, searchText])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const paginated = filtered.slice(start, start + pageSize)

  return {
    search,
    setSearch,
    page: safePage,
    setPage,
    pageSize,
    total: filtered.length,
    totalPages,
    start,
    end: start + paginated.length,
    items: paginated,
    allCount: items.length,
    reset: () => { setSearch(''); setPage(1) },
  }
}