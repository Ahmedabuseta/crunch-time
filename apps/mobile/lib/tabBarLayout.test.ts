import { describe, expect, it } from 'vitest';
import {
  BUTTON_WIDTH,
  COMPACT_WIDTH,
  GAP_PADDING,
  MAX_BAR_WIDTH,
  MAX_DESTINATIONS,
  MIN_TAB_WIDTH,
  isHiddenFromBar,
  splitTabGroups,
  tabBarMetrics,
  tabWidth,
} from './tabBarLayout';

const EDGE = 14;

/** The narrowest phone that matters, a common Android width, a large phone, a
 * tablet, and a notched landscape window. */
const SCREENS: { name: string; width: number; left?: number; right?: number }[] = [
  { name: '320pt phone', width: 320 },
  { name: '360pt phone', width: 360 },
  { name: '412pt phone', width: 412 },
  { name: 'tablet', width: 834 },
  { name: 'landscape with a notch', width: 780, left: 44, right: 44 },
];

const metrics = (screen: (typeof SCREENS)[number]) =>
  tabBarMetrics(screen.width, screen.left ?? 0, screen.right ?? 0, EDGE);

describe('tabBarMetrics', () => {
  it('fits the bar inside the screen on every size', () => {
    for (const screen of SCREENS) {
      const m = metrics(screen);
      expect(m.barLeft, screen.name).toBeGreaterThanOrEqual(0);
      expect(m.barLeft + m.barWidth, screen.name).toBeLessThanOrEqual(screen.width + 1e-6);
    }
  });

  it('keeps the bar clear of the notch in landscape', () => {
    const screen = { name: 'notch', width: 780, left: 44, right: 44 };
    const m = metrics(screen);
    expect(m.barLeft).toBeGreaterThanOrEqual(44);
    expect(m.barLeft + m.barWidth).toBeLessThanOrEqual(780 - 44);
  });

  it('centres the bar rather than stretching it on a tablet', () => {
    const m = metrics({ name: 'tablet', width: 834 });
    expect(m.barWidth).toBe(MAX_BAR_WIDTH);
    expect(m.barLeft).toBe((834 - MAX_BAR_WIDTH) / 2);
  });

  it('always leaves the button room, at every size', () => {
    for (const screen of SCREENS) {
      const m = metrics(screen);
      expect(m.gap, screen.name).toBeGreaterThan(BUTTON_WIDTH);
    }
  });

  it('gives the pills a usable width for two tabs each', () => {
    for (const screen of SCREENS) {
      const m = metrics(screen);
      const pill = (m.barWidth - m.gap) / 2;
      // Two tabs in each pill; below ~52pt the labels cannot sit on one line.
      expect(pill / 2, screen.name).toBeGreaterThan(50);
    }
  });

  it('tightens the labels only on the narrowest screens', () => {
    expect(metrics({ name: '320pt', width: 320 }).compact).toBe(true);
    expect(metrics({ name: '360pt', width: 360 }).compact).toBe(false);
    expect(metrics({ name: 'tablet', width: 834 }).compact).toBe(false);
    expect(metrics({ name: 'tablet', width: 834 }).iconSize).toBe(20);
    expect(metrics({ name: '320pt', width: 320 }).labelSize).toBe(10);
  });

  it('survives an absurdly small window without going negative', () => {
    const m = tabBarMetrics(200, 0, 0, EDGE);
    expect(m.barWidth).toBeGreaterThan(0);
    expect(Number.isFinite(m.gap)).toBe(true);
    expect(m.compact).toBe(true);
  });

  it('caps the gap so a wide screen does not strand the groups apart', () => {
    const m = metrics({ name: 'tablet', width: 834 });
    expect(m.gap).toBe(BUTTON_WIDTH + GAP_PADDING + 30);
  });

  it('grows the gap with the bar, but never below the button', () => {
    const narrow = metrics({ name: '320pt', width: 320 });
    const wide = metrics({ name: '412pt', width: 412 });
    expect(narrow.gap).toBeGreaterThanOrEqual(BUTTON_WIDTH + GAP_PADDING);
    expect(wide.gap).toBeGreaterThan(narrow.gap);
    // Still compact-friendly: the pills keep most of the width.
    expect(wide.gap).toBeLessThan(wide.barWidth * 0.3);
    expect(COMPACT_WIDTH).toBeGreaterThan(0);
  });
});

describe('splitTabGroups', () => {
  it('balances the four destinations as 2 + 2', () => {
    expect(splitTabGroups(MAX_DESTINATIONS)).toEqual([2, 2]);
  });

  it('gives the extra tab to the first group when the count is odd', () => {
    expect(splitTabGroups(3)).toEqual([2, 1]);
    expect(splitTabGroups(5)).toEqual([3, 2]);
  });

  it('handles the degenerate counts', () => {
    expect(splitTabGroups(0)).toEqual([]);
    expect(splitTabGroups(1)).toEqual([1]);
  });

  it('never drops a destination, even past the ceiling', () => {
    // Better a cramped bar than an unreachable screen — the rule is enforced
    // by a warning and by this suite, not by hiding routes.
    for (const count of [1, 2, 3, 4, 5, 6]) {
      expect(splitTabGroups(count).reduce((sum, size) => sum + size, 0)).toBe(count);
    }
  });
});

describe('the four-destination rule', () => {
  it('is a ceiling of four, plus the dial button as the fifth slot', () => {
    expect(MAX_DESTINATIONS).toBe(4);
  });

  it('holds: four destinations give every tab a readable width', () => {
    for (const screen of SCREENS) {
      const m = metrics(screen);
      for (const size of splitTabGroups(MAX_DESTINATIONS)) {
        expect(tabWidth(m, size), screen.name).toBeGreaterThan(MIN_TAB_WIDTH);
      }
    }
  });

  it('breaks at five, which is why it is a rule', () => {
    // The narrowest phone is the one that proves it.
    const m = metrics({ name: '320pt', width: 320 });
    const sizes = splitTabGroups(5);
    expect(sizes).toEqual([3, 2]);
    // The three-tab pill cannot keep its labels on one line.
    expect(tabWidth(m, sizes[0])).toBeLessThan(MIN_TAB_WIDTH);
  });
});

describe('isHiddenFromBar', () => {
  it('spots the marker expo-router puts on an href: null screen', () => {
    // This is exactly what `options={{ href: null }}` becomes: the href is
    // stripped out and the item is given a display-none style instead.
    expect(isHiddenFromBar({ tabBarItemStyle: { display: 'none' } })).toBe(true);
  });

  it('keeps the real destinations', () => {
    expect(isHiddenFromBar({})).toBe(false);
    expect(isHiddenFromBar(undefined)).toBe(false);
    expect(isHiddenFromBar({ tabBarItemStyle: undefined })).toBe(false);
    // A regular tab styles its item normally, and must not be mistaken for
    // hidden.
    expect(isHiddenFromBar({ tabBarItemStyle: { paddingVertical: 2 } })).toBe(false);
    expect(isHiddenFromBar({ tabBarItemStyle: { display: 'flex' } })).toBe(false);
  });

  it('filters a real route list down to the four destinations', () => {
    // The shape of apps/mobile/app/(app)/_layout.tsx: four tabs, then the
    // detail pages and forms that must not take a slot.
    const routes = [
      { name: 'board', options: { title: 'الطلبات' } },
      { name: 'new', options: { title: 'طلب جديد' } },
      { name: 'reports', options: { title: 'التقارير' } },
      { name: 'settings', options: { title: 'المزيد' } },
      { name: 'order/[id]', options: { tabBarItemStyle: { display: 'none' } } },
      { name: 'shift', options: { tabBarItemStyle: { display: 'none' } } },
      { name: 'manage', options: { tabBarItemStyle: { display: 'none' } } },
    ];

    const visible = routes.filter((route) => !isHiddenFromBar(route.options));
    expect(visible.map((route) => route.name)).toEqual(['board', 'new', 'reports', 'settings']);
    // And with them gone, the four-destination rule is satisfied rather than
    // being blown by blank tabs.
    expect(visible.length).toBeLessThanOrEqual(MAX_DESTINATIONS);
    expect(splitTabGroups(visible.length)).toEqual([2, 2]);
  });
});
