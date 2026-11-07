// Warming the cache before a screen mounts.
//
// The screens are already cache-first, but the first visit to a tab has nothing
// to paint from: it shows a skeleton and waits for the shop's wifi. A tab tap
// happens about a second before that screen needs its data, which is enough
// time to start the request — so the screen finds the cache warm.
//
// Two rules keep this from being a pessimisation:
//  • Only the first visit is prefetched. Once a key is in the cache, React
//    Query's own `staleTime` decides whether to re-read it, and prefetching
//    again would just duplicate a request the screen is about to make anyway.
//  • Every key here must match the one the screen uses, exactly. A prefetch
//    that builds a different key warms nothing and looks like it works.
//
// Keys come from `qk` and the shapes come from `listQuery`, so they cannot
// drift from the screens without the type or the test failing.
import type { QueryClient } from '@tanstack/react-query';
import { api, ALL_ROWS } from '@/api/endpoints';
import { toParams } from '@/lib/listQuery';
import { qk } from '@/lib/queryKeys';
import { STALE } from '@/lib/cachePolicy';
import {
  BOARD_PAGE_SIZE,
  boardListQuery,
  newOrderKeys,
  reportsKeys,
  settingsKeys,
} from '@/lib/prefetchKeys';

/** The tab a screen belongs to, as the tab bar names them. */
export type TabName = 'board' | 'new' | 'reports' | 'settings';

/**
 * The order board's first page, with the board's own defaults: newest first,
 * thirty per page. `staleTime: 0` because the socket keeps it live.
 */
function prefetchBoard(queryClient: QueryClient): Promise<void> {
  const query = boardListQuery();
  return queryClient.prefetchInfiniteQuery({
    queryKey: qk.paged('orders', query),
    queryFn: ({ pageParam }) => {
      const params = toParams(query, pageParam as number, BOARD_PAGE_SIZE);
      return api
        .orders(params as Parameters<typeof api.orders>[0])
        .then((res) => ({ items: res.orders, total: res.total, hasMore: res.hasMore }));
    },
    initialPageParam: 1,
    staleTime: STALE.live,
  });
}

/** The New Order tab: the menu and the settings a receipt needs. */
async function prefetchNewOrder(queryClient: QueryClient): Promise<void> {
  const keys = newOrderKeys();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: keys.menu,
      queryFn: () => api.menu(),
      staleTime: STALE.reference,
    }),
    queryClient.prefetchQuery({
      queryKey: keys.settings,
      queryFn: () => api.settings(),
      staleTime: STALE.reference,
    }),
  ]);
}

/** The Reports tab opens on today's Z report and the daily summary. */
async function prefetchReports(queryClient: QueryClient): Promise<void> {
  const keys = reportsKeys();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: keys.z,
      queryFn: () => api.zReport(),
      staleTime: STALE.report,
    }),
    queryClient.prefetchQuery({
      queryKey: keys.daily,
      queryFn: () => api.report('daily'),
      staleTime: STALE.report,
    }),
  ]);
}

/** المزيد: settings, printers and the categories used by the management lists. */
async function prefetchSettings(queryClient: QueryClient): Promise<void> {
  const keys = settingsKeys();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: keys.settings,
      queryFn: () => api.settings(),
      staleTime: STALE.reference,
    }),
    queryClient.prefetchQuery({
      queryKey: keys.printers,
      queryFn: () => api.printers(),
      staleTime: STALE.config,
    }),
    queryClient.prefetchQuery({
      queryKey: keys.categories,
      queryFn: () => api.categories({ pageSize: ALL_ROWS }),
      staleTime: STALE.reference,
    }),
  ]);
}

const WARMERS: Record<TabName, (client: QueryClient) => Promise<void>> = {
  board: prefetchBoard,
  new: prefetchNewOrder,
  reports: prefetchReports,
  settings: prefetchSettings,
};

/**
 * Starts the fetches a tab is about to need. Safe to call on every tap: an
 * already-cached key is skipped by React Query, and a failure is swallowed —
 * the screen itself will surface it properly when it mounts.
 */
export function prefetchTab(queryClient: QueryClient, tab: string): void {
  const warm = WARMERS[tab as TabName];
  if (!warm) return;
  void warm(queryClient).catch(() => {
    // A prefetch is an optimisation. Offline, a slow server or a 401 all mean
    // the screen does this itself, with its own loading and error states.
  });
}

/**
 * Warms everything the app opens with, once the session is ready.
 *
 * The board is the landing tab, so it is the one that must not show a skeleton
 * on first launch; the menu follows because "new order" is one tap away and is
 * the most-used screen in a shop.
 */
export function warmOnBoot(queryClient: QueryClient): void {
  void Promise.all([
    prefetchBoard(queryClient).catch(() => {}),
    queryClient
      .prefetchQuery({ queryKey: qk.menu, queryFn: () => api.menu(), staleTime: STALE.reference })
      .catch(() => {}),
  ]);
}
