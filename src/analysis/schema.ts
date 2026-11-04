import type Database from 'better-sqlite3'

export interface ColumnInfo {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
}

export interface ForeignKeyInfo {
  from: string
  table: string
  to: string
}

export interface TableInfo {
  name: string
  rowCount: number
  columns: ColumnInfo[]
  foreignKeys: ForeignKeyInfo[]
}

export interface SchemaOptions {
  /** Exact row counts are cheap on the POS snapshot. */
  includeCounts?: boolean
  /** Internal/assistant tables that are noise for the analyst. */
  exclude?: RegExp
}

interface TableRow {
  name: string
}

interface ColumnRow {
  name: string
  type: string
  is_not_null: number
  pk: number
}

interface ForeignKeyRow {
  from_col: string
  target_table: string
  target_col: string
}

export function describeSchema(
  database: Database.Database,
  options: SchemaOptions = {},
): TableInfo[] {
  const { includeCounts = true, exclude } = options
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as TableRow[]

  return tables
    .filter((table) => !exclude || !exclude.test(table.name))
    .map((table) => {
      const columns = database
        .prepare('SELECT name, type, "notnull" AS is_not_null, pk FROM pragma_table_info(?)')
        .all(table.name) as ColumnRow[]

      const foreignKeys = database
        .prepare('SELECT "from" AS from_col, "table" AS target_table, "to" AS target_col FROM pragma_foreign_key_list(?)')
        .all(table.name) as ForeignKeyRow[]

      let rowCount = 0
      if (includeCounts) {
        try {
          const quoted = `"${table.name.replace(/"/g, '""')}"`
          rowCount = Number(
            (database.prepare(`SELECT COUNT(*) AS n FROM ${quoted}`).get() as { n: number } | undefined)?.n ?? 0,
          )
        } catch {
          rowCount = 0
        }
      }

      return {
        name: table.name,
        rowCount,
        columns: columns.map((column) => ({
          name: column.name,
          type: column.type,
          notNull: Boolean(column.is_not_null),
          primaryKey: Boolean(column.pk),
        })),
        foreignKeys: foreignKeys.map((foreignKey) => ({
          from: foreignKey.from_col,
          table: foreignKey.target_table,
          to: foreignKey.target_col,
        })),
      }
    })
}
