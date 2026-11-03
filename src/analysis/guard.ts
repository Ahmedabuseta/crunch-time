const READ_START = /^(select|with|values)\b/i

const FORBIDDEN = /\b(insert|update|delete|create|drop|alter|attach|detach|pragma|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|into)\b/i

const REPLACE_INTO = /\breplace\s+into\b/i

export class SqlGuardError extends Error {
  statusCode = 400
}

export function stripLiteralsAndComments(sql: string): string {
  let out = ''

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (char === '-' && next === '-') {
      while (index < sql.length && sql[index] !== '\n') index += 1
      out += ' '
      continue
    }

    if (char === '/' && next === '*') {
      index += 2
      while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) index += 1
      index += 1
      out += ' '
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      const quote = char
      out += ' '
      index += 1
      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            index += 2
            continue
          }
          break
        }
        index += 1
      }
      continue
    }

    if (char === '[') {
      out += ' '
      while (index < sql.length && sql[index] !== ']') index += 1
      continue
    }

    out += char
  }

  return out
}

export function guardSql(input: string): string {
  const sql = String(input ?? '').trim()
  if (!sql) throw new SqlGuardError('SQL فاضي')

  const bare = stripLiteralsAndComments(sql).replace(/;+\s*$/, '').trim()
  if (!bare) throw new SqlGuardError('SQL فاضي')
  if (bare.includes(';')) throw new SqlGuardError('استعلام واحد بس في المرة — شيل الـ ;')

  const forbidden = bare.match(FORBIDDEN) ?? bare.match(REPLACE_INTO)
  if (forbidden) {
    throw new SqlGuardError(`ممنوع استخدام «${forbidden[1].toUpperCase()}» — التحليل بيشتغل على نسخة للقراءة فقط`)
  }

  if (!READ_START.test(bare)) {
    throw new SqlGuardError('مسموح بـ SELECT أو WITH أو VALUES فقط على نسخة القراءة')
  }

  return sql
}

export function wrapForLimit(sql: string, maxRows: number): string {
  const trimmed = sql.trim().replace(/;+\s*$/, '')
  return `SELECT * FROM (${trimmed}) LIMIT ${Math.max(1, Math.trunc(maxRows)) + 1}`
}
