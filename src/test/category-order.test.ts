import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from './setup'
import { categories } from '../db/schema'
import { eq, sql } from 'drizzle-orm'

describe('Category Ordering', () => {
  let testDb: ReturnType<typeof createTestDb>

  beforeEach(() => {
    testDb = createTestDb()
    const { db } = testDb

    // Seed 9 categories matching the user's catalog
    const cats = [
      { id: 'drinks', name: 'المشروبات', emoji: '🥤', color: '#06d6a0', sortOrder: 1 },
      { id: 'meat_crepe', name: 'كريب لحوم', emoji: '🌯', color: '#ff6b35', sortOrder: 2 },
      { id: 'breakfast', name: 'فطار', emoji: '🍳', color: '#ffd166', sortOrder: 3 },
      { id: 'buckets', name: 'الباكت', emoji: '🍟', color: '#f78c6c', sortOrder: 4 },
      { id: 'chicken_crepe', name: 'كريب فراخ', emoji: '🍗', color: '#ffbe0b', sortOrder: 5 },
      { id: 'syrian', name: 'السوري', emoji: '🥙', color: '#8338ec', sortOrder: 6 },
      { id: 'mixes', name: 'الميكسات', emoji: '🍽️', color: '#3a86ff', sortOrder: 7 },
      { id: 'sweets', name: 'Sweets', emoji: '🍰', color: '#ff006e', sortOrder: 8 },
      { id: 'treat', name: 'Treat', emoji: '🍫', color: '#fb5607', sortOrder: 9 },
    ]

    for (const c of cats) {
      db.insert(categories).values({ ...c, active: true }).run()
    }
  })

  it('should list categories in ascending sortOrder', () => {
    const { db } = testDb
    const list = db.select().from(categories).where(eq(categories.active, true)).orderBy(categories.sortOrder, categories.name).all()

    expect(list).toHaveLength(9)
    expect(list[0].id).toBe('drinks')
    expect(list[0].sortOrder).toBe(1)
    expect(list[1].id).toBe('meat_crepe')
    expect(list[1].sortOrder).toBe(2)
    expect(list[8].id).toBe('treat')
    expect(list[8].sortOrder).toBe(9)
  })

  it('should reorder categories when an array of IDs is supplied', () => {
    const { sqlite, db } = testDb

    // Move 'treat' to first, 'sweets' to second, and 'drinks' to third
    const newOrder = [
      'treat',
      'sweets',
      'drinks',
      'meat_crepe',
      'breakfast',
      'buckets',
      'chicken_crepe',
      'syrian',
      'mixes',
    ]

    const updateOrder = sqlite.prepare('UPDATE categories SET sort_order = ? WHERE id = ?')
    sqlite.transaction(() => {
      newOrder.forEach((id, i) => {
        updateOrder.run(i + 1, id)
      })
    })()

    const list = db.select().from(categories).where(eq(categories.active, true)).orderBy(categories.sortOrder, categories.name).all()

    expect(list[0].id).toBe('treat')
    expect(list[0].sortOrder).toBe(1)
    expect(list[1].id).toBe('sweets')
    expect(list[1].sortOrder).toBe(2)
    expect(list[2].id).toBe('drinks')
    expect(list[2].sortOrder).toBe(3)
    expect(list[8].id).toBe('mixes')
    expect(list[8].sortOrder).toBe(9)
  })

  it('should automatically assign sortOrder = max + 1 when adding a new category without sortOrder', () => {
    const { db } = testDb

    const maxOrderRow = db.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(categories).get()
    const maxOrder = maxOrderRow?.max ?? 0
    expect(maxOrder).toBe(9)

    const nextOrder = maxOrder + 1
    db.insert(categories).values({
      id: 'cat-sauces',
      name: 'صوصات',
      emoji: '🥫',
      color: '#ff0000',
      sortOrder: nextOrder,
      active: true,
    }).run()

    const list = db.select().from(categories).where(eq(categories.active, true)).orderBy(categories.sortOrder, categories.name).all()

    expect(list).toHaveLength(10)
    expect(list[9].id).toBe('cat-sauces')
    expect(list[9].sortOrder).toBe(10)
  })
})
