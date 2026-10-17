export const HEIGHT = 48;
export const FONT_SIZE = 16;
// The till's cards are `rounded-2xl` (16px); BNA UI's default is 26. 18 keeps
// the library's soft idiom while staying close to the till.
export const BORDER_RADIUS = 18;
export const CORNERS = 999;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

// The tab bar floats above the content instead of sitting flush against the
// bottom edge, so screens reserve this much room at the end of their scroll.
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_GAP = 14;
export const TAB_BAR_SPACE = TAB_BAR_HEIGHT + TAB_BAR_GAP * 2;

// One frost for the whole app — the tab bar, the dial and the cart surfaces all
// read the same. Medium strength with a see-through tint; nothing opaque is
// painted over it, so the screen behind keeps showing through.
export const BLUR_INTENSITY = 55;
/** Divides the Android blur strength so the values above read as medium there.
 * The library default (4) is much weaker than iOS at the same intensity. */
export const BLUR_REDUCTION = 2;
