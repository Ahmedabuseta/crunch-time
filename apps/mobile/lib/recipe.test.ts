import { describe, expect, it } from 'vitest';
import type { Ingredient, RecipeLine } from '@/api/types';
import {
  activeSubRecipes,
  availableIngredients,
  isOverpriced,
  isSubRecipeLine,
  lineCost,
  lineName,
  lineUnit,
  recipeTotal,
} from './recipe';

const ingredientLine = (over: Partial<RecipeLine> = {}): RecipeLine => ({
  id: 'r1',
  ingredientId: 'i1',
  subRecipeId: null,
  quantityPerUnit: 1,
  ingredientName: 'جبنة',
  subRecipeName: null,
  unit: 'كجم',
  subRecipeUnit: null,
  costPerUnit: 100,
  subRecipeCostPerUnit: null,
  lineCost: 100,
  ...over,
});

const subLine = (over: Partial<RecipeLine> = {}): RecipeLine => ({
  id: 'r2',
  ingredientId: null,
  subRecipeId: 's1',
  quantityPerUnit: 0.5,
  ingredientName: null,
  subRecipeName: 'صوص',
  unit: null,
  subRecipeUnit: 'لتر',
  costPerUnit: null,
  subRecipeCostPerUnit: 40,
  lineCost: 20,
  ...over,
});

const ingredient = (over: Partial<Ingredient> = {}): Ingredient => ({
  id: 'i1',
  name: 'جبنة',
  unit: 'كجم',
  stockQuantity: 10,
  minStock: 2,
  costPerUnit: 100,
  purchaseQty: 1,
  active: true,
  supplier: null,
  secondarySupplier: null,
  supplierRatio: 1,
  plannedCost: 0,
  ...over,
});

describe('telling the two kinds of line apart', () => {
  it('reads a line as a sub-recipe only when it has one', () => {
    expect(isSubRecipeLine(subLine())).toBe(true);
    expect(isSubRecipeLine(ingredientLine())).toBe(false);
  });

  it('names and units the line from whichever kind it is', () => {
    expect(lineName(ingredientLine())).toBe('جبنة');
    expect(lineUnit(ingredientLine())).toBe('كجم');
    expect(lineName(subLine())).toBe('صوص');
    expect(lineUnit(subLine())).toBe('لتر');
  });

  it('does not print a null name', () => {
    expect(lineName(ingredientLine({ ingredientName: null }))).toBe('—');
  });
});

describe('lineCost', () => {
  it('multiplies the per-unit cost by the quantity', () => {
    expect(lineCost(ingredientLine({ costPerUnit: 100, quantityPerUnit: 0.25 }))).toBe(25);
    expect(lineCost(subLine({ subRecipeCostPerUnit: 40, quantityPerUnit: 0.5 }))).toBe(20);
  });

  it('recomputes rather than trusting the stored lineCost, so an unsaved quantity shows through', () => {
    // The server still says 100, but the user has just typed 2.
    expect(lineCost(ingredientLine({ lineCost: 100, costPerUnit: 100, quantityPerUnit: 2 }))).toBe(200);
  });

  it('falls back to the stored figure when there is no per-unit cost', () => {
    expect(lineCost(ingredientLine({ costPerUnit: null, lineCost: 33.5 }))).toBe(33.5);
  });

  it('is zero for a zero or missing quantity rather than NaN', () => {
    expect(lineCost(ingredientLine({ quantityPerUnit: 0 }))).toBe(0);
    expect(lineCost(ingredientLine({ quantityPerUnit: NaN as unknown as number }))).toBe(0);
  });

  it('does not leak float noise into money', () => {
    expect(lineCost(ingredientLine({ costPerUnit: 0.1, quantityPerUnit: 3 }))).toBe(0.3);
  });
});

describe('recipeTotal', () => {
  it('adds every line, ingredient and sub-recipe alike', () => {
    expect(recipeTotal([ingredientLine(), subLine()])).toBe(120);
  });

  it('is zero for an empty recipe', () => {
    expect(recipeTotal([])).toBe(0);
  });

  it('stays exact across many awkward lines', () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      ingredientLine({ id: `r${i}`, costPerUnit: 0.1, quantityPerUnit: 3 })
    );
    expect(recipeTotal(lines)).toBe(3);
  });
});

describe('isOverpriced', () => {
  it('warns only when the recipe costs more than the product sells for', () => {
    expect(isOverpriced(120, 100)).toBe(true);
    expect(isOverpriced(80, 100)).toBe(false);
    expect(isOverpriced(100, 100)).toBe(false);
  });

  it('says nothing without a selling price', () => {
    expect(isOverpriced(500, undefined)).toBe(false);
    expect(isOverpriced(500, null)).toBe(false);
    expect(isOverpriced(500, 0)).toBe(false);
  });
});

describe('pickers', () => {
  it('hides ingredients already used on another line', () => {
    const lines = [ingredientLine({ id: 'r1', ingredientId: 'i1' })];
    const options = availableIngredients(
      [ingredient({ id: 'i1' }), ingredient({ id: 'i2', name: 'لحم' })],
      lines
    );
    expect(options.map((i) => i.id)).toEqual(['i2']);
  });

  it('keeps the ingredient of the line being edited, so it does not vanish', () => {
    const lines = [ingredientLine({ id: 'r1', ingredientId: 'i1' })];
    const options = availableIngredients([ingredient({ id: 'i1' })], lines, 'r1');
    expect(options.map((i) => i.id)).toEqual(['i1']);
  });

  it('offers a sub-recipe line’s ingredient back, since sub-recipes do not consume it', () => {
    const lines = [subLine({ id: 'r2' })];
    const options = availableIngredients([ingredient({ id: 'i1' })], lines);
    expect(options.map((i) => i.id)).toEqual(['i1']);
  });

  it('leaves out retired ingredients', () => {
    const options = availableIngredients(
      [ingredient({ id: 'i1', active: false }), ingredient({ id: 'i2' })],
      []
    );
    expect(options.map((i) => i.id)).toEqual(['i2']);
  });

  it('only offers active sub-recipes', () => {
    expect(
      activeSubRecipes([
        { id: 's1', active: true },
        { id: 's2', active: false },
      ])
    ).toEqual([{ id: 's1', active: true }]);
  });
});
