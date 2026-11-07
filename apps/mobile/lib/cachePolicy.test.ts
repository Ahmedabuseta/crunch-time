import type { Query } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  CACHE_MAX_AGE,
  STALE,
  cacheBuster,
  networkStateToOnline,
  shouldDehydrateQuery,
  shrinkToNewest,
} from './cachePolicy';

/** A stand-in for the parts of a Query the policy actually reads. */
const query = (state: Record<string, unknown>, meta?: Record<string, unknown>) =>
  ({ state, meta }) as unknown as Query;

describe('shouldDehydrateQuery', () => {
  it('persists a successful read', () => {
    expect(shouldDehydrateQuery(query({ status: 'success' }))).toBe(true);
  });

  it('never persists an error', () => {
    expect(shouldDehydrateQuery(query({ status: 'error' }))).toBe(false);
    expect(shouldDehydrateQuery(query({ status: 'pending' }))).toBe(false);
  });

  it('honours an explicit opt-out', () => {
    expect(shouldDehydrateQuery(query({ status: 'success' }, { persist: false }))).toBe(false);
    expect(shouldDehydrateQuery(query({ status: 'success' }, { persist: true }))).toBe(true);
  });
});

describe('cacheBuster', () => {
  it('uses the app version so an update drops the cache', () => {
    expect(cacheBuster('0.1.0')).toBe('0.1.0');
    expect(cacheBuster(' 2.0.0 ')).toBe('2.0.0');
  });

  it('falls back to a constant when there is no version', () => {
    expect(cacheBuster(undefined)).toBe('1');
    expect(cacheBuster(null)).toBe('1');
    expect(cacheBuster('   ')).toBe('1');
  });
});

describe('shrinkToNewest', () => {
  const entry = (at: number) => ({ state: { dataUpdatedAt: at } });

  it('keeps the newest half when a write does not fit', () => {
    // Android caps one AsyncStorage entry near 2 MB; a day of paged lists passes
    // it, and the failed write leaves no cache at all.
    const kept = shrinkToNewest([entry(1), entry(9), entry(5), entry(7)], 1);
    expect(kept?.map((q) => q.state.dataUpdatedAt)).toEqual([9, 7]);
  });

  it('never returns an empty cache', () => {
    const kept = shrinkToNewest([entry(1), entry(2)], 1);
    expect(kept).toHaveLength(1);
  });

  it('gives up rather than retrying forever', () => {
    expect(shrinkToNewest([entry(1), entry(2), entry(3)], 4)).toBeUndefined();
    expect(shrinkToNewest([entry(1)], 1)).toBeUndefined();
  });

  it('treats a query with no timestamp as the oldest', () => {
    const noStamp: { state: { dataUpdatedAt?: number } } = { state: {} };
    const kept = shrinkToNewest([noStamp, entry(5), entry(8), entry(6)], 1);
    expect(kept?.map((q) => q.state.dataUpdatedAt)).toEqual([8, 6]);
  });
});

describe('STALE windows', () => {
  it('never caches the live order board', () => {
    // The socket pushes every change, so a cached board could show a sale that
    // has already been updated. This one must stay at zero.
    expect(STALE.live).toBe(0);
  });

  it('keeps reference data around for a screen visit and then some', () => {
    // A phone that re-reads the menu on every tab spends its first frame
    // fetching data it already has.
    expect(STALE.reference).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(STALE.config).toBeGreaterThan(STALE.reference);
  });
});

describe('networkStateToOnline', () => {
  it('assumes online before the first reading', () => {
    expect(networkStateToOnline(undefined)).toBe(true);
    expect(networkStateToOnline(null)).toBe(true);
  });

  it('is offline when there is no connection', () => {
    expect(networkStateToOnline({ isConnected: false })).toBe(false);
  });

  it('is offline when the network is up but the internet is not', () => {
    expect(networkStateToOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it('is online when connected and reachable (or reachability is unknown)', () => {
    expect(networkStateToOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(networkStateToOnline({ isConnected: true })).toBe(true);
  });
});

describe('the window constants', () => {
  it('keeps the persisted cache bounded to a day', () => {
    expect(CACHE_MAX_AGE).toBe(24 * 60 * 60 * 1000);
  });

  it('orders freshness from always-fresh to rarely-fresh', () => {
    expect(STALE.live).toBe(0);
    expect(STALE.reference).toBeGreaterThan(STALE.short);
    expect(STALE.config).toBeGreaterThan(STALE.reference);
  });
});
