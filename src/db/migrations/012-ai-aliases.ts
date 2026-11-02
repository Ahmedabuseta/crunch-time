import type { Migration } from './types'

// Aliases the owner teaches the assistant, and the catalogue names it failed
// to understand.
//
// Both tables are new: no existing row is touched, and a database that never
// uses the assistant simply carries two empty tables. `alias` keeps the wording
// the owner typed; lookups normalise it (diacritics and leading «ال») so
// «السجق» and «سجق» compare as one alias.
export const migration: Migration = {
  id: '012-ai-aliases',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_aliases (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        alias TEXT NOT NULL,
        target_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (entity, alias)
      );

      CREATE TABLE IF NOT EXISTS ai_unresolved (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        query TEXT NOT NULL,
        candidates TEXT,
        created_at TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS ai_unresolved_created ON ai_unresolved(created_at);
    `)
  },
}
