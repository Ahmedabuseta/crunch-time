// The aliases the owner teaches, and the names the assistant failed on.
//
// Everything here is raw SQL against the two tables from migration 012. Both
// reads and writes are defensively wrapped: `resolve.ts` is used by the phone,
// the HTTP server and the reports path, and a database that predates the
// migration (unit tests build their own schema) must keep resolving names
// exactly as it did instead of throwing "no such table".
import { randomUUID } from 'node:crypto'
import { getSqlite } from '../../db/client'
import { normalizeArabic } from '../guard/arabic'
import { withoutArticle } from './fuzzy'

/** The catalogue tables an alias can point at. */
export type AliasEntity = 'product' | 'ingredient'

export const ALIAS_ENTITIES: AliasEntity[] = ['product', 'ingredient']

const TABLES: Record<AliasEntity, 'products' | 'ingredients'> = {
  product: 'products',
  ingredient: 'ingredients',
}

const ENTITY_LABEL: Record<AliasEntity, string> = {
  product: 'صنف',
  ingredient: 'مادة',
}

export function entityLabel(entity: AliasEntity): string {
  return ENTITY_LABEL[entity] ?? 'اسم'
}

export function isAliasEntity(value: unknown): value is AliasEntity {
  return value === 'product' || value === 'ingredient'
}

export interface AliasRow {
  id: string
  entity: AliasEntity
  /** The alias as the owner typed it; lookup normalises it on read. */
  alias: string
  targetId: string
  /** The catalogue row's current name, or null if it has been deleted. */
  targetName: string | null
  targetActive: boolean | null
  createdAt: string
}

export interface UnresolvedRow {
  id: string
  entity: AliasEntity
  query: string
  candidates: string[]
  resolved: boolean
  createdAt: string
}

export interface SetAliasResult {
  ok: boolean
  error?: string
  id?: string
  targetName?: string
}

/**
 * The lookup key for an alias: the same normalisation every other comparison
 * uses, plus the definite article off each word so «السجق» and «سجق» are one
 * alias rather than two.
 */
export function normalizeAlias(value: string): string {
  return withoutArticle(normalizeArabic(String(value ?? '')))
}

function clampLimit(limit: number | undefined, fallback = 50): number {
  const value = Math.trunc(Number(limit) || fallback)
  return Math.min(Math.max(value, 1), 200)
}

function parseCandidates(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 5) : []
  } catch {
    return []
  }
}

/** Target id for an alias after the same Arabic normalisation used everywhere. */
export function getAliasTarget(entity: AliasEntity, query: string): string | null {
  if (!isAliasEntity(entity)) return null
  const key = normalizeAlias(query)
  if (!key) return null
  try {
    const rows = getSqlite()
      .prepare('SELECT alias, target_id FROM ai_aliases WHERE entity = ?')
      .all(entity) as { alias: string; target_id: string }[]
    const row = rows.find((entry) => normalizeAlias(entry.alias) === key)
    return row?.target_id ? String(row.target_id) : null
  } catch {
    // Migration 012 has not run on this database; behave as if no alias exists.
    return null
  }
}

/**
 * Stores (or re-points) one alias. The target has to be a real row id in the
 * entity's table — an alias to a deleted product is a trap, not a shortcut.
 */
export function setAlias(entity: AliasEntity, alias: string, targetId: string): SetAliasResult {
  if (!isAliasEntity(entity)) return { ok: false, error: 'نوع الاسم البديل غير معروف' }
  const key = normalizeAlias(alias)
  if (!key) return { ok: false, error: 'اكتب الاسم البديل الأول' }
  const stored = String(alias ?? '').trim()
  const id = String(targetId ?? '').trim()
  if (!id) return { ok: false, error: `حدد ${ENTITY_LABEL[entity]} اللي الاسم يروح له` }

  try {
    const sqlite = getSqlite()
    const target = sqlite
      .prepare(`SELECT id, name FROM ${TABLES[entity]} WHERE id = ?`)
      .get(id) as { id: string; name: string } | undefined
    if (!target) return { ok: false, error: `مفيش ${ENTITY_LABEL[entity]} بالمعرّف «${id}»` }

    sqlite
      .prepare(`
        INSERT INTO ai_aliases (id, entity, alias, target_id, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(entity, alias) DO UPDATE SET target_id = excluded.target_id
      `)
      .run(randomUUID(), entity, stored, String(target.id), new Date().toISOString())

    return { ok: true, targetName: String(target.name) }
  } catch {
    return { ok: false, error: 'تعذّر حفظ الاسم البديل — جرّب تاني' }
  }
}

/** Newest first. `entity` narrows to products or ingredients. */
export function listAliases(entity?: AliasEntity, limit = 50): AliasRow[] {
  const safeLimit = clampLimit(limit)
  try {
    const sqlite = getSqlite()
    const rows = (entity
      ? sqlite.prepare('SELECT * FROM ai_aliases WHERE entity = ? ORDER BY created_at DESC LIMIT ?').all(entity, safeLimit)
      : sqlite.prepare('SELECT * FROM ai_aliases ORDER BY created_at DESC LIMIT ?').all(safeLimit)) as any[]
    const names = new Map<string, { name: string; active: boolean }>()
    for (const nameEntity of entity ? [entity] : ALIAS_ENTITIES) {
      const targets = sqlite.prepare(`SELECT id, name, active FROM ${TABLES[nameEntity]}`).all() as any[]
      for (const target of targets) {
        names.set(`${nameEntity}:${target.id}`, { name: String(target.name), active: Boolean(target.active) })
      }
    }
    return rows.map((row) => {
      const key = `${row.entity}:${row.target_id}`
      const target = names.get(key)
      return {
        id: String(row.id),
        entity: row.entity as AliasEntity,
        alias: String(row.alias),
        targetId: String(row.target_id),
        targetName: target?.name ?? null,
        targetActive: target ? target.active : null,
        createdAt: String(row.created_at),
      }
    })
  } catch {
    return []
  }
}

/**
 * Records a name the resolver could not place. Best effort by contract: a
 * logging failure must never turn a read tool into an error, so every problem
 * is swallowed and reported as "nothing logged".
 */
export function logUnresolved(entity: AliasEntity, query: string, candidates: string[] = []): string | null {
  if (!isAliasEntity(entity)) return null
  const raw = String(query ?? '').trim()
  if (!raw) return null
  try {
    const id = randomUUID()
    getSqlite()
      .prepare(`
        INSERT INTO ai_unresolved (id, entity, query, candidates, created_at, resolved)
        VALUES (?, ?, ?, ?, ?, 0)
      `)
      .run(id, entity, raw, JSON.stringify(candidates.slice(0, 5).map(String)), new Date().toISOString())
    return id
  } catch {
    return null
  }
}

/** Newest first. `entity` narrows to products or ingredients. */
export function listUnresolved(entity?: AliasEntity, limit = 50): UnresolvedRow[] {
  const safeLimit = clampLimit(limit)
  try {
    const sqlite = getSqlite()
    const rows = (entity
      ? sqlite.prepare('SELECT * FROM ai_unresolved WHERE entity = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(entity, safeLimit)
      : sqlite.prepare('SELECT * FROM ai_unresolved ORDER BY created_at DESC, rowid DESC LIMIT ?').all(safeLimit)) as any[]
    return rows.map((row) => ({
      id: String(row.id),
      entity: row.entity as AliasEntity,
      query: String(row.query),
      candidates: parseCandidates(row.candidates),
      resolved: Boolean(row.resolved),
      createdAt: String(row.created_at),
    }))
  } catch {
    return []
  }
}

/** Marks one logged query as handled. Returns false when the id is unknown. */
export function markUnresolvedResolved(id: string): boolean {
  const key = String(id ?? '').trim()
  if (!key) return false
  try {
    const result = getSqlite().prepare('UPDATE ai_unresolved SET resolved = 1 WHERE id = ?').run(key)
    return result.changes > 0
  } catch {
    return false
  }
}
