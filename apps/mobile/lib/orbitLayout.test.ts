import { describe, expect, it } from 'vitest';
import { ARC_DEGREES, INNER_RADIUS, MAX_PER_RING, RING_GAP, layoutOrbits } from './orbitLayout';

const ITEM = 50;
const GAP = ITEM + 16;

const radiusOf = (slot: { x: number; y: number }) => Math.hypot(slot.x, slot.y);

const minPairDistance = (slots: { x: number; y: number }[]) => {
  let min = Infinity;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      min = Math.min(min, Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y));
    }
  }
  return min;
};

describe('layoutOrbits', () => {
  it('returns nothing for no actions', () => {
    expect(layoutOrbits(0, GAP)).toEqual([]);
  });

  it('uses one ring up to MAX_PER_RING and a second beyond it', () => {
    expect(new Set(layoutOrbits(3, GAP).map((s) => s.ring))).toEqual(new Set([0]));
    expect(new Set(layoutOrbits(MAX_PER_RING, GAP).map((s) => s.ring))).toEqual(new Set([0]));
    expect(new Set(layoutOrbits(MAX_PER_RING + 1, GAP).map((s) => s.ring))).toEqual(new Set([0, 1]));
    expect(new Set(layoutOrbits(9, GAP).map((s) => s.ring))).toEqual(new Set([0, 1, 2]));
  });

  it('gives every action exactly one slot, in list order', () => {
    const slots = layoutOrbits(6, GAP);
    expect(slots.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(slots.map((s) => `${s.x},${s.y}`)).size).toBe(6);
  });

  it('keeps entries far enough apart that the circles cannot overlap', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 12]) {
      const slots = layoutOrbits(count, GAP);
      expect(minPairDistance(slots), `count=${count}`).toBeGreaterThanOrEqual(ITEM + 4);
    }
  });

  it('pushes each ring further out than the one before it', () => {
    const slots = layoutOrbits(8, GAP);
    const inner = Math.max(...slots.filter((s) => s.ring === 0).map(radiusOf));
    const outer = Math.min(...slots.filter((s) => s.ring === 1).map(radiusOf));
    expect(inner).toBeGreaterThanOrEqual(INNER_RADIUS);
    expect(outer - inner).toBeGreaterThanOrEqual(RING_GAP - 1);
  });

  it('keeps the whole fan above the button', () => {
    for (const count of [1, 3, 5, 8, 12]) {
      for (const slot of layoutOrbits(count, GAP)) {
        expect(slot.y, `count=${count}`).toBeLessThan(0);
      }
    }
  });

  it('is symmetric about the button', () => {
    // The button is docked in the middle of the bar, so there is no interior
    // side to lean towards — the fan straddles it, at the same heights.
    const slots = layoutOrbits(4, GAP);
    const xs = slots.map((s) => s.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-xs[3], 6);
    expect(xs[1]).toBeCloseTo(-xs[2], 6);
    expect(Math.abs(xs.reduce((sum, x) => sum + x, 0))).toBeLessThan(1e-6);

    const heights = Object.values(
      slots.reduce<Record<string, number[]>>((groups, slot) => {
        const key = String(Math.abs(slot.x) < 1e-6 ? 'mid' : Math.round(Math.abs(slot.x)));
        (groups[key] ??= []).push(slot.y);
        return groups;
      }, {})
    );
    for (const group of heights) expect(new Set(group).size).toBe(1);
  });

  it('centres the fan on straight up', () => {
    // An odd count gets an entry dead centre, at the top of the arc.
    const odd = layoutOrbits(3, GAP);
    expect(Math.abs(odd[1].x)).toBeLessThan(1e-6);
    expect(odd[1].y).toBe(Math.min(...odd.map((s) => s.y)));

    // An even count straddles it: the outermost entry is half the arc off
    // vertical. Slots are rounded to whole pixels, so this holds to ~0.1°.
    const even = layoutOrbits(4, GAP);
    const last = even[even.length - 1];
    const offVertical = (Math.atan2(last.x, -last.y) * 180) / Math.PI;
    expect(offVertical).toBeCloseTo(ARC_DEGREES / 2, 0);
    expect(last.x).toBeGreaterThan(0);
    expect(even[0].x).toBeLessThan(0);
  });

  it('puts a lone entry straight up, clear of the bar', () => {
    const [slot] = layoutOrbits(1, GAP);
    expect(slot.x).toBe(0);
    expect(slot.y).toBe(-INNER_RADIUS);
  });
});
