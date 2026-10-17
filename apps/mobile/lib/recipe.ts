// Recipe maths and picking, kept free of React Native so the parts that must
// agree with the till — the line cost and the "costs more than it sells for"
// warning — can be unit-tested.

import type { Ingredient, RecipeLine } from '@/api/types';

/** Money is kept in two decimals; this stops float noise (0.1 × 3 = 0.30000…4)
 * from making a borderline recipe read as overpriced. */
const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** A line is either a sub-recipe or a raw ingredient; never both. */
export const isSubRecipeLine = (line: RecipeLine): boolean => Boolean(line.subRecipeId);

export const lineName = (line: RecipeLine): string =>
  (isSubRecipeLine(line) ? line.subRecipeName : line.ingredientName) ?? '—';

export const lineUnit = (line: RecipeLine): string =>
  (isSubRecipeLine(line) ? line.subRecipeUnit : line.unit) ?? '';

/** What one unit of this line costs on the product. */
export function lineCost(line: RecipeLine): number {
  const perUnit = isSubRecipeLine(line) ? line.subRecipeCostPerUnit : line.costPerUnit;
  if (typeof perUnit === 'number' && Number.isFinite(perUnit)) {
    return r2(perUnit * (Number(line.quantityPerUnit) || 0));
  }
  // No per-unit cost available: fall back to the server's own figure rather
  // than showing zero.
  return r2(Number(line.lineCost) || 0);
}

export const recipeTotal = (lines: RecipeLine[]): number =>
  r2(lines.reduce((sum, line) => sum + lineCost(line), 0));

/** The till warns when a product's ingredients cost more than it sells for.
 * No selling price means no verdict, not a warning. */
export const isOverpriced = (total: number, sellingPrice?: number | null): boolean =>
  typeof sellingPrice === 'number' && sellingPrice > 0 && total > sellingPrice;

/**
 * The ingredients still free to add: active ones not already on another line.
 * A line being edited is excluded from that check so its own ingredient does
 * not disappear from the list under the user.
 */
export function availableIngredients(
  ingredients: Ingredient[],
  lines: RecipeLine[],
  excludeLineId?: string
): Ingredient[] {
  const taken = new Set(
    lines
      .filter((line) => line.id !== excludeLineId)
      .map((line) => line.ingredientId)
      .filter((id): id is string => Boolean(id))
  );
  return ingredients.filter((ingredient) => ingredient.active && !taken.has(ingredient.id));
}

/** Sub-recipes offered in the picker: only the active ones are usable. */
export const activeSubRecipes = <T extends { active: boolean }>(subRecipes: T[]): T[] =>
  subRecipes.filter((sub) => sub.active);
