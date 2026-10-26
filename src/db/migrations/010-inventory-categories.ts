import type { Migration } from './types'
import { categoryForIngredient, storageForIngredient } from '../../lib/inventory-taxonomy'

// Adds the inventory taxonomy without touching any existing stock or recipes.
// Existing rows are assigned from the shared ID map; unknown items fall back to
// «مشروبات وأخرى» / «رف جاف» and can be changed from the inventory form.
export const migration: Migration = {
  id: '010-inventory-categories',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(ingredients)').all() as { name: string }[]
    if (!columns.some((c) => c.name === 'category')) {
      db.exec("ALTER TABLE ingredients ADD COLUMN category TEXT NOT NULL DEFAULT 'other'")
    }
    if (!columns.some((c) => c.name === 'storage')) {
      db.exec("ALTER TABLE ingredients ADD COLUMN storage TEXT NOT NULL DEFAULT 'dry'")
    }

    const rows = db.prepare('SELECT id FROM ingredients').all() as { id: string }[]
    const update = db.prepare('UPDATE ingredients SET category = ?, storage = ? WHERE id = ?')
    for (const row of rows) {
      update.run(categoryForIngredient(row.id), storageForIngredient(row.id), row.id)
    }
  },
}
