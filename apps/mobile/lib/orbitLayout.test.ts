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
    expect(layoutOrbits(0, false, GAP)).toEqual([]);
  });

  it('uses one ring up to MAX_PER_RING and a second beyond it', () => {
    expect(new Set(layoutOrbits(3, false, GAP).map((s) => s.ring))).toEqual(new Set([0]));
    expect(new Set(layoutOrbits(MAX_PER_RING, false, GAP).map((s) => s.ring))).toEqual(new Set([0]));
    expect(new Set(layoutOrbits(MAX_PER_RING + 1, false, GAP).map((s) => s.ring))).toEqual(
      new Set([0, 1])
    );
    expect(new Set(layoutOrbits(9, false, GAP).map((s) => s.ring))).toEqual(new Set([0, 1, 2]));
  });

  it('gives every action exactly one slot, in list order', () => {
    const slots = layoutOrbits(6, false, GAP);
    expect(slots.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(slots.map((s) => `${s.x},${s.y}`)).size).toBe(6);
  });

  it('keeps entries far enough apart that the circles cannot overlap', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 12]) {
      const slots = layoutOrbits(count, false, GAP);
      expect(minPairDistance(slots), `count=${count}`).toBeGreaterThanOrEqual(ITEM + 4);
    }
  });

  it('pushes each ring further out than the one before it', () => {
    const slots = layoutOrbits(8, false, GAP);
    const inner = Math.max(...slots.filter((s) => s.ring === 0).map(radiusOf));
    const outer = Math.min(...slots.filter((s) => s.ring === 1).map(radiusOf));
    expect(inner).toBeGreaterThanOrEqual(INNER_RADIUS);
    expect(outer - inner).toBeGreaterThanOrEqual(RING_GAP - 1);
  });

  it('keeps the whole fan above the button', () => {
    for (const count of [1, 3, 5, 8, 12]) {
      for (const slot of layoutOrbits(count, false, GAP)) {
        expect(slot.y, `count=${count}`).toBeLessThan(0);
      }
    }
  });

  it('fans towards the screen interior, and mirrors for RTL', () => {
    const ltr = layoutOrbits(3, false, GAP);
    const rtl = layoutOrbits(3, true, GAP);
    // Button bottom-right in LTR: everything leans left. Mirrored in RTL.
    expect(ltr.every((slot) => slot.x <= 0.001)).toBe(true);
    expect(rtl.every((slot) => slot.x >= -0.001)).toBe(true);
    expect(rtl.map((slot) => slot.x)).toEqual(ltr.map((slot) => -slot.x));
    expect(rtl.map((slot) => slot.y)).toEqual(ltr.map((slot) => slot.y));
  });

  it('puts the first entry straight up and the last at the far edge of the fan', () => {
    const slots = layoutOrbits(4, false, GAP);
    // Straight up: no lateral offset, and the highest point of the fan.
    expect(Math.abs(slots[0].x)).toBeLessThan(1e-6);
    expect(slots[0].y).toBe(Math.min(...slots.map((slot) => slot.y)));
    // The last entry is the most lateral one, exactly ARC_DEGREES off vertical.
    const last = slots[slots.length - 1];
    expect(last.x).toBe(Math.min(...slots.map((slot) => slot.x)));
    const offVertical = (Math.atan2(-last.x, -last.y) * 180) / Math.PI;
    expect(offVertical).toBeCloseTo(ARC_DEGREES, 5);
  });
});
