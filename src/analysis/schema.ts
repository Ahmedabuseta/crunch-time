import type Database from 'better-sqlite3'

export interface ColumnInfo {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
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

export function describeSchema(database: Database.Database): TableInfo[] {
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as TableRow[]

  return tables.map(({ name }) => {
    const columns = database
      .prepare('SELECT name, type, "notnull" AS is_not_null, pk FROM pragma_table_info(?)')
      .all(name) as ColumnRow[]
    return {
      name,
      columns: columns.map((column) => ({
        name: column.name,
        type: column.type,
        notNull: Boolean(column.is_not_null),
        primaryKey: Boolean(column.pk),
      })),
    }
  })
}
