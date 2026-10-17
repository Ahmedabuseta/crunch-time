import { initialQuery, toParams, withSort, type ListQueryState, type SortDir } from '@/lib/listQuery';
import { useDebounce } from '@/lib/useDebounce';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

export interface PagedPage<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export interface PagedQueryOptions<T> {
  /** The list's query key — everything but the page, which React Query carries
   * as the page param. Keep it under the resource's prefix so the existing
   * invalidations still reach it. */
  keyFor: (query: ListQueryState) => readonly unknown[];
  /** Fetches one page. Must be stable (wrap it in `useCallback`). */
  load: (params: Record<string, string | number | undefined>) => Promise<PagedPage<T>>;
  initialSort: string;
  initialDir?: SortDir;
  initialFilters?: Record<string, string | undefined>;
  pageSize?: number;
  enabled?: boolean;
  staleTime?: number;
}

/**
 * A paged list over React Query's infinite query, so paging sits on the app's
 * one data layer instead of a second one beside it. Changing the search, a
 * filter or the sort changes the key, and React Query starts the list again.
 *
 * `refresh` re-reads every page that is loaded, in parallel. Refreshing only
 * page 1 would be cheaper but wrong: with offset paging a new row at the top
 * pushes the last row of page 1 into page 2, so re-reading page 1 alone leaves
 * that row missing from the middle of the list.
 */
export function usePagedQuery<T extends { id: string }>(options: PagedQueryOptions<T>) {
  const {
    keyFor,
    load,
    initialSort,
    initialDir = 'asc',
    initialFilters,
    pageSize = 25,
    enabled = true,
    staleTime,
  } = options;

  // The search box is immediate; the request follows it once typing pauses.
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [filters, setFilters] = useState<Record<string, string | undefined>>(
    initialFilters ?? {}
  );
  const [sort, setSort] = useState(initialSort);
  const [dir, setDir] = useState(initialDir);

  const query = useMemo<ListQueryState>(
    () => ({ ...initialQuery(sort, dir), search: debouncedSearch, filters }),
    [sort, dir, debouncedSearch, filters]
  );

  const infinite = useInfiniteQuery({
    queryKey: keyFor(query) as unknown[],
    queryFn: ({ pageParam }) => load(toParams(query, pageParam, pageSize)),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length + 1 : undefined),
    enabled,
    staleTime,
  });

  const pages = useMemo(() => infinite.data?.pages ?? [], [infinite.data]);

  // Flattened, and deduped defensively: a row inserted while a page was being
  // fetched can legitimately appear on two pages.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const page of pages) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  }, [pages]);

  const loadMore = useCallback(() => {
    if (infinite.hasNextPage && !infinite.isFetchingNextPage) void infinite.fetchNextPage();
  }, [infinite]);

  return {
    /** What the search box should show — ahead of the request. */
    search,
    onSearch: setSearch,
    filters,
    sort,
    dir,
    setFilter: useCallback(
      (key: string, value: string | undefined) =>
        setFilters((prev) => ({ ...prev, [key]: value })),
      []
    ),
    setFilters,
    sortBy: useCallback(
      (key: string, nextDir?: SortDir) => {
        const next = withSort({ ...query, sort, dir }, key, nextDir);
        setSort(next.sort);
        setDir(next.dir);
      },
      [query, sort, dir]
    ),

    items,
    /** The size of the whole match, not of the loaded pages. */
    total: pages[0]?.total ?? 0,
    hasMore: Boolean(infinite.hasNextPage),
    loading: infinite.isLoading,
    loadingMore: infinite.isFetchingNextPage,
    refreshing: infinite.isRefetching && !infinite.isFetchingNextPage,
    error: infinite.error ? (infinite.error as Error).message : '',

    /** Everything loaded so far, re-read — for pull-to-refresh and live events. */
    refresh: useCallback(() => infinite.refetch(), [infinite]),
    loadMore,
  };
}
