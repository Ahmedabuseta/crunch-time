// The exact query keys each tab's prefetch warms.
//
// Kept apart from `prefetch.ts` for one reason: that module imports the API
// client, which pulls in React Native, and the app's unit runner is a plain node
// environment. The keys are the part that can silently go wrong — a prefetch
// with a key the screen does not use costs a request and warms nothing — so they
// live here where a test can compare them against the same `qk` helpers the
// hooks call.
import { initialQuery } from '@/lib/listQuery';
import { qk } from '@/lib/queryKeys';

/**
 * The board's first page. Must match `usePagedQuery` on the board exactly:
 * `keyFor: (query) => qk.paged('orders', query)` with
 * `initialSort: 'createdAt'`, `initialDir: 'desc'`, `pageSize: 30`.
 */
export function boardListQuery() {
  return initialQuery('createdAt', 'desc');
}

export const BOARD_PAGE_SIZE = 30;

/** The New Order tab: the menu a cashier picks from, and receipt settings. */
export function newOrderKeys() {
  return { menu: qk.menu, settings: qk.settings } as const;
}

/** The Reports tab opens on today's Z report and the daily summary. */
export function reportsKeys() {
  return { z: qk.zReport(undefined), daily: qk.reports('daily', undefined) } as const;
}

/** المزيد: settings, the printer list and the categories its lists filter by. */
export function settingsKeys() {
  return {
    settings: qk.settings,
    printers: qk.printers,
    categories: qk.categories,
  } as const;
}
