// Geometry for the app-wide action dial: concentric arcs of entries around the
// floating button. Kept free of React Native so it can be unit-tested — the
// spacing and ring maths is exactly the part that cannot be checked by eye.

export interface OrbitSlot {
  /** Offset from the button's centre, in screen pixels. Negative y is upwards. */
  x: number;
  y: number;
  /** 0 is the ring nearest the button. */
  ring: number;
  /** Position in the original action list. */
  order: number;
}

/** The fan stays inside the quarter above the button; past 90° the far entries
 * would drop below it and off the bottom of the screen. */
export const ARC_DEGREES = 88;
export const INNER_RADIUS = 112;
export const RING_GAP = 86;
export const MAX_PER_RING = 4;

export function layoutOrbits(count: number, isRtl: boolean, gap: number): OrbitSlot[] {
  if (count <= 0) return [];

  const rings = Math.max(1, Math.ceil(count / MAX_PER_RING));
  const base = Math.floor(count / rings);
  const extra = count % rings;
  // The extra entries go to the outermost rings, so the tight inner ring is
  // never the crowded one.
  const sizes = Array.from({ length: rings }, (_, ring) =>
    base + (ring >= rings - extra ? 1 : 0)
  );

  const slots: OrbitSlot[] = [];
  let radius = 0;
  let order = 0;

  sizes.forEach((size, ring) => {
    const step = size > 1 ? ARC_DEGREES / (size - 1) : 0;
    // Far enough out that this ring's own entries keep `gap` between them.
    const needed = size > 1 ? gap / (2 * Math.sin(((step * Math.PI) / 180) / 2)) : INNER_RADIUS;
    radius = ring === 0 ? Math.max(INNER_RADIUS, needed) : Math.max(radius + RING_GAP, needed);

    for (let i = 0; i < size; i++) {
      // A lone entry sits in the middle of the fan rather than at its edge.
      const degrees = size > 1 ? i * step : ARC_DEGREES / 2;
      const radians = (degrees * Math.PI) / 180;
      slots.push({
        x: (isRtl ? 1 : -1) * Math.sin(radians) * radius,
        y: -Math.cos(radians) * radius,
        ring,
        order: order++,
      });
    }
  });

  return slots;
}
