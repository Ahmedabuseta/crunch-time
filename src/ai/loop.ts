// Pure helpers for the turn loop.
//
// Kept free of I/O and of the Temporal SDK so the workflow sandbox can import
// it and so vitest can exercise dedupe, budgets and the fallback answer
// without a database, a provider or a worker.
import type { TurnState } from './prompt'

/** Hard bounds for one turn. Latency and spend both grow with the step count. */
export const MAX_STEPS = 8
export const MAX_CALLS_PER_STEP = 4
export const MAX_TOOL_CALLS = 12
export const MAX_CONSECUTIVE_FAILURES = 2
export const MAX_EXTRA_TOOLS = 6

export interface ToolCall {
  id: string
  name: string
  args: unknown
}

export interface ToolExchange {
  id: string
  name: string
  args: unknown
  data: unknown
  summary?: string
  /** Wall time of the tool run, when the activity measured it. */
  ms?: number
}

export type SkipReason = 'duplicate' | 'budget'

export interface SkippedCall {
  call: ToolCall
  reason: SkipReason
}

/**
 * Order-independent signature for a tool call. Two calls with the same name and
 * the same arguments, however the provider ordered the keys, are the same call.
 */
export function callSignature(name: string, args: unknown): string {
  return `${name}:${stableJson(args)}`
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
}

/**
 * Splits the model's calls into the ones worth running and the ones to answer
 * with a synthetic result. A repeated identical call is never re-executed: a
 * small model that is unsure will happily ask the same question three times,
 * and each repeat costs latency without changing the answer.
 */
export function planCalls(
  calls: readonly ToolCall[],
  seen: ReadonlySet<string>,
  remaining: number,
): { run: ToolCall[]; skipped: SkippedCall[] } {
  const run: ToolCall[] = []
  const skipped: SkippedCall[] = []
  const local = new Set(seen)

  for (const call of calls) {
    const signature = callSignature(call.name, call.args)
    if (local.has(signature)) {
      skipped.push({ call, reason: 'duplicate' })
      continue
    }
    if (run.length >= Math.max(0, remaining)) {
      skipped.push({ call, reason: 'budget' })
      continue
    }
    local.add(signature)
    run.push(call)
  }

  return { run, skipped }
}

/** The tool result shown to the model instead of running a duplicate. */
export function duplicateResult(previous: ToolExchange | undefined) {
  return {
    summary: previous?.summary
      ? `نفس الاستدعاء اتعمل قبل كده: ${previous.summary}`
      : 'نفس الاستدعاء اتعمل قبل كده — استخدم النتيجة السابقة.',
    data: { duplicate: true },
    cards: [],
  }
}

/** True when a tool returned a structured failure rather than data. */
export function toolFailed(output: { data: unknown } | undefined): boolean {
  const data = output?.data
  return Boolean(data && typeof data === 'object' && (data as { error?: unknown }).error)
}

export function buildTurnState(
  step: number,
  maxSteps: number,
  exchanges: readonly ToolExchange[],
  cardIds: readonly string[],
): TurnState {
  return {
    step,
    maxSteps,
    ran: exchanges.map((exchange) => ({ name: exchange.name, summary: exchange.summary ?? '' })),
    cardIds: cardIds.slice(0, 6),
  }
}

/** Last three tool summaries, for a turn that ran out of steps. */
export function fallbackAnswer(exchanges: readonly ToolExchange[]): string {
  const summaries = exchanges
    .map((exchange) => String(exchange.summary ?? '').trim())
    .filter(Boolean)
    .slice(-3)
  if (summaries.length === 0) return 'محتاج توضيح أكتر عشان أقدر أجاوب.'
  return `جمعت البيانات دي: ${summaries.join(' · ')}`.slice(0, 780)
}
