// Sizing for the two-pill tab bar. Pure so it can be tested across the screen
// sizes the bar has to survive (a 320pt phone, a landscape notch, a tablet),
// which is otherwise only checkable by holding the device.

/** Past this the bar stops growing and centres instead, so it does not stretch
 * into a thin ribbon across a tablet or a landscape window. */
export const MAX_BAR_WIDTH = 520;
/** Below this the labels tighten, which keeps them on one line on a 320pt
 * phone. */
export const COMPACT_WIDTH = 320;
/** Clearance either side of the button, on top of its own width. */
export const GAP_PADDING = 14;
/** The button's own width — the gap is never narrower than this plus padding. */
export const BUTTON_WIDTH = 54;

/**
 * The bar's hard ceiling: four destinations plus the dial button in the gap.
 * Five is the classic maximum for a bottom bar (Material and iOS both say 3–5
 * controls), and the fifth slot here is the button, not a tab.
 *
 * A fifth *destination* would put three tabs in one pill, which on a 320pt
 * phone leaves ~37pt each — too narrow for a label to sit on one line. That is
 * why this is a rule and not a preference: anything beyond four belongs behind
 * the dial or behind المزيد.
 */
export const MAX_DESTINATIONS = 4;

/** Below this a tab's label cannot sit on one line. */
export const MIN_TAB_WIDTH = 50;

export interface TabBarMetrics {
  /** The bar's own width, never wider than MAX_BAR_WIDTH. */
  barWidth: number;
  /** Its left edge, centred on the screen either way. */
  barLeft: number;
  /** The free space between the two pills, where the button sits. */
  gap: number;
  compact: boolean;
  iconSize: number;
  labelSize: number;
}

/**
 * Works out the bar's geometry from the screen, keeping it clear of notches in
 * landscape, centred rather than stretched on a tablet, and roomy enough for
 * the button on the narrowest phone.
 */
export function tabBarMetrics(
  width: number,
  safeLeft: number,
  safeRight: number,
  edgeGap: number
): TabBarMetrics {
  // Never narrower than the edge gap, and never under the notch.
  const sideInset = Math.max(edgeGap, safeLeft, safeRight);
  const barWidth = Math.min(Math.max(width - sideInset * 2, 0), MAX_BAR_WIDTH);
  // Always room for the button, and proportional to the bar so the groups do
  // not read as squeezed together on a wide screen.
  const gap = Math.min(
    Math.max(Math.round(barWidth * 0.2), BUTTON_WIDTH + GAP_PADDING),
    BUTTON_WIDTH + GAP_PADDING + 30
  );
  const compact = barWidth < COMPACT_WIDTH;

  return {
    barWidth,
    barLeft: Math.max((width - barWidth) / 2, sideInset),
    gap,
    compact,
    iconSize: compact ? 18 : 20,
    labelSize: compact ? 10 : 11,
  };
}

/**
 * How many tabs go in each pill. Two groups, the first taking the extra when
 * the count is odd — which is why four destinations give a balanced 2 + 2.
 *
 * Never drops a destination: a count over MAX_DESTINATIONS still lays out (it
 * just gets cramped), because silently hiding a screen would be worse than an
 * ugly bar.
 */
export function splitTabGroups(total: number): number[] {
  if (total <= 0) return [];
  const split = Math.ceil(total / 2);
  return [split, total - split].filter((size) => size > 0);
}

/** The width one tab gets, given the bar's metrics and how many tabs share a
 * pill. Used to check the four-destination rule still holds. */
export function tabWidth(metrics: TabBarMetrics, groupSize: number): number {
  return groupSize > 0 ? (metrics.barWidth - metrics.gap) / 2 / groupSize : 0;
}

/** A screen's options, as far as the bar cares. */
export interface ScreenOptions {
  tabBarItemStyle?: unknown;
}

/**
 * Whether a screen is hidden from the bar.
 *
 * expo-router deals with `<Tabs.Screen options={{ href: null }} />` by
 * *removing* `href` from the options and instead giving the item a display-none
 * style plus a button that renders nothing. The stock bar honours that; a
 * hand-drawn one has to honour it too, or every detail page and form declared
 * with `href: null` shows up as a blank tab and squeezes the real destinations
 * out of the bar.
 */
export function isHiddenFromBar(options: ScreenOptions | undefined): boolean {
  const style = options?.tabBarItemStyle as { display?: unknown } | undefined;
  return style?.display === 'none';
}
