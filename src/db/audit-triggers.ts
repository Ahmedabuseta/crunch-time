// Auditing every table without touching every write function.
//
// The existing `writeAudit` calls live in six backend modules, so catalog,
// inventory, recipes, modifiers and addons changes were invisible. Hand-adding a
// call to each of the ~78 write sites would be fragile in the way that matters
// most: the one somebody forgets is the one that quietly corrupts data.
//
// These are SQLite triggers instead. A trigger sees every write however it is
// made — Drizzle, a raw statement, a migration, a future module nobody has
// written yet — so the audit cannot be bypassed by forgetting.
//
// Two real constraints shaped this:
//  • `json_object` needs literal column names, and eight tables have no `id`
//    column, so the triggers are generated per table from its own schema.
//  • A trigger cannot know who is acting. The actor is set per statement by the
//    application (`audit_actor`), and the trigger copies it in; a write outside
//    any session therefore records "system" rather than a wrong user.
import type Database from 'better-sqlite3'

/** Tables that must never be audited, and why. */
const SKIP = new Map<string, string>([
  ['audit_log', 'the log itself'],
  ['schema_migrations', 'migration bookkeeping, not business data'],
  // Created by this module, and written before every statement — auditing it
  // would recurse and record the actor bookkeeping as a business change.
  ['audit_actor', 'the actor slot the triggers read'],
  // The assistant's own transcript: every message would write a snapshot of the
  // previous one, doubling the table for data nothing restores from.
  ['ai_messages', 'assistant transcript'],
  ['ai_threads', 'assistant transcript'],
  ['ai_usage', 'a counter incremented on every model call'],
  ['ai_actions', 'already carries its own status history'],
  ['ai_replies', 'seeded templates, edited from one screen'],
  // Retry bookkeeping: written and deleted within seconds, never inspected.
  ['idempotency_keys', 'retry bookkeeping'],
])

/** Events worth recording. INSERT and UPDATE only — see `DROP_ON_DELETE`. */
const EVENTS = ['INSERT', 'UPDATE'] as const

/**
 * Deletes are not audited.
 *
 * The log would not survive them usefully: `deleteProduct` and friends are soft
 * deletes (an UPDATE), and the hard deletes are cascade cleanups where the row
 * snapshot has no reader. Recording them would roughly double the log for
 * events nobody opens.
 */
export const AUDITED_EVENTS = EVENTS

export interface AuditTriggerPlan {
  table: string
  /** The column used as the entity id — `id` when present, else the rowid. */
  idColumn: string
  /** How many columns the snapshot carries. */
  columns: number
}

function tableColumns(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]
  return rows.map((row) => row.name)
}

/** Every table that should be audited, in dependency-free order. */
export function auditedTables(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[]
  return rows.map((row) => row.name).filter((name) => !SKIP.has(name))
}

/**
 * `json_object('a', OLD.a, ...)` over every column.
 *
 * Columns are quoted so a name that collides with a keyword cannot break the
 * statement, and the whole expression is built from the table's own schema so a
 * later column is picked up without editing this module.
 */
function snapshot(prefix: 'OLD' | 'NEW', columns: string[]): string {
  const pairs = columns.map((column) => `'${column.replace(/'/g, "''")}', ${prefix}."${column}"`)
  return `json_object(${pairs.join(', ')})`
}

/** The value written into `entity_id` for one event. */
function idExpression(columns: string[], prefix: 'OLD' | 'NEW'): string {
  if (columns.includes('id')) return `${prefix}."id"`
  // Eight tables have no id: their identity is the whole row, so the rowid is
  // the only stable handle SQLite gives us.
  return `${prefix}.rowid`
}

function triggerName(event: string, table: string): string {
  return `audit_${table.replace(/[^a-z0-9_]/gi, '_')}_${event.toLowerCase()}`
}

/**
 * Creates (or refreshes) the audit triggers. Idempotent: it drops and recreates
 * each trigger, so a table that gained a column gets a snapshot that includes it
 * on the next start.
 */
export function installAuditTriggers(db: Database.Database): { tables: number; triggers: number } {
  const tables = auditedTables(db)
  let triggers = 0

  // The actor a trigger copies into the row. Set once from the desktop session
  // by `setAuditActor`; a write outside any session records NULL, which the
  // screen shows as «النظام».
  db.exec('CREATE TABLE IF NOT EXISTS audit_actor (id INTEGER PRIMARY KEY CHECK (id = 1), actor TEXT)')

  for (const table of tables) {
    const columns = tableColumns(db, table)
    if (columns.length === 0) continue

    for (const event of EVENTS) {
      const name = triggerName(event, table)
      db.exec(`DROP TRIGGER IF EXISTS "${name}"`)

      const id = idExpression(columns, event === 'INSERT' ? 'NEW' : 'OLD')
      const before = event === 'UPDATE' ? snapshot('OLD', columns) : 'NULL'
      const after = snapshot('NEW', columns)

      db.exec(`
        CREATE TRIGGER "${name}"
        AFTER ${event} ON "${table}"
        FOR EACH ROW
        WHEN (SELECT actor FROM audit_actor WHERE id = 1) IS NOT '${SUSPENDED}'
        BEGIN
          INSERT INTO audit_log (id, user_id, device_label, action, entity, entity_id, before, after, created_at)
          VALUES (
            lower(hex(randomblob(16))),
            (SELECT actor FROM audit_actor WHERE id = 1),
            NULL,
            '${event === 'INSERT' ? 'create' : 'update'}',
            '${table.split("'").join("''")}',
            CAST(${id} AS TEXT),
            ${before},
            ${after},
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          );
        END
      `)
      triggers += 1
    }
  }

  return { tables: tables.length, triggers }
}

/** The actor value the triggers skip on. Never a real user id. */
export const SUSPENDED = '__suspended__'

/** Removes every audit trigger. Used by tests that need a quiet database. */
export function removeAuditTriggers(db: Database.Database): void {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'audit\\_%' ESCAPE '\\'")
    .all() as { name: string }[]
  for (const { name } of rows) db.exec(`DROP TRIGGER IF EXISTS "${name}"`)
}

/**
 * Runs a block with auditing suspended.
 *
 * Seeding a new install writes the whole demo menu — about 2,500 rows — and
 * auditing it would fill the log with entries for data that was never anyone's
 * change, before the owner has even opened the app. Suspending is a table flag
 * rather than dropping the triggers so a crash mid-seed cannot leave the
 * database permanently unaudited.
 */
export function withoutAudit<T>(db: Database.Database, fn: () => T): T {
  suspendAudit(db)
  try {
    return fn()
  } finally {
    resumeAudit(db)
  }
}

/**
 * Suspends auditing until `resumeAudit`.
 *
 * The pair exists because the bootstrap seeds with an `await` in the middle of a
 * long async function; wrapping that in a callback would reindent six hundred
 * lines to say one thing. Startup is single-threaded, so there is nothing to
 * interleave with.
 */
export function suspendAudit(db: Database.Database): void {
  db.prepare('INSERT INTO audit_actor (id, actor) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET actor = excluded.actor')
    .run(SUSPENDED)
}

export function resumeAudit(db: Database.Database): void {
  db.prepare('INSERT INTO audit_actor (id, actor) VALUES (1, NULL) ON CONFLICT(id) DO UPDATE SET actor = NULL').run()
}
