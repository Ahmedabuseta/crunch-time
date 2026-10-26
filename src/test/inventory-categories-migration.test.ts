import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migration } from '../db/migrations/010-inventory-categories'

describe('010-inventory-categories migration', () => {
  it('adds and backfills category/storage on an existing ingredients table', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE ingredients (id TEXT PRIMARY KEY, name TEXT NOT NULL)')
    db.prepare('INSERT INTO ingredients (id, name) VALUES (?, ?)').run('ing-mozzarella', 'موزاريلا')
    db.prepare('INSERT INTO ingredients (id, name) VALUES (?, ?)').run('ing-tatj', 'تاتج')
    db.prepare('INSERT INTO ingredients (id, name) VALUES (?, ?)').run('unknown-item', 'مادة قديمة')

    migration.up(db)

    const columns = db.prepare('PRAGMA table_info(ingredients)').all() as { name: string }[]
    expect(columns.map(c => c.name)).toEqual(expect.arrayContaining(['category', 'storage']))
    expect(db.prepare('SELECT category, storage FROM ingredients WHERE id = ?').get('ing-mozzarella'))
      .toEqual({ category: 'dairy', storage: 'fridge' })
    expect(db.prepare('SELECT category, storage FROM ingredients WHERE id = ?').get('ing-tatj'))
      .toEqual({ category: 'other', storage: 'dry' })
    expect(db.prepare('SELECT category, storage FROM ingredients WHERE id = ?').get('unknown-item'))
      .toEqual({ category: 'other', storage: 'dry' })

    // Re-running is safe (idempotent columns + repeatable backfill).
    expect(() => migration.up(db)).not.toThrow()
    db.close()
  })
})
