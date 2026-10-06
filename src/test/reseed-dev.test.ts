// One-off dev helper: wipe and re-seed the live dev database in place.
// Run:  npx vitest run scripts/reseed-dev.test.ts
//
// Dev-only. It targets ~/.config/fastfood-cashier/fastfood.db, which is why it
// lives in scripts/ rather than src/test/ — it must never run in CI or on a
// real installation.
import { describe, it, vi } from 'vitest'
import type Database from 'better-sqlite3'

// seed.ts and migrate.ts reach the database through client.ts, which asks
// Electron for the userData path. Point Electron at the real dev folder so the
// normal code path runs against the real file.
vi.mock('electron', () => ({
  app: {
    getPath: () => `${process.env.HOME}/.config/fastfood-cashier`,
    getName: () => 'fastfood-cashier',
  },
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { getSqlite } = await import('../db/client')

describe('re-seed the dev database', () => {
  it('rebuilds the Crunch Time menu', async () => {
    const sqlite = getSqlite() as unknown as Database.Database
    sqlite.pragma('foreign_keys = ON')

    // Clear everything the seed owns, leaving schema intact.
    const wipe = [
      'inventory_transactions', 'purchase_price_history', 'recipes', 'addon_recipes',
      'modifier_recipes', 'sub_recipe_ingredients', 'sub_recipes', 'product_addons',
      'product_modifier_groups', 'order_items', 'payments', 'cash_movements', 'orders',
      'shifts', 'customers', 'products', 'categories', 'ingredients', 'addons', 'modifiers',
      'modifier_groups', 'discount_codes', 'station_categories', 'kitchen_stations',
      'delivery_zones', 'delivery_profiles', 'expenses', 'users', 'settings',
    ]
    sqlite.pragma('foreign_keys = OFF')
    for (const t of wipe) sqlite.exec(`DELETE FROM ${t}`)
    sqlite.pragma('foreign_keys = ON')

    runMigrations()
    await seedDatabase()

    const c = (t: string) => (sqlite.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c
    console.log('categories :', c('categories'))
    console.log('products   :', c('products'))
    console.log('ingredients:', c('ingredients'))
    console.log('recipes    :', c('recipes'))
    console.log('orders     :', c('orders'))
    console.log('users      :', c('users'))

    // Show the menu so the reset is verifiable at a glance.
    console.log('\nMenu:')
    for (const row of sqlite.prepare(`
      SELECT c.name AS cat, COUNT(p.id) AS n
      FROM categories c LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id ORDER BY c.sort_order
    `).all() as any[]) {
      console.log(`  ${row.cat}: ${row.n}`)
    }
    console.log('\nStock sample:')
    for (const row of sqlite.prepare(
      'SELECT name, unit, stock_quantity AS qty FROM ingredients ORDER BY name LIMIT 6',
    ).all() as any[]) {
      console.log(`  ${row.name} — ${row.qty} ${row.unit}`)
    }
  })
})