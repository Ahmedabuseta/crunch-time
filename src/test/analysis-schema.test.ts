import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { describeSchema } from '../analysis/schema'

describe('analysis schema introspection', () => {
  it('includes row counts, columns and foreign keys', () => {
    const database = new Database(':memory:')
    database.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE orders (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), total REAL NOT NULL);
      INSERT INTO users VALUES ('u1', 'A');
      INSERT INTO orders VALUES ('o1', 'u1', 10), ('o2', 'u1', 20);
    `)

    const tables = describeSchema(database)
    const orders = tables.find((table) => table.name === 'orders')

    expect(orders?.rowCount).toBe(2)
    expect(orders?.columns.find((column) => column.name === 'id')?.primaryKey).toBe(true)
    expect(orders?.foreignKeys).toEqual([{ from: 'user_id', table: 'users', to: 'id' }])
    database.close()
  })

  it('can exclude internal tables', () => {
    const database = new Database(':memory:')
    database.exec(`
      CREATE TABLE orders (id TEXT PRIMARY KEY);
      CREATE TABLE ai_messages (id TEXT PRIMARY KEY);
      CREATE TABLE idempotency_keys (key TEXT PRIMARY KEY);
    `)

    const names = describeSchema(database, { exclude: /^(ai_|idempotency_keys$)/ })
      .map((table) => table.name)

    expect(names).toEqual(['orders'])
    database.close()
  })
})
