// The query behind every paged list: search, filters and sort.
//
// Paging itself is not here — React Query's infinite query carries the page as
// its page param, and changing the search/filter/sort changes the query key,
// which is what sends the list back to the first page. What lives here is the
// part React Query has no opinion about: what goes on the wire, and which way
// a sort flips.

export type SortDir = 'asc' | 'desc';

export interface ListQueryState {
  search: string;
  /** Resource filters, e.g. `{ categoryId: 'x', low: '1' }`. */
  filters: Record<string, string | undefined>;
  sort: string;
  dir: SortDir;
}

export const initialQuery = (sort: string, dir: SortDir = 'asc'): ListQueryState => ({
  search: '',
  filters: {},
  sort,
  dir,
});

/** Request params. Empty values are dropped rather than sent as blanks, so the
 * server sees a clean query and its own defaults apply. */
export function toParams(
  query: ListQueryState,
  page: number,
  pageSize?: number
): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {
    sort: query.sort,
    dir: query.dir,
    page,
    pageSize,
    search: query.search.trim() || undefined,
  };
  for (const [key, value] of Object.entries(query.filters)) {
    if (value !== undefined && value !== '') params[key] = value;
  }
  return params;
}

/** Choosing the column you are already sorted by flips the direction — what a
 * column header does, and what people expect. A new column starts ascending. */
export function withSort(query: ListQueryState, sort: string, dir?: SortDir): ListQueryState {
  return {
    ...query,
    sort,
    dir: dir ?? (query.sort === sort ? (query.dir === 'asc' ? 'desc' : 'asc') : 'asc'),
  };
}

/** Sets (or clears, with an empty value) one resource filter. Clearing deletes
 * the key rather than storing a blank, so the request drops it entirely. */
export function withFilter(
  query: ListQueryState,
  key: string,
  value: string | undefined
): ListQueryState {
  const filters = { ...query.filters };
  if (value === undefined || value === '') delete filters[key];
  else filters[key] = value;
  return { ...query, filters };
}

/** Applies several filters at once — e.g. a date range's `from` and `to`. */
export function withFilters(
  query: ListQueryState,
  next: Record<string, string | undefined>
): ListQueryState {
  const filters = { ...query.filters };
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === '') delete filters[key];
    else filters[key] = value;
  }
  return { ...query, filters };
}

export function withSearch(query: ListQueryState, search: string): ListQueryState {
  return { ...query, search };
}

/** "٢٥ من ٤١٢" — what the footer says. */
export function rangeLabel(loaded: number, total: number): string {
  if (total === 0) return 'مفيش نتائج';
  return `${Math.min(loaded, total)} من ${total}`;
}
