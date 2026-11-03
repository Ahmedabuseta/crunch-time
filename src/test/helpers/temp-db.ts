import Database from 'better-sqlite3'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export async function tempDir(prefix = 'analysis-test-'): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix))
}

export function seedOrders(database: Database.Database, count = 3): void {
  database.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  const insert = database.prepare('INSERT INTO orders (status, total, created_at) VALUES (?, ?, ?)')
  for (let index = 1; index <= count; index += 1) {
    insert.run(index === 2 ? 'CANCELLED' : 'COMPLETED', index * 10.5, `2026-11-0${index}T10:00:00Z`)
  }
}
