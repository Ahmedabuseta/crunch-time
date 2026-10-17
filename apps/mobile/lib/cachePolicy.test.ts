import type { Query } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { CACHE_MAX_AGE, STALE, cacheBuster, networkStateToOnline, shouldDehydrateQuery } from './cachePolicy';

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
