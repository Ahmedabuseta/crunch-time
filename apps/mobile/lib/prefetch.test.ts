// Prefetch keys must be identical to the keys the screens use.
//
// A prefetch with the wrong key is worse than none at all: it costs a request,
// warms nothing, and the screen it was meant to help still shows a skeleton —
// while looking like it works. These tests compare the prefetch layer against
// the same `qk` helpers the hooks call, so a rename or a changed default on
// either side fails here rather than on a phone in a shop.
import { describe, expect, it } from 'vitest';
import { initialQuery } from './listQuery';
import {
  BOARD_PAGE_SIZE,
  boardListQuery,
  newOrderKeys,
  reportsKeys,
  settingsKeys,
} from './prefetchKeys';
import { qk } from './queryKeys';

describe('board prefetch key', () => {
  it('matches what usePagedQuery builds on the board', () => {
    // The board's call: initialQuery('createdAt', 'desc') → qk.paged('orders', q)
    const prefetched = qk.paged('orders', boardListQuery());
    const screen = qk.paged('orders', initialQuery('createdAt', 'desc'));
    expect(prefetched).toEqual(screen);
  });

  it('uses the board\'s own page size', () => {
    // pageSize is not part of the key, but fetching 25 rows for a list that
    // renders 30 would leave a visible gap at the bottom of the first screen.
    expect(BOARD_PAGE_SIZE).toBe(30);
  });

  it('sits under the prefix the socket invalidates', () => {
    // useOrderSocket invalidates ['orders']; a key outside that prefix would
    // never refresh on a live sale.
    expect(qk.paged('orders', boardListQuery())[0]).toBe('orders');
  });
});

describe('screen prefetch keys', () => {
  it('uses the same Z-report key as useZReport()', () => {
    // The reports screen calls useZReport() with no argument.
    expect(reportsKeys().z).toEqual(qk.zReport());
    expect(reportsKeys().z).toEqual(['reports', 'z', 'current']);
  });

  it('uses the same daily key as useReport("daily")', () => {
    expect(reportsKeys().daily).toEqual(qk.reports('daily'));
  });

  it('shares the menu and settings keys with their hooks', () => {
    expect(newOrderKeys().menu).toEqual(qk.menu);
    expect(newOrderKeys().settings).toEqual(qk.settings);
    expect(newOrderKeys().menu).toEqual(['menu']);
  });

  it('shares the settings, printers and categories keys', () => {
    expect(settingsKeys().printers).toEqual(qk.printers);
    expect(settingsKeys().categories).toEqual(qk.categories);
    expect(settingsKeys().settings).toEqual(qk.settings);
  });
});

describe('key independence', () => {
  it('does not collide the two report keys', () => {
    // Both live under ['reports'], which is the prefix the socket invalidates —
    // but they must stay distinct entries, or the Z report would overwrite the
    // daily summary in the cache.
    expect(reportsKeys().z).not.toEqual(reportsKeys().daily);
  });
});
