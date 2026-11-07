// Cache policy — the pure, testable half of the React Query setup: how long a
// persisted entry lives, how fresh each kind of data has to be, and which
// queries are allowed on disk. Kept free of React Native imports so the repo's
// node-env vitest runner can cover it.
import type { Query } from '@tanstack/react-query';

/** How long a persisted entry may survive a restart. */
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24h

/**
 * Freshness windows, grouped by how fast each kind of data actually moves.
 * Inside the window a mount paints from cache and skips the network; past it,
 * the cached value still paints and a refetch happens behind it.
 *
 * These are deliberately generous. A phone on shop wifi that re-reads the menu
 * on every screen visit spends the first frame of that screen fetching data it
 * already has; the socket and the mutations invalidate what actually changed,
 * so a long window costs correctness almost nothing. The one exception is
 * `live`, which is 0 because the order board must show a new order instantly.
 */
export const STALE = {
  /** Menu, settings, catalogue, staff, inventory — changes only when an owner edits it. */
  reference: 30 * 60 * 1000,
  /** Delivery zones/profiles, sub-recipes, printers — configuration. */
  config: 60 * 60 * 1000,
  /** Orders — the socket keeps these live, so always refetch while online. */
  live: 0,
  /** Shift, drawer — moves with every sale but the socket invalidates it too. */
  short: 2 * 60 * 1000,
  /** Aggregates over the live day: a report only changes as sales land. */
  report: 15 * 60 * 1000,
} as const;

/**
 * Only successful reads are written to disk — never errors. A query opts out
 * entirely with `meta.persist: false` (health, audit, backup status): those are
 * about "right now" and are worthless replaying from yesterday.
 */
export function shouldDehydrateQuery(query: Query): boolean {
  return query.state.status === 'success' && query.meta?.persist !== false;
}

/** The app version, so a shipped update drops a stale on-disk cache. */
export function cacheBuster(version?: string | null): string {
  return version && version.trim() ? version.trim() : '1';
}

/**
 * What to write when a cache write does not fit.
 *
 * Android caps a single AsyncStorage entry at about 2 MB. A day of paged order
 * lists can pass that, and the failure is silent: the write throws, nothing is
 * stored, and the next cold start has no cache at all — the app looks like it
 * never cached anything. Dropping the oldest half always fits, and a cache
 * missing its oldest entries still paints the board and the menu.
 *
 * Returns `undefined` once there is nothing left worth keeping, which stops the
 * persister from retrying forever.
 */
export function shrinkToNewest<T extends { state: { dataUpdatedAt?: number } }>(
  queries: readonly T[],
  attempt: number,
): T[] | undefined {
  // Three attempts is enough: each halves the set, so the fourth would be
  // dropping data that can no longer make a cache worth restoring.
  if (attempt > 3 || queries.length <= 1) return undefined;
  const newestFirst = [...queries].sort(
    (a, b) => (b.state.dataUpdatedAt ?? 0) - (a.state.dataUpdatedAt ?? 0)
  );
  return newestFirst.slice(0, Math.max(1, Math.floor(newestFirst.length / 2)));
}

/**
 * expo-network's `NetworkState` → React Query's online flag. An unknown state
 * (before the first reading) counts as online, so the app never flashes
 * "offline" during boot.
 */
export function networkStateToOnline(
  state?: { isConnected?: boolean; isInternetReachable?: boolean } | null
): boolean {
  if (!state) return true;
  if (!state.isConnected) return false;
  return state.isInternetReachable !== false;
}
