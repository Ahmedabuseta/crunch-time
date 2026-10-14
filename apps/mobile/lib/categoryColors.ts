// The server stores category colours as the till's CSS variables
// (e.g. "var(--cat-drinks)"), so the phone maps them to the same converted hex
// the theme uses. An unknown value falls back rather than rendering invisible.
const CATEGORY_COLORS: Record<string, string> = {
  'var(--cat-burgers)': '#FF5F5B',
  'var(--cat-pizza)': '#FB6E00',
  'var(--cat-chicken)': '#D78E00',
  'var(--cat-sides)': '#00BF54',
  'var(--cat-drinks)': '#00A0F0',
  'var(--cat-desserts)': '#CE74E3',
  'var(--cat-crepe-savory)': '#FB6E00',
  'var(--cat-crepe-sweet)': '#CE74E3',
  'var(--cat-meals)': '#D78E00',
};

export function categoryColor(color?: string | null, fallback = '#E6AD00'): string {
  if (!color) return fallback;
  if (CATEGORY_COLORS[color]) return CATEGORY_COLORS[color];
  if (color.startsWith('#') || color.startsWith('rgb')) return color;
  return fallback;
}
