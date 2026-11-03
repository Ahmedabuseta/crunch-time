import { generateText, stepCountIs, tool, type LanguageModel, type ModelMessage } from 'ai'
import { z } from 'zod'
import type Database from 'better-sqlite3'
import { describeSchema, type TableInfo } from './schema'
import { previewRows, type QueryResult } from './runner'

const MODEL_ROWS = 40

/**
 * Groq's GPT-OSS models return `reasoning_content`, but reject it when it is
 * sent back on an assistant message in the next tool-loop request. The SDK
 * turns it into a `reasoning` content part, so dropping that part before each
 * step keeps the loop compatible without losing the tool call.
 */
function stripReasoning(message: ModelMessage): ModelMessage {
  if (message.role !== 'assistant') return message

  const source = message as any
  if (!Array.isArray(source.content)) return message

  const content = source.content.filter((part: any) => part?.type !== 'reasoning')
  const next: any = { ...source, content }
  delete next.reasoning
  delete next.reasoning_content
  return next as ModelMessage
}

export interface AskToolCall {
  id: string
  name: string
  args: unknown
}

export interface AskToolResult {
  id: string
  name: string
  output: unknown
}

export interface AskStep {
  index: number
  text: string
  reasoning: string | null
  finishReason: string | null
  toolCalls: AskToolCall[]
  toolResults: AskToolResult[]
  usage: {
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
  }
}

export interface AskContext {
  provider: string | null
  model: string | null
  tables: number
  startedAt: string
  durationMs: number
}

export interface AskQuery extends QueryResult {
  sql: string
  purpose: string | null
  toolCallId: string | null
  error?: string
}

export interface AskResult {
  question: string
  answer: string
  queries: AskQuery[]
  steps: number
  trace: AskStep[]
  context: AskContext
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export interface AskInput {
  question: string
  /** Used for the cheap schema reads (pragma per table). */
  database: Database.Database
  /** SELECT execution — routed to the snapshot's worker with a hard deadline. */
  query: (sql: string, maxRows: number) => Promise<QueryResult>
  model: LanguageModel
  maxRows: number
  maxSteps?: number
}

function schemaText(tables: TableInfo[], maxChars = 12_000): string {
  const lines = tables.map((table) => {
    const columns = table.columns
      .map((column) => `${column.name} ${column.type || 'TEXT'}${column.primaryKey ? ' PK' : ''}`)
      .join(', ')
    return `- ${table.name}(${columns})`
  })

  let text = ''
  for (const line of lines) {
    if (text.length + line.length + 1 > maxChars) return `${text}\n… (بقية الجداول محذوفة)`
    text += `${text ? '\n' : ''}${line}`
  }
  return text
}

function systemPrompt(schema: string): string {
  return [
    'أنت محلل بيانات لنظام كاشير مطعم (Crunch Time) على SQLite.',
    `النهاردة ${new Date().toISOString().slice(0, 10)}.`,
    '',
    'قواعد:',
    '- بتشتغل على نسخة قراءة فقط من قاعدة البيانات. ممنوع أي كتابة.',
    '- استخدم أداة run_sql فقط. استعلام واحد كل مرة يبدأ بـ SELECT أو WITH، وممنوع PRAGMA/ATTACH/INSERT/UPDATE/DELETE.',
    '- اكتب أعمدة صريحة، وحدّد LIMIT لما النتيجة تكون كبيرة.',
    '- اعتمد على أسماء الجداول والأعمدة اللي في المخطط تحت. متخمّنش اسم عمود.',
    '- لو الاستعلام رجّع خطأ، اقرأ الخطأ وصحّح الاستعلام وجرّب تاني.',
    '- الأرقام اللي بتذكرها لازم تكون من نتائج الاستعلامات بالظبط. ممنوع تأليف أرقام.',
    '- رد بلغة السؤال. اختصر: الإجابة والأرقام المهمة، وتفصيل بسيط لو مفيد.',
    '',
    'المخطط:',
    schema,
  ].join('\n')
}

export async function askQuestion(input: AskInput): Promise<AskResult> {
  const question = String(input.question ?? '').trim()
  if (!question) throw new Error('اكتب سؤال تحليلي')

  // A dev build can leave an old main process alive while the renderer reloads.
  // The old call shape handed the Snapshot object here, which fails deep inside
  // better-sqlite3 as `database.prepare is not a function`; fail with the fix.
  if (!input.database || typeof input.database.prepare !== 'function' || typeof input.query !== 'function') {
    throw new Error('نسخة التحليل مش جاهزة — اقفل التطبيق وشغّله من جديد لتحميل النسخة الحالية')
  }

  const startedAt = new Date()
  const started = Date.now()
  const tables = describeSchema(input.database)
  const queries: AskQuery[] = []
  const maxRows = Math.max(1, Math.trunc(input.maxRows))

  const result = await generateText({
    model: input.model,
    system: systemPrompt(schemaText(tables)),
    prompt: question,
    tools: {
      run_sql: tool({
        description: 'نفّذ استعلام SELECT واحد على نسخة قراءة فقط من قاعدة بيانات الكاشير. استخدمها لجمع الأرقام قبل الرد.',
        inputSchema: z.object({
          sql: z.string().describe('استعلام SQLite واحد يبدأ بـ SELECT أو WITH. ممنوع أي تعديل.'),
          purpose: z.string().optional().describe('الغرض من الاستعلام في كلمات قليلة'),
        }),
        execute: async ({ sql, purpose }, options) => {
          const toolCallId = (options as { toolCallId?: string } | undefined)?.toolCallId ?? null

          try {
            const output = await input.query(sql, maxRows)
            queries.push({ sql, purpose: purpose ?? null, toolCallId, ...output })
            const preview = previewRows(output.rows, MODEL_ROWS)
            return {
              ok: true,
              columns: output.columns,
              rows: preview.rows,
              rowCount: output.rowCount,
              truncated: output.truncated || preview.truncated,
              elapsedMs: output.elapsedMs,
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'فشل الاستعلام'
            queries.push({
              sql,
              purpose: purpose ?? null,
              toolCallId,
              columns: [],
              rows: [],
              rowCount: 0,
              truncated: false,
              elapsedMs: 0,
              error: message,
            })
            return { ok: false, error: message }
          }
        },
      }),
    },
    stopWhen: stepCountIs(input.maxSteps ?? 5),
    prepareStep: ({ messages }) => ({
      messages: messages.map(stripReasoning),
    }),
    maxRetries: 1,
  })

  const trace: AskStep[] = result.steps.map((step) => ({
    index: step.stepNumber,
    text: step.text?.trim() || '',
    reasoning: step.reasoningText?.trim() || null,
    finishReason: step.finishReason ?? null,
    toolCalls: (step.toolCalls ?? []).map((call: any) => ({
      id: String(call.toolCallId ?? ''),
      name: String(call.toolName ?? ''),
      args: call.input ?? null,
    })),
    toolResults: (step.toolResults ?? []).map((entry: any) => ({
      id: String(entry.toolCallId ?? ''),
      name: String(entry.toolName ?? ''),
      output: entry.output ?? null,
    })),
    usage: {
      inputTokens: Number(step.usage?.inputTokens ?? 0) || 0,
      outputTokens: Number(step.usage?.outputTokens ?? 0) || 0,
      reasoningTokens: Number(step.usage?.outputTokenDetails?.reasoningTokens ?? 0) || 0,
    },
  }))

  const firstModel = result.steps[0]?.model

  return {
    question,
    answer: result.text.trim(),
    queries,
    steps: trace.length,
    trace,
    context: {
      provider: firstModel?.provider ?? null,
      model: firstModel?.modelId ?? null,
      tables: tables.length,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - started,
    },
    usage: {
      inputTokens: Number(result.usage.inputTokens ?? 0) || 0,
      outputTokens: Number(result.usage.outputTokens ?? 0) || 0,
    },
  }
}
