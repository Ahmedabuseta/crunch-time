import { describe, expect, it } from 'vitest'
import { SqlGuardError, guardSql, stripLiteralsAndComments, wrapForLimit } from '../analysis/guard'

describe('analysis SQL guard', () => {
  it('accepts SELECT, WITH and VALUES', () => {
    expect(guardSql('SELECT * FROM orders')).toBe('SELECT * FROM orders')
    expect(guardSql('WITH x AS (SELECT 1) SELECT * FROM x')).toContain('WITH x')
    expect(guardSql('VALUES (1), (2)')).toContain('VALUES')
  })

  it('accepts a single trailing semicolon', () => {
    expect(guardSql('SELECT 1;')).toBe('SELECT 1;')
    expect(guardSql('SELECT 1;  ')).toBe('SELECT 1;')
  })

  it.each([
    'DELETE FROM orders',
    'UPDATE orders SET total = 0',
    'INSERT INTO orders (total) VALUES (1)',
    'REPLACE INTO orders (id) VALUES (1)',
    'DROP TABLE orders',
    'ALTER TABLE orders ADD COLUMN x TEXT',
    'CREATE TABLE x (id INTEGER)',
    'ATTACH DATABASE "/tmp/x.db" AS x',
    'DETACH DATABASE x',
    'PRAGMA table_info(orders)',
    'VACUUM',
    'SELECT * INTO backup FROM orders',
    'select * from orders; delete from orders',
  ])('rejects %s', (sql) => {
    expect(() => guardSql(sql)).toThrow(SqlGuardError)
  })

  it('rejects an empty statement', () => {
    expect(() => guardSql('   ')).toThrow(SqlGuardError)
    expect(() => guardSql('-- only a comment')).toThrow(SqlGuardError)
  })

  it('ignores forbidden words inside strings, identifiers and comments', () => {
    expect(guardSql("SELECT 'delete from orders' AS note")).toBe("SELECT 'delete from orders' AS note")
    expect(guardSql('-- delete everything\nSELECT 1')).toBe('-- delete everything\nSELECT 1')
    expect(guardSql('/* update */ SELECT 1')).toBe('/* update */ SELECT 1')
    expect(guardSql('SELECT "drop" FROM orders')).toContain('SELECT "drop"')
  })

  it('strips literals and comments from the scanned text', () => {
    expect(stripLiteralsAndComments("SELECT 'a--b' -- tail\n")).not.toContain('delete')
    expect(stripLiteralsAndComments("SELECT 'it''s fine'")).not.toContain('fine')
  })

  it('wraps a query with a hard row limit', () => {
    expect(wrapForLimit('SELECT * FROM orders;', 10)).toBe('SELECT * FROM (SELECT * FROM orders) LIMIT 11')
  })
})
