import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { runReadOnlyQuery } from '../analysis/runner'
import { seedOrders } from './helpers/temp-db'

let database: Database.Database | null = null

function open(): Database.Database {
  database = new Database(':memory:')
  seedOrders(database)
  return database
}

afterEach(() => {
  database?.close()
  database = null
})

describe('analysis query runner', () => {
  it('returns column names and row values', () => {
    const result = runReadOnlyQuery(open(), 'SELECT id, status FROM orders ORDER BY id', 100)

    expect(result.columns).toEqual(['id', 'status'])
    expect(result.rows).toEqual([
      [1, 'COMPLETED'],
      [2, 'CANCELLED'],
      [3, 'COMPLETED'],
    ])
    expect(result.rowCount).toBe(3)
    expect(result.truncated).toBe(false)
  })

  it('caps the rows and reports truncation', () => {
    const result = runReadOnlyQuery(open(), 'SELECT * FROM orders ORDER BY id', 2)

    expect(result.rowCount).toBe(2)
    expect(result.truncated).toBe(true)
    expect(result.rows).toHaveLength(2)
  })

  it('refuses writes before touching the database', () => {
    const db = open()
    expect(() => runReadOnlyQuery(db, 'DELETE FROM orders', 100)).toThrow(/ممنوع/)
    expect(db.prepare('SELECT COUNT(*) AS n FROM orders').get()).toEqual({ n: 3 })
  })

  it('truncates very long strings', () => {
    const db = open()
    const result = runReadOnlyQuery(db, 'SELECT hex(zeroblob(1500)) AS blob', 10)
    expect(String(result.rows[0][0]).length).toBe(2001)
  })

  it('masks secret and phone columns before they reach a model', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE users (id TEXT, pin_hash TEXT, customer_phone TEXT)')
    db.prepare('INSERT INTO users VALUES (?, ?, ?)').run('u1', '$argon2id$secret', '01012345678')

    const result = runReadOnlyQuery(db, 'SELECT * FROM users', 10)
    expect(result.rows[0]).toEqual(['u1', '••••', '••••5678'])
    db.close()
  })

  it('handles a query with no rows', () => {
    const result = runReadOnlyQuery(open(), 'SELECT * FROM orders WHERE id < 0', 10)
    expect(result.rows).toEqual([])
    expect(result.rowCount).toBe(0)
    expect(result.columns).toEqual(['id', 'status', 'total', 'created_at'])
  })
})
