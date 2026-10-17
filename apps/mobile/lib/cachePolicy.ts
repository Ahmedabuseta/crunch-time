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
 */
export const STALE = {
  /** Menu, settings, catalogue, staff — changes only when an owner edits it. */
  reference: 5 * 60 * 1000,
  /** Delivery zones/profiles, sub-recipes, printers — configuration. */
  config: 10 * 60 * 1000,
  /** Orders — the socket keeps these live, so always refetch while online. */
  live: 0,
  /** Shift, drawer, stock — moves with every sale. */
  short: 30 * 1000,
  /** Aggregates over the live day. */
  report: 5 * 60 * 1000,
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
