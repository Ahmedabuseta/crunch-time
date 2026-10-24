import type { ReactNode } from 'react'
import { SearchInput } from './search-input'
import { FilterChips, type FilterChipOption } from './filter-chips'
import { ViewToggle, type ViewMode } from './view-toggle'
import { cn } from '@/lib/utils'

interface ListToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  filters?: FilterChipOption[]
  filterValue?: string | null
  onFilterChange?: (value: string | null) => void
  extraFilters?: FilterChipOption[]
  extraFilterValue?: string | null
  onExtraFilterChange?: (value: string | null) => void
  sort?: ReactNode
  view?: ViewMode
  onViewChange?: (mode: ViewMode) => void
  className?: string
}

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'بحث...',
  filters,
  filterValue,
  onFilterChange,
  extraFilters,
  extraFilterValue,
  onExtraFilterChange,
  sort,
  view,
  onViewChange,
  className,
}: ListToolbarProps) {
  return (
    <div className={cn("px-5 pt-4 pb-3 space-y-3 border-b shrink-0", className)}>
      <div className="flex items-end gap-2 flex-wrap">
        <SearchInput value={search} onChange={onSearchChange} placeholder={searchPlaceholder} className="flex-1 min-w-0" />
        {sort}
        {view && onViewChange && <ViewToggle value={view} onChange={onViewChange} />}
      </div>
      {filters && onFilterChange && (
        <FilterChips options={filters} value={filterValue ?? null} onChange={onFilterChange} />
      )}
      {extraFilters && onExtraFilterChange && (
        <FilterChips options={extraFilters} value={extraFilterValue ?? null} onChange={onExtraFilterChange} />
      )}
    </div>
  )
}
