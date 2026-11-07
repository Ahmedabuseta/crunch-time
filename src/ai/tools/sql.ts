import { z } from 'zod'
import { previewRows } from '../../analysis/runner'
import * as analysis from '../../backend/analysis'
import { tableCard } from '../cards'
import { asOwnerAsync } from '../privileges'
import type { ChatCard, ToolOutput } from '../schemas'
import { tableDigest, tableList } from './schema-digest'
import { toolOutput, type ToolDef } from './types'

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export const SQL_TOOLS: ToolDef[] = [
  {
    name: 'query_database',
    description:
      'تحليل بيانات مفتوح: اكتب استعلام SQL واحد (SELECT/WITH) على نسخة قراءة فقط من قاعدة البيانات. استخدمها للأسئلة المعقّدة اللي مش مغطّاة بأداة تانية: مقارنات مخصّصة، تجميعات، أو أعمدة مش ظاهرة في التقارير. ممنوع أي تعديل.',
    write: false,
    schema: z.object({
      sql: z.string().describe(
        'استعلام SQLite واحد يبدأ بـ SELECT أو WITH. اكتب أسماء الأعمدة صريحة وحدّد LIMIT. ممنوع PRAGMA/ATTACH/INSERT/UPDATE/DELETE.',
      ),
      purpose: z.string().optional().describe('الغرض من الاستعلام في كلمات قليلة'),
    }),
    async run(args): Promise<ToolOutput> {
      try {
        const result = await asOwnerAsync(() => analysis.query(args.sql))
        const preview = previewRows(result.rows)
        const truncated = result.truncated || preview.truncated

        const summary = result.rowCount === 0
          ? 'الاستعلام رجع صفر صفوف'
          : `رجع ${result.rowCount} صف${truncated ? ' (أول 50 في الرد)' : ''} في ${result.elapsedMs}ms`

        const card: ChatCard | null = result.columns.length > 0
          ? tableCard('نتيجة الاستعلام', result.columns, preview.rows.map((row) => row.map(cellText)))
          : null

        return toolOutput(
          {
            purpose: args.purpose ?? null,
            columns: result.columns,
            rows: preview.rows,
            rowCount: result.rowCount,
            truncated,
            elapsedMs: result.elapsedMs,
          },
          summary,
          card ? [card] : [],
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'فشل الاستعلام'
        return toolOutput({ error: message }, `مش قادر أنفّذ الاستعلام: ${message}`.slice(0, 300))
      }
    },
  },
  {
    name: 'db_schema',
    description:
      'اعرض شكل الجداول قبل ما تكتب SQL: من غير اسم بترجع قائمة الجداول وعدد صفوفها، وباسم جدول بترجع أعمدته وأنواعها والمفاتيح الأجنبية. استخدمها لو «مخطط قاعدة البيانات» اللي في البرومبت مش كفاية.',
    write: false,
    schema: z.object({
      table: z.string().optional().describe('اسم الجدول. سيبها فاضية لقائمة كل الجداول.'),
    }),
    async run(args): Promise<ToolOutput> {
      const name = String(args.table ?? '').trim()

      if (!name) {
        const tables = tableList()
        if (tables.length === 0) {
          return toolOutput({ error: 'تعذّر قراءة المخطط' }, 'مش قادر أقرا المخطط دلوقتي')
        }
        return toolOutput(
          { tables },
          `${tables.length} جدول — أكبرهم ${tables[0]?.name ?? ''}`,
        )
      }

      const digest = tableDigest(name)
      if (!digest) {
        const names = tableList().map((entry) => entry.name)
        return toolOutput(
          { error: `مفيش جدول اسمه ${name}`, tables: names },
          `مفيش جدول اسمه ${name}`,
        )
      }
      return toolOutput({ table: name, ddl: digest }, `شكل جدول ${name}`)
    },
  },
]
