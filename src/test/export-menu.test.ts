// One-off dev helper: export the live menu as JSON.
// Pulls data through the same drizzle queries the IPC handlers run
// (src/ipc/main.ts → 'category:list' and 'product:list'), so the
// file always reflects what the app actually serves.
//
// Run with:  EXPORT_MENU=1 npx vitest run src/test/export-menu.test.ts
//
// Skips silently during the normal suite (npm test) unless
// EXPORT_MENU=1 is set, so CI never writes files.
import { describe, it, vi } from 'vitest'
import { writeFileSync } from 'fs'

// client.ts asks Electron for the userData path. Point it at the
// real dev folder so we read the live database.
vi.mock('electron', () => ({
  app: {
    getPath: () => `${process.env.HOME}/.config/fastfood-cashier`,
    getName: () => 'fastfood-cashier',
  },
}))

const { getDb } = await import('../db/client')
const { categories, products } = await import('../db/schema')

describe('export menu.json', () => {
  it('writes the live menu through the IPC list queries', () => {
    if (!process.env.EXPORT_MENU) {
      console.log('skipped — set EXPORT_MENU=1 to write menu.json')
      return
    }
    const db = getDb()

    // Every row plus its `active` flag — the web menu decides what to show
    // from the flag rather than from price or a hardcoded list.
    const deps = db.select().from(categories)
      .orderBy(categories.sortOrder, categories.name)
      .all()

    const allProducts = db.select().from(products).all()

    const menu = deps.map(dep => ({
      id: dep.id,
      name: dep.name,
      emoji: dep.emoji,
      color: dep.color,
      sortOrder: dep.sortOrder,
      active: dep.active,
      products: allProducts
        .filter(p => p.categoryId === dep.id)
        .map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          costPrice: p.costPrice,
          emoji: p.emoji,
          active: p.active,
        })),
    }))

    const out = {
      generatedAt: new Date().toISOString(),
      restaurant: 'Crunch Time',
      currency: 'EGP',
      menu,
    }

    writeFileSync('menu.json', `${JSON.stringify(out, null, 2)}\n`, 'utf-8')
    console.log(`wrote menu.json — ${deps.length} departments, ${allProducts.length} products`)
    for (const dep of menu) {
      console.log(`  ${dep.name}: ${dep.products.length} products`)
    }
  })
})