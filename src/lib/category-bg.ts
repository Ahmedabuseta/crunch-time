/**
 * Static per-category background photos (public/cat-bg/), sourced from
 * Unsplash (free license). Keyed by the seeded category id — categories added
 * later simply render without a photo.
 * URLs are document-relative so they resolve both under the dev server and
 * the packaged file:// build (see vite config base './' + electron loadFile).
 */
const CATEGORY_BG: Record<string, string> = {
  all: 'cat-bg/all.jpg',
  drinks: 'cat-bg/drinks.jpg',
  meat_crepe: 'cat-bg/meat_crepe.jpg',
  breakfast: 'cat-bg/breakfast.jpg',
  buckets: 'cat-bg/buckets.jpg',
  chicken_crepe: 'cat-bg/chicken_crepe.jpg',
  potato_crepe: 'cat-bg/potato_crepe.jpg',
  syrian: 'cat-bg/syrian.jpg',
  mixes: 'cat-bg/mixes.jpg',
  sweets: 'cat-bg/sweets.jpg',
  treat: 'cat-bg/treat.jpg',
}

export function categoryBg(id: string): string | undefined {
  return CATEGORY_BG[id]
}
