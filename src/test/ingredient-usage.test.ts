// "منتجات" in the inventory screen means products whose recipe consumes the
// ingredient (directly or through a sub-recipe). Addons and modifier choices
// are optional, so they are counted separately — a single topping available on
// every addon-carrying product must not read as "linked to 48 products".
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-usage-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tmpDir, getName: () => 'fastfood-cashier' },
}))

const { seedDatabase } = await import('../db/seed')
const { getSqlite, closeSqlite } = await import('../db/client')
const { runMigrations } = await import('../db/migrate')
const inventory = await import('../backend/inventory')

let sqlite: any

/** Independent walk of each product's recipe + addons + modifier groups. */
function referenceUsage() {
  const base = new Map<string, Set<string>>()
  const optional = new Map<string, Set<string>>()
  const add = (map: Map<string, Set<string>>, ingredientId: string, productId: string) => {
    if (!map.has(ingredientId)) map.set(ingredientId, new Set())
    map.get(ingredientId)!.add(productId)
  }
  const expandRecipeRows = (rows: any[], kind: 'base' | 'optional', productId: string) => {
    for (const row of rows) {
      if (row.ingredient_id) add(kind === 'base' ? base : optional, row.ingredient_id, productId)
      if (row.sub_recipe_id) {
        const parts = sqlite.prepare('SELECT ingredient_id FROM sub_recipe_ingredients WHERE sub_recipe_id = ?').all(row.sub_recipe_id) as any[]
        for (const part of parts) add(kind === 'base' ? base : optional, part.ingredient_id, productId)
      }
    }
  }

  for (const product of sqlite.prepare('SELECT id FROM products').all() as any[]) {
    expandRecipeRows(
      sqlite.prepare('SELECT ingredient_id, sub_recipe_id FROM recipes WHERE product_id = ?').all(product.id),
      'base',
      product.id,
    )
    for (const link of sqlite.prepare('SELECT addon_id FROM product_addons WHERE product_id = ?').all(product.id) as any[]) {
      expandRecipeRows(
        sqlite.prepare('SELECT ingredient_id, sub_recipe_id FROM addon_recipes WHERE addon_id = ?').all(link.addon_id),
        'optional',
        product.id,
      )
    }
    for (const link of sqlite.prepare('SELECT modifier_group_id FROM product_modifier_groups WHERE product_id = ?').all(product.id) as any[]) {
      for (const modifier of sqlite.prepare('SELECT id FROM modifiers WHERE modifier_group_id = ?').all(link.modifier_group_id) as any[]) {
        expandRecipeRows(
          sqlite.prepare('SELECT ingredient_id, sub_recipe_id FROM modifier_recipes WHERE modifier_id = ?').all(modifier.id),
          'optional',
          product.id,
        )
      }
    }
  }
  return { base, optional }
}

beforeAll(async () => {
  sqlite = getSqlite()
  runMigrations()
  await seedDatabase()
})

afterAll(() => {
  closeSqlite()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('ingredient product usage', () => {
  it('separates recipe links from optional addon/modifier reach', () => {
    const { base, optional } = referenceUsage()
    const listed = inventory.listIngredients({ includeInactive: true }) as any[]

    for (const ingredient of listed) {
      const baseIds = base.get(ingredient.id) ?? new Set<string>()
      const optionalOnly = [...(optional.get(ingredient.id) ?? [])].filter((id) => !baseIds.has(id))
      expect(ingredient.recipeProductCount).toBe(baseIds.size)
      expect(ingredient.optionalProductCount).toBe(optionalOnly.length)
      expect(ingredient.productCount).toBe(baseIds.size + optionalOnly.length)
    }

    // A pure addon topping: offered on every addon-carrying product, but in no
    // product's own recipe.
    const fajita = listed.find((i) => i.id === 'ing-fajita')
    expect(fajita.recipeProductCount).toBe(0)
    expect(fajita.optionalProductCount).toBeGreaterThan(0)
    expect(fajita.productCount).toBe(fajita.optionalProductCount)
  })

  it('labels each linked product as recipe or optional', () => {
    const listed = inventory.listIngredients({ includeInactive: true }) as any[]
    const { base } = referenceUsage()

    for (const ingredient of listed) {
      const rows = inventory.listIngredientProducts(ingredient.id)
      expect(rows).toHaveLength(ingredient.productCount)
      const baseIds = base.get(ingredient.id) ?? new Set<string>()
      for (const row of rows) {
        expect(row.inBase).toBe(baseIds.has(row.id))
      }
    }
  })
})
