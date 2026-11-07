// Pure helpers for the turn loop.
//
// Kept free of I/O and of the Temporal SDK so the workflow sandbox can import
// it and so vitest can exercise dedupe, budgets and the fallback answer
// without a database, a provider or a worker.
import type { TurnState } from './prompt'
import { words } from './guard/arabic'

/** Hard bounds for one turn. Latency and spend both grow with the step count. */
export const MAX_STEPS = 8
export const MAX_CALLS_PER_STEP = 4
export const MAX_TOOL_CALLS = 12
export const MAX_CONSECUTIVE_FAILURES = 2
/** Failures across the whole turn. A model that fails once per step would
 * otherwise pass the consecutive brake on every step and burn the whole budget. */
export const MAX_TOTAL_FAILURES = 5
export const MAX_EXTRA_TOOLS = 6

/** Upper bound on the reasoning the reviewer and trace will look at. */
export const MAX_REASONING_CHARS = 4000

/** The review runs only while the owner has at least this share of the cap. */
export const REVIEW_MIN_REMAINING_PERCENT = 20

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

/**
 * The synthetic result for a call that was not run. A budget skip is not a
 * duplicate, and telling the model it is one sends it looking for a result that
 * does not exist.
 */
export function skippedResult(reason: SkipReason, previous: ToolExchange | undefined) {
  if (reason === 'duplicate') return duplicateResult(previous)
  return {
    summary: 'مش هقدر أنادي أدوات أكتر في الدور ده — جاوب من النتائج اللي معاك.',
    data: { skipped: true, reason: 'budget' },
    cards: [],
  }
}

/**
 * Whether the turn should stop probing and answer from what it already has.
 *
 * Two different brakes, because they catch two different failure modes: a model
 * repeating one broken call, and a model that breaks a fresh call every step.
 */
export function shouldBrake(consecutiveFailures: number, totalFailures: number): boolean {
  return consecutiveFailures >= MAX_CONSECUTIVE_FAILURES || totalFailures >= MAX_TOTAL_FAILURES
}

/** Exchanges the tools rejected — the dead ends of this turn. */
export function failedExchanges(exchanges: readonly ToolExchange[]): ToolExchange[] {
  return exchanges.filter((exchange) => toolFailed({ data: exchange.data }))
}

// ─── Step review ───────────────────────────────────────────
// The reviewer reads a step's calls while its tools run, and can steer the next
// step or stop the turn. Its deterministic half lives here — free, instant and
// testable without a provider — and only the judgement half needs a model.

export type ReviewVerdict =
  | { verdict: 'ok' }
  /** Injected into the next prompt: the model should change approach. */
  | { verdict: 'steer'; note: string }
  /** Stop probing and answer from what the turn already has. */
  | { verdict: 'block'; note: string }

/** A step whose every call came back as an error taught the turn nothing. */
export function allCallsFailed(results: readonly { data: unknown }[]): boolean {
  if (results.length === 0) return false
  return results.every((result) => toolFailed({ data: result.data }))
}

/**
 * A write that proposes an action about something the owner never mentioned.
 *
 * Only write tools carry an `actionId`, and their `data.subject` is the product
 * or ingredient the preview is about. When that subject appears nowhere in the
 * message — after normalising the Arabic — the model has acted on the wrong
 * record: an earlier turn, a similar name, or a guess. That must never reach a
 * confirmation card.
 */
export function wrongSubjectWrite(
  message: string,
  results: readonly { name: string; data: unknown }[],
): string | null {
  const said = new Set(words(message).map(bare))
  if (said.size === 0) return null

  for (const result of results) {
    const data = result.data as Record<string, unknown> | null | undefined
    if (!data || typeof data !== 'object') continue
    if (!('actionId' in data)) continue
    const subject = String(data.subject ?? '').trim()
    if (!subject) continue

    const parts = words(subject)
    if (parts.length === 0) continue
    // The owner writes «الفراخ», the catalogue says «فراخ مشوية»: the article
    // and the extra words are noise, the noun is the thing being checked.
    const matched = parts.some((part) => said.has(bare(part)))
    if (matched) continue
    return subject
  }
  return null
}

/**
 * The word without its definite article.
 *
 * Arabic glues «ال» onto the front of a noun, so a message saying «الكريب» and a
 * stored product called «كريب» are the same object to the person writing them.
 */
function bare(word: string): string {
  return word.startsWith('ال') && word.length > 3 ? word.slice(2) : word
}

/**
 * The deterministic half of the review: everything that can be decided without
 * spending a token. Returns `null` when nothing is provably wrong, which is the
 * signal to let the model reviewer have a look.
 */
export function deterministicReview(input: {
  message: string
  stepCalls: readonly ToolCall[]
  stepResults: readonly { name: string; data: unknown }[]
  failedThisTurn: readonly ToolExchange[]
}): ReviewVerdict | null {
  const wrongSubject = wrongSubjectWrite(input.message, input.stepResults)
  if (wrongSubject) {
    return {
      verdict: 'block',
      note: `الأداة جهزت تعديل على «${wrongSubject}» وده مش اللي صاحب المطعم طلبه. متعرضش الإجراء ده — جاوب من البيانات اللي عندك أو اسأله يوضّح.`,
    }
  }

  if (allCallsFailed(input.stepResults)) {
    return {
      verdict: 'block',
      note: 'كل الأدوات في الخطوة دي رجعت خطأ. متجربش تاني — جاوب من اللي عندك، ولو مفيكش حاجة قول إنك مش قادر.',
    }
  }

  // A call the turn already failed, repeated. The dedupe would answer it from
  // the error, so the step spends nothing new — but the model is stuck.
  const dead = new Set(input.failedThisTurn.map((entry) => callSignature(entry.name, entry.args)))
  const repeating = input.stepCalls.some((call) => dead.has(callSignature(call.name, call.args)))
  if (repeating) {
    return {
      verdict: 'steer',
      note: 'إنت بتعيد استدعاء فشل قبل كده. غيّر المدخلات أو الطريقة، أو جاوب من البيانات اللي معاك.',
    }
  }

  return null
}

/**
 * Whether the model review is worth its token cost right now.
 *
 * Skipped when the owner is nearly out of budget: the deterministic checks have
 * already run, and a review is a luxury next to actually answering.
 */
export function reviewWorthCalling(input: {
  stepResults: number
  remaining: number | null
  limit: number
}): boolean {
  if (input.stepResults === 0) return false
  if (!(input.limit > 0)) return true // no cap set
  if (input.remaining === null) return true
  return input.remaining >= (input.limit * REVIEW_MIN_REMAINING_PERCENT) / 100
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
    failed: failedExchanges(exchanges).map((exchange) => ({
      name: exchange.name,
      summary: exchange.summary ?? '',
    })),
    cardIds: cardIds.slice(0, 6),
  }
}

/** Last three tool summaries, for a turn that ran out of steps. */
export function fallbackAnswer(exchanges: readonly ToolExchange[]): string {
  // A failed call's summary is an error message, not a finding. Prefer what the
  // tools actually returned; only fall back to everything when nothing worked.
  const productive = exchanges.filter((exchange) => !toolFailed({ data: exchange.data }))
  const source = productive.length > 0 ? productive : exchanges
  const summaries = source
    .map((exchange) => String(exchange.summary ?? '').trim())
    .filter(Boolean)
    .slice(-3)
  if (summaries.length === 0) return 'محتاج توضيح أكتر عشان أقدر أجاوب.'
  return `جمعت البيانات دي: ${summaries.join(' · ')}`.slice(0, 780)
}
