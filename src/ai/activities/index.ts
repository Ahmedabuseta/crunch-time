// Activities — the only place that does I/O.
//
// The workflow owns control flow and nothing else. Every model call, every
// tool run and every database write happens here, which is what lets Temporal
// replay a turn deterministically and show it in the UI with real durations.
import { generateText, Output, streamText, tool } from 'ai'
import { ApplicationFailure } from '@temporalio/activity'
import { getAiConfigWithKey, getAiConfig } from '../config'
import { buildSystemPrompt, promptSkillIds, PROMPT_VERSION, type TurnFacts } from '../prompt'
import { ALL_TOOLS, getTool, redact } from '../tools'
import { selectTools } from '../tools/select'
import { schemaDigest } from '../tools/schema-digest'
import { appendedDelta, partialStringField } from '../partial-json'
import { buildTurnState, CLAIM_MARKER, deterministicReview, MAX_REASONING_CHARS, reviewWorthCalling, toolFailed, unsupportedClaim, type ReviewVerdict, type ToolCall, type ToolExchange } from '../loop'
import { createProvider, type ProviderFactory } from '../provider'
import { appendTrace, type TurnTrace } from '../trace'
import { unknownNumbers } from '../guard/numbers'
import { resolveCards, AssistantReplySchema, ReviewSchema, ToolOutputSchema, type AssistantReply, type ChatCard } from '../schemas'
import { appendMessage, compactThread, getSummary, modelHistory } from '../history'
import { recordUsage, todaySnapshot, withinBudget } from '../guard/budget'
import { getSavedReply } from '../guard/replies'
import { publishFinalText, publishStatus, publishText, publishThinking } from '../streams'
import { getDb } from '../../db/client'
import * as schema from '../../db/schema'
import { eq } from 'drizzle-orm'
import {
  cancelAction as cancelStoredAction,
  executeAction as executeStoredAction,
  expireAction as expireStoredAction,
} from '../actions'

const { settings } = schema

const READ_CONCURRENCY = 4

export interface LoadContextInput {
  threadId: string
}

export interface LoadContextOutput {
  facts: TurnFacts
  messages: { role: 'user' | 'assistant'; content: string }[]
  /** ISO timestamp; the workflow cannot read a clock, so the trace gets it here. */
  startedAt: string
}

export async function loadContext(input: LoadContextInput): Promise<LoadContextOutput> {
  const row = getDb().select({
    name: settings.restaurantName,
    currency: settings.currencyLabel,
    taxRate: settings.taxRate,
    deliveryFee: settings.deliveryFee,
    storePhone: settings.storePhone,
  }).from(settings).where(eq(settings.id, 'settings')).get()

  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  let conversationSummary: string | null = null
  try {
    conversationSummary = getSummary(input.threadId)
  } catch {
    // A thread row that has not been written yet is the normal first turn.
  }

  // `tax_rate` is stored as a fraction (0.14) but read by people as a percent.
  // A value above 1 was already written as a percentage, so it is left alone —
  // the same normalisation `readBusinessContext` uses for the analyst.
  const stored = Number(row?.taxRate) || 0
  const taxPercent = stored > 1 ? stored : stored * 100

  return {
    facts: {
      restaurantName: row?.name || 'Crunch Time',
      currencyLabel: row?.currency || 'ج.م',
      today,
      weekday: now.toLocaleDateString('ar-EG', { weekday: 'long' }),
      conversationSummary,
      taxPercent: Math.round(taxPercent * 10) / 10,
      deliveryFee: Number(row?.deliveryFee) || 0,
      storePhone: row?.storePhone || null,
    },
    messages: modelHistory(input.threadId),
    startedAt: now.toISOString(),
  }
}

function safeConfig() {
  try {
    return getAiConfigWithKey()
  } catch (err: any) {
    throw ApplicationFailure.nonRetryable(err?.message || 'إعدادات المساعد غير مكتملة', 'ConfigError')
  }
}

export interface ModelStepInput {
  turnId: string
  facts: TurnFacts
  /** Plain turns from the transcript, oldest first. */
  history: { role: 'user' | 'assistant'; content: string }[]
  /** Tool calls already run this turn, in order. */
  exchanges: ToolExchange[]
  /** Ids of cards produced so far, so the model can choose among them. */
  cardIds: string[]
  step: number
  maxSteps: number
  /** The owner's current message, used to expose only relevant tool schemas. */
  message: string
  /** Names `find_tools` surfaced earlier in this turn. */
  extraTools?: string[]
  /** The last step of a turn must answer; data tools are no longer offered. */
  forceAnswer?: boolean
  /** Numbers the previous answer invented, for the single repair round. */
  repair?: string[]
  /** The reviewer's note for this step: change course, or answer now. */
  steer?: string
}

export interface ModelStepCommon {
  promptTokens: number
  completionTokens: number
  promptChars: number
  promptVersion: string
  /** Playbooks that shaped this step's prompt, for the turn trace. */
  skills: string[]
  /** Chars of reasoning the model produced, headed to the trace. */
  reasoningChars: number
  /** Time to the first reasoning/text token, or null when there was none. */
  firstTokenMs: number | null
}

export type ModelStepOutput =
  | ({ kind: 'tool-calls'; calls: ToolCall[] } & ModelStepCommon)
  | ({ kind: 'answer'; reply: AssistantReply; degraded: boolean } & ModelStepCommon)

/**
 * One model round trip. The prompt is rebuilt here, on every step, because
 * this is the only layer that knows the live step budget and the exposed tools.
 */
export async function modelStep(input: ModelStepInput): Promise<ModelStepOutput> {
  return modelStepWith(input, createProvider)
}

/** Injectable form: tests pass their own factory, the workflow passes none. */
export async function modelStepWith(input: ModelStepInput, factory: ProviderFactory): Promise<ModelStepOutput> {
  const config = safeConfig()
  const model = factory(config)(config.model)

  const exposed = input.forceAnswer ? [] : selectTools(ALL_TOOLS, input.message, input.extraTools ?? [])

  // Read once per step and only carried when SQL is on offer — see
  // `buildSystemPrompt`, which drops it for every other step.
  const digest = exposed.some((def) => def.name === 'query_database') ? schemaDigest() : ''

  const promptFor = (compact: boolean) => buildSystemPrompt({
    facts: input.facts,
    state: buildTurnState(input.step, input.maxSteps, input.exchanges, input.cardIds),
    tools: exposed,
    followupAllowed: true,
    // The owner's message decides which playbooks load. On the compact retry
    // this is left alone: a skill's rules are the domain knowledge the turn
    // needs, and dropping them to save tokens would be dropping the point.
    message: input.message,
    repair: input.repair,
    steer: input.steer,
    // Dropped on the compact retry: it is the largest optional section, and
    // `db_schema` can still fetch any table the model needs.
    schema: compact ? '' : digest,
  })

  const system = promptFor(false)

  const toolsFor = (compact: boolean) => {
    const defs = [...exposed]
    if (compact) {
      // Tools are the bulk of a request. Keep the answer tool plus the ones the
      // owner's message actually routed to as writes; drop the rest.
      const keep = defs.filter((def) => def.write)
      return keep.length > 0 ? keep : defs.slice(0, 6)
    }
    return defs
  }

  const sdkToolsFor = (compact: boolean) => {
    const defs = toolsFor(compact)
    return input.forceAnswer || (compact && defs.length === 0)
      ? { [ANSWER_TOOL]: answerTool() }
      : {
          ...Object.fromEntries(
            defs.map((def) => [
              def.name,
              tool({ description: def.description, inputSchema: def.schema }),
            ]),
          ),
          [ANSWER_TOOL]: answerTool(),
        }
  }

  const sdkTools = sdkToolsFor(false)

  // Tool calls and their results are reassembled here rather than in the
  // workflow: the workflow stores plain JSON, and only this module knows the
  // SDK's message shape.
  const base = {
    promptChars: system.length,
    promptVersion: PROMPT_VERSION,
    // Recorded so a turn can be explained after the fact: two answers that
    // differ can be compared against the playbook that produced them.
    skills: promptSkillIds({ message: input.message }),
  }

  /**
   * One provider round trip, streamed.
   *
   * This drives three things at once, which is why it reads `fullStream` rather
   * than `textStream` or `toolCalls`:
   * - `reasoning-delta` → the live thinking line.
   * - `tool-input-delta` on the `answer` tool → the live answer bubble. The
   *   reply arrives as that tool's arguments, so the only way to show it as it
   *   is written is to read the argument JSON as it streams.
   * - `tool-call` → the finished calls the workflow acts on.
   *
   * The published text is a *preview*: the number guard may still reject it and
   * the workflow then persists the repaired answer instead.
   */
  const streamOnce = async (compact = false) => {
    // The SDK replaces a provider failure that happens before the first step
    // with a bare NoOutputGeneratedError, so the real one is kept here.
    let streamError: unknown
    const startedAt = Date.now()
    let firstTokenMs: number | null = null
    let reasoningChars = 0

    const result = streamText({
      model,
      system: compact ? promptFor(true) : system,
      messages: buildMessages(input.history, input.exchanges),
      tools: compact ? sdkToolsFor(true) : sdkTools,
      ...(input.forceAnswer ? { toolChoice: 'required' as const } : {}),
      // One step per activity: the workflow decides when to go round again.
      maxRetries: 1,
      onError: ({ error }) => {
        streamError = error
      },
    })

    const calls: { toolCallId: string; toolName: string; input: unknown }[] = []
    // Which call each streaming argument belongs to.
    const names = new Map<string, string>()
    let answerJson = ''
    let answerShown = ''

    for await (const part of result.fullStream) {
      if (firstTokenMs === null && (part.type === 'text-delta' || part.type === 'reasoning-delta')) {
        firstTokenMs = Date.now() - startedAt
      }

      switch (part.type) {
        case 'reasoning-delta': {
          if (reasoningChars >= MAX_REASONING_CHARS) break
          reasoningChars += part.text.length
          publishThinking(input.turnId, part.text)
          break
        }

        case 'tool-input-start': {
          // Parts carry the exchange id as `id`, not `toolCallId`.
          names.set(part.id, part.toolName)
          if (part.toolName === ANSWER_TOOL) {
            answerJson = ''
            answerShown = ''
          }
          break
        }

        case 'tool-input-delta': {
          if (names.get(part.id) !== ANSWER_TOOL) break
          answerJson += part.delta
          const text = partialStringField(answerJson, 'text')
          const delta = appendedDelta(answerShown, text)
          if (delta) {
            publishText(input.turnId, delta)
            answerShown = text
          }
          break
        }

        case 'tool-call': {
          calls.push({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: (part as { input?: unknown }).input,
          })
          break
        }

        case 'error': {
          streamError = (part as { error?: unknown }).error ?? streamError
          break
        }

        default:
          // `text-delta` is not used: the reply is the `answer` call, and the
          // provider's own prose for a tool-using step is not shown.
          break
      }
    }

    return {
      calls,
      result,
      streamError: () => streamError,
      firstTokenMs,
      reasoningChars,
    }
  }

  let attempt: Awaited<ReturnType<typeof streamOnce>>
  try {
    attempt = await streamOnce()
  } catch (err: any) {
    // Too big for the provider's rate window (Groq's free tier caps a whole
    // minute at 8k tokens). Retrying the same size can never work, but the same
    // step fits once the schema digest and the unused tool schemas are dropped —
    // so shrink the request instead of failing the turn.
    if (!isRequestTooLarge(err)) throw providerFailure(err)
    try {
      attempt = await streamOnce(true)
    } catch (retryErr: any) {
      throw providerFailure(retryErr)
    }
  }

  /**
   * A provider that rejects the request shape (Groq refuses a JSON
   * `response_format` alongside tools) surfaces as a bare
   * NoOutputGeneratedError. One retry keeps the loop alive; it streams the same
   * way, so the live view survives the fallback.
   */
  const readCalls = async () => {
    if (attempt.calls.length > 0 || !attempt.streamError()) return attempt.calls
    const cause = attempt.streamError()!
    if (!isStructuredOutputUnsupported(cause)) throw providerFailure(cause)
    attempt = await streamOnce()
    return attempt.calls
  }

  const calls = await readCalls()
  const dataCalls = calls.filter((call) => call.toolName !== ANSWER_TOOL)

  if (dataCalls.length > 0) {
    const usage = await usageOf(attempt.result)
    return {
      kind: 'tool-calls',
      calls: dataCalls.map((call) => ({ id: call.toolCallId, name: call.toolName, args: call.input })),
      ...usage,
      reasoningChars: attempt.reasoningChars,
      firstTokenMs: attempt.firstTokenMs,
      ...base,
    }
  }

  const answerCall = calls.find((call) => call.toolName === ANSWER_TOOL)

  /**
   * No `answer` call and no data tool: the model replied in prose, which no
   * schema can enforce. Ask once more with a tool choice it cannot ignore.
   * That is the enforcement — one extra round trip, only for a provider or a
   * model that ignores the instruction.
   */
  const forceAnswer = async () => {
    const forced = streamText({
      model,
      system: `${system}\n\nقدّم ردك الآن باستخدام أداة «${ANSWER_TOOL}» فقط، ومتكتبش نص حر.`,
      messages: buildMessages(input.history, input.exchanges),
      tools: { [ANSWER_TOOL]: answerTool() },
      // `required` rather than naming the tool: several OpenAI-compatible
      // providers accept "must call some tool" but reject a pinned function,
      // and with a single tool available they mean the same thing.
      toolChoice: 'required',
      maxRetries: 1,
    })
    // `toolCalls` rejects with ToolChoiceViolationError when the model ignores
    // `required`; that is a provider limitation, not a failed turn.
    let forcedCalls: Awaited<typeof forced.toolCalls> = []
    try {
      forcedCalls = await forced.toolCalls
    } catch {
      return null
    }
    const call = (forcedCalls ?? []).find((entry) => entry.toolName === ANSWER_TOOL)
    // Not an error: a provider that cannot be forced to call a tool is a
    // limitation to answer around, not a broken turn.
    return call ?? null
  }

  const finalCall = answerCall ?? (await forceAnswer())

  let usage: { inputTokens?: number; outputTokens?: number } = { inputTokens: 0, outputTokens: 0 }
  try {
    usage = (await attempt.result.usage) as typeof usage
  } catch {
    // A missing usage block must not fail a turn that otherwise succeeded.
  }
  const promptTokens = Number((usage as any)?.inputTokens ?? 0) || 0
  const completionTokens = Number((usage as any)?.outputTokens ?? 0) || 0

  // The reply is whatever the `answer` tool was called with. The provider has
  // already validated it against `AssistantReplySchema`, and it is checked once
  // more here so a non-compliant endpoint cannot slip a wrong shape through.
  //
  // No call at all means the provider could not be made to use tools. Answer
  // honestly rather than showing whatever prose — or JSON — it produced.
  const reply = finalCall
    ? readAnswer(finalCall.input)
    : { text: getSavedReply('needs_context'), cards: [], followups: [] }

  // The live bubble was already driven by the argument stream above; nothing is
  // published here. The workflow may still reject invented numbers and repair
  // it, and `persistTurn` publishes the one answer that survives.
  return {
    kind: 'answer',
    reply,
    promptTokens,
    completionTokens,
    reasoningChars: attempt.reasoningChars,
    firstTokenMs: attempt.firstTokenMs,
    degraded: finalCall === null,
    ...base,
  }
}

/**
 * Rebuilds the SDK message array from plain JSON. Tool calls and their results
 * are stored as flat records in the workflow, because a workflow payload has to
 * stay serialisable and version-independent.
 */
function buildMessages(
  history: { role: 'user' | 'assistant'; content: string }[],
  exchanges: readonly ToolExchange[],
): any[] {
  const messages: any[] = history.map((turn) => ({ role: turn.role, content: turn.content }))
  for (const exchange of exchanges) {
    messages.push({
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: exchange.id, toolName: exchange.name, input: exchange.args }],
    })
    messages.push({
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: exchange.id,
        toolName: exchange.name,
        output: {
          type: 'json',
          value: { summary: exchange.summary ?? '', data: exchange.data },
        },
      }],
    })
  }
  return messages
}

function isStructuredOutputUnsupported(err: any): boolean {
  const message = `${err?.message ?? ''} ${err?.responseBody ?? ''}`
  return (
    /response_format|json_schema|structured|json mode/i.test(message) &&
    /400|unsupported|not support|cannot be combined/i.test(message)
  )
}

/**
 * The request itself is bigger than the provider's per-minute token budget.
 *
 * Groq's free tier reports `Request too large … tokens per minute (TPM):
 * Limit 8000`. This is about the size of the request, not the size of the
 * answer, so the fix is a smaller request — not a retry and not a shorter reply.
 */
function isRequestTooLarge(err: any): boolean {
  const status = Number(err?.statusCode ?? err?.status ?? 0)
  const message = String(err?.message ?? err?.responseBody ?? '')
  return status === 413 || /request too large|tokens per minute|\btpm\b/i.test(message)
}

async function usageOf(result: any): Promise<{ promptTokens: number; completionTokens: number }> {
  try {
    const usage = (await result?.usage) as { inputTokens?: number; outputTokens?: number }
    return {
      promptTokens: Number(usage?.inputTokens) || 0,
      completionTokens: Number(usage?.outputTokens) || 0,
    }
  } catch {
    return { promptTokens: 0, completionTokens: 0 }
  }
}

/**
 * The reply schema, exposed as a tool.
 *
 * This is the enforcement. The shape is not a convention the model is asked to
 * follow in prose and not something recovered by parsing text afterwards — it
 * is the argument schema of a function call, so a provider that supports tool
 * calling validates it before the call is returned. There is no JSON to strip,
 * no fence to unwrap, and no blob that can reach the chat bubble.
 */
const ANSWER_TOOL = 'answer'

function answerTool() {
  return tool({
    description: 'قدّم الرد النهائي لصاحب المطعم. استخدمها دايماً بدل الكتابة كنص حر.',
    inputSchema: AssistantReplySchema,
  })
}

/**
 * Reads the `answer` call's arguments, repairing what can be repaired.
 *
 * A provider that claims tool support does not always honour the schema: a
 * smaller free model will happily omit `cards` or send one string too many.
 * Failing the whole turn for that throws away a step the owner already paid for
 * and shows them nothing — so the well-formed fields are kept and the rest
 * falls back. Only a reply with no usable text at all is a real failure.
 */
function readAnswer(input: unknown): AssistantReply {
  const source = (input ?? {}) as Record<string, unknown>
  const text = typeof source.text === 'string' ? source.text.trim().slice(0, 800) : ''
  if (!text) {
    throw ApplicationFailure.nonRetryable('رد المساعد من غير نص', 'ValidationError')
  }

  const cards = Array.isArray(source.cards)
    ? source.cards.filter((id): id is string => typeof id === 'string').slice(0, 3)
    : []
  const followups = Array.isArray(source.followups)
    ? source.followups
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && entry.length <= 60)
        .slice(0, 3)
    : []

  return { text, cards, followups }
}

function providerFailure(err: any): Error {
  const status = Number(err?.statusCode ?? err?.status ?? 0)
  const message = String(err?.message ?? err?.responseBody ?? 'تعذّر الاتصال بالمزوّد')
  if (status === 401 || status === 403 || /invalid.*key|unauthor/i.test(message)) {
    return ApplicationFailure.nonRetryable('مفتاح API مرفوض — راجع المفتاح في الإعدادات', 'ProviderAuth')
  }
  // The request itself is too big for the rate window (Groq's free tier caps
  // tokens per minute, not requests). Retrying the same size can never help, so
  // this is non-retryable: the loop answers from what it already has instead of
  // failing the whole turn.
  if (status === 413 || /request too large|tokens per minute|tpm/i.test(message)) {
    return ApplicationFailure.nonRetryable(
      'السؤال أكبر من حد المزوّد في الدقيقة — قلّل التفاصيل أو جرّب تاني بعد شوية',
      'RequestTooLarge',
    )
  }
  if (status === 429) {
    // Transient: let the workflow retry with backoff.
    return new Error('المزوّد بيرفض الطلبات دلوقتي (429)')
  }
  return new Error(message.slice(0, 300))
}

export interface RunToolInput {
  turnId: string
  name: string
  args: unknown
  /** Action ids proposed earlier in this turn — a plan may group only these. */
  turnActionIds?: string[]
}

export interface RunToolOutput {
  summary: string
  data: unknown
  cards: ChatCard[]
}

/** Runs one tool and validates what it returned before it becomes durable. */
export async function runTool(input: RunToolInput): Promise<RunToolOutput> {
  const def = getTool(input.name)
  if (!def) {
    const error = `أداة غير معروفة: ${input.name}`
    return { summary: error, data: { error }, cards: [] }
  }

  publishStatus(input.turnId, def.name)

  const parsedArgs = def.schema.safeParse(input.args)
  if (!parsedArgs.success) {
    const error = 'بيانات الأداة مش صالحة — اسأل صاحب المطعم يوضّح الطلب.'
    return {
      summary: error,
      data: { error, issues: parsedArgs.error.flatten() },
      cards: [],
    }
  }

  let raw: unknown
  const ctx = {
    turnId: input.turnId,
    cards: [] as ChatCard[],
    turnActionIds: input.turnActionIds ?? [],
    now: new Date(),
  }
  try {
    raw = await def.run(parsedArgs.data, ctx)
  } catch (err: any) {
    const error = err?.message || 'تعذّر تنفيذ الأداة'
    return { summary: error, data: { error }, cards: [] }
  }

  const parsed = ToolOutputSchema.safeParse(raw)
  if (!parsed.success) {
    const error = `نتيجة الأداة ${def.name} غير صالحة`
    return { summary: error, data: { error, issues: parsed.error.flatten() }, cards: [] }
  }

  return {
    summary: parsed.data.summary,
    data: redact(parsed.data.data),
    cards: [...ctx.cards, ...parsed.data.cards].slice(0, 2),
  }
}

// ─── Batch tool execution ──────────────────────────────────

export interface BatchToolResult extends RunToolOutput {
  id: string
  name: string
  ms: number
}

export interface RunToolsInput {
  turnId: string
  calls: ToolCall[]
  turnActionIds?: string[]
}

export interface RunToolsOutput {
  results: BatchToolResult[]
}

/**
 * Runs one step's calls. Reads are independent, so they go in bounded batches;
 * writes stay sequential and in the model's order, because their action ids and
 * cards are what the next step and the confirm UI refer to.
 */
export async function runTools(input: RunToolsInput): Promise<RunToolsOutput> {
  const results: BatchToolResult[] = new Array(input.calls.length)
  const reads: number[] = []
  const writes: number[] = []

  input.calls.forEach((call, index) => {
    if (getTool(call.name)?.write) writes.push(index)
    else reads.push(index)
  })

  const runOne = async (index: number) => {
    const call = input.calls[index]
    const started = Date.now()
    const output = await runTool({
      turnId: input.turnId,
      name: call.name,
      args: call.args,
      turnActionIds: input.turnActionIds,
    })
    results[index] = { id: call.id, name: call.name, ...output, ms: Date.now() - started }
  }

  for (let offset = 0; offset < reads.length; offset += READ_CONCURRENCY) {
    await Promise.all(reads.slice(offset, offset + READ_CONCURRENCY).map(runOne))
  }
  for (const index of writes) await runOne(index)

  return { results }
}

// ─── Step review ───────────────────────────────────────────

export interface ReviewStepInput {
  turnId: string
  /** The owner's question, for subject matching and for the reviewer's prompt. */
  message: string
  /** Everything the turn has already run, so a repeat is visible as a repeat. */
  exchanges: ToolExchange[]
  /** The calls this step made. */
  stepCalls: ToolCall[]
  /**
   * Results of this step. Empty when the review ran in parallel with the tools —
   * the deterministic checks that need results then wait for the next step.
   */
  stepResults: { name: string; data: unknown; summary?: string }[]
  remainingSteps: number
}

export interface ReviewStepOutput {
  review: ReviewVerdict
  /** True when a model call was spent, for the trace and the budget. */
  usedModel: boolean
  promptTokens: number
  completionTokens: number
}

/**
 * Checks one step and says whether the turn should change course.
 *
 * Runs beside `runTools`, never after it: the reviewer looks at the *calls*
 * while the tools execute, so a bad step is caught without adding latency to
 * the turn. The deterministic half (a write about the wrong subject, a step
 * where everything failed, a repeated dead end) always runs and costs nothing;
 * the model half is skipped when the owner's budget is nearly gone.
 */
export async function reviewStep(input: ReviewStepInput): Promise<ReviewStepOutput> {
  const failedThisTurn = input.exchanges.filter((exchange) => toolFailed({ data: exchange.data }))

  const deterministic = deterministicReview({
    message: input.message,
    stepCalls: input.stepCalls,
    stepResults: input.stepResults,
    failedThisTurn,
  })
  if (deterministic) {
    return { review: deterministic, usedModel: false, promptTokens: 0, completionTokens: 0 }
  }

  const config = (() => {
    try {
      return getAiConfig()
    } catch {
      return null
    }
  })()
  if (!config) return { review: { verdict: 'ok' }, usedModel: false, promptTokens: 0, completionTokens: 0 }

  const usage = todaySnapshot(config.dailyTokenLimit)
  if (!reviewWorthCalling({
    stepResults: input.stepCalls.length,
    remaining: usage.remaining,
    limit: config.dailyTokenLimit,
  })) {
    return { review: { verdict: 'ok' }, usedModel: false, promptTokens: 0, completionTokens: 0 }
  }

  try {
    const withKey = getAiConfigWithKey()
    const model = createProvider({
      provider: withKey.provider,
      baseUrl: withKey.baseUrl,
      apiKey: withKey.apiKey,
    })(withKey.model)

    const done = input.exchanges
      .slice(-4)
      .map((exchange) => `- ${exchange.name}: ${String(exchange.summary ?? '').slice(0, 160)}`)
      .join('\n')
    const failed = failedThisTurn
      .slice(-4)
      .map((exchange) => `- ${exchange.name} فشلت: ${String(exchange.summary ?? '').slice(0, 120)}`)
      .join('\n')

    const result = await generateText({
      model,
      system: [
        'إنت مراجع خطوة واحدة في مساعد كاشير مطعم. مهمتك: تقرر لو الخطوة دي ماشية صح ولا محتاجة تعديل.',
        'رد بـ ok لو الخطوات منطقية ومتقدّمة. رد بـ steer لو لازم تغيّر الطريقة أو تجرب مدخلات تانية. رد بـ block لو الخطوة ضايعة ومفيش فايدة من الاستمرار.',
        'ملاحظتك بالعربي المصري، جملة واحدة، أقل من 200 حرف. متكتبش أرقام.',
      ].join('\n'),
      prompt: [
        `سؤال صاحب المطعم: ${input.message.slice(0, 300)}`,
        `فاضل ${input.remainingSteps} خطوة.`,
        input.stepCalls.length > 0
          ? `أدوات الخطوة دي: ${input.stepCalls.map((call) => call.name).join(', ')}`
          : 'الخطوة دي مجرتش أدوات.',
        done ? `اللي اتنفّذ قبل كده:\n${done}` : '',
        failed ? `طرق مسدودة:\n${failed}` : '',
      ].filter(Boolean).join('\n\n'),
      output: Output.object({ schema: ReviewSchema }),
      maxOutputTokens: 220,
      maxRetries: 1,
    })

    const parsed = ReviewSchema.safeParse(result.output)
    const promptTokens = Number(result.usage?.inputTokens ?? 0) || 0
    const completionTokens = Number(result.usage?.outputTokens ?? 0) || 0
    recordOrIgnore(promptTokens, completionTokens)

    if (!parsed.success) {
      return { review: { verdict: 'ok' }, usedModel: true, promptTokens, completionTokens }
    }
    if (parsed.data.verdict === 'ok' || !parsed.data.note?.trim()) {
      return { review: { verdict: 'ok' }, usedModel: true, promptTokens, completionTokens }
    }
    return {
      review: { verdict: parsed.data.verdict, note: parsed.data.note.trim() },
      usedModel: true,
      promptTokens,
      completionTokens,
    }
  } catch {
    // A reviewer that cannot be reached must never fail the turn it reviews.
    return { review: { verdict: 'ok' }, usedModel: false, promptTokens: 0, completionTokens: 0 }
  }
}

export interface ValidateReplyInput {
  turnId: string
  reply: AssistantReply
  producedCards: ChatCard[]
  exchanges: ToolExchange[]
  /** The owner's message, so a figure they wrote is never called invented. */
  ownerMessage?: string
}

export interface ValidateReplyOutput {
  reply: AssistantReply
  cards: ChatCard[]
  /** Numbers in the text that no tool returned. */
  unknown: string[]
}

/**
 * The wire contract gate: fills in a usable text and resolves the card ids.
 *
 * `readAnswer` has already reduced the reply to valid fields, so a parse failure
 * here means something upstream is wrong with the shape of the turn — but the
 * owner should still get an answer. The fallback text is derived from what the
 * tools actually produced, never invented.
 */
export async function validateReply(input: ValidateReplyInput): Promise<ValidateReplyOutput> {
  const fallbackText = (() => {
    const action = input.producedCards.find((card) => card.kind === 'action')
    if (action && action.kind === 'action') return `جاهز أعمل ${action.title} لـ ${action.subject} — مستني تأكيدك.`
    const first = input.producedCards[0]
    return first?.kind === 'table' ? `شوف ${first.title} في الكارت.` : 'شوف التفاصيل في الكارت.'
  })()
  const parsed = AssistantReplySchema.safeParse({
    ...input.reply,
    text: input.reply.text.trim() || fallbackText,
  })
  const reply = parsed.success
    ? parsed.data
    : readAnswer({ ...input.reply, text: input.reply.text.trim() || fallbackText })

  // "تم استبدال ١٥ كيلو" with no action card behind it is the worst reply the
  // assistant can send: the owner reads it as done and the stock never moved.
  // It is treated like an invented number — one repair round, then the summary.
  const unsupported = unsupportedClaim(reply.text, input.producedCards)
  const unknown = unknownNumbers(reply.text, input.exchanges, input.ownerMessage)

  return {
    reply,
    cards: resolveCards(reply.cards, input.producedCards),
    unknown: unsupported ? [...new Set([...unknown, CLAIM_MARKER])] : unknown,
  }
}

export interface PersistTurnInput {
  turnId: string
  threadId: string
  user: string
  text: string
  cards: ChatCard[]
  followups: string[]
}

export async function persistTurn(input: PersistTurnInput): Promise<{ messageId: string }> {
  const message = appendMessage(input.threadId, 'assistant', input.text, input.cards, input.followups)
  // The one publish of the turn, and it *replaces* the streamed draft: whatever
  // is here is the validated answer, and a draft the number guard rejected must
  // not linger in the bubble.
  publishFinalText(input.turnId, input.text)
  return { messageId: message.id }
}

function recordOrIgnore(promptTokens: number, completionTokens: number): void {
  try {
    recordUsage({ promptTokens, completionTokens })
  } catch {
    // Usage accounting must never fail a turn.
  }
}

/**
 * The daily cap, asked between steps rather than only before the turn starts.
 *
 * `prepareTurn` refuses a turn that begins over budget, but one turn is up to
 * eight model calls: without this check a single turn can cross the owner's cap
 * by most of its own cost. Reads as "allowed" on any database failure.
 */
export async function budgetAllows(): Promise<{ allowed: boolean }> {
  try {
    const config = getAiConfig()
    return { allowed: withinBudget(config.dailyTokenLimit) }
  } catch {
    return { allowed: true }
  }
}

/**
 * Charges one step's usage immediately.
 *
 * Recording only at `persistTurn` meant a turn that threw halfway — the case
 * where the owner has already paid for five or six model calls — left no trace
 * in `ai_usage` at all, so the cap under-counted exactly the failing turns.
 */
export async function recordStepUsage(input: {
  promptTokens: number
  completionTokens: number
}): Promise<{ ok: true }> {
  recordOrIgnore(Number(input.promptTokens) || 0, Number(input.completionTokens) || 0)
  return { ok: true }
}

/**
 * Folds a long thread into its summary once the window starts truncating.
 *
 * Separate from `persistTurn` so compaction never fails a committed answer.
 */
export async function compactHistory(input: { threadId: string }): Promise<{ compacted: boolean }> {
  return compactThread(input.threadId)
}

export interface PersistTraceInput {
  trace: TurnTrace
}

export async function persistTrace(input: PersistTraceInput): Promise<{ file: string | null }> {
  const startedAt = input.trace.startedAt || new Date().toISOString()
  // The workflow never reads a clock, so the duration is filled in here.
  const durationMs = input.trace.durationMs > 0
    ? input.trace.durationMs
    : Math.max(0, Date.now() - Date.parse(startedAt))
  return { file: await appendTrace({ ...input.trace, startedAt, durationMs }) }
}

// ─── Confirm-action activities ──────────────────────────────
// Wrapped as activities so they appear in the workflow history with their own
// duration and retry record, and so a replay never re-runs a data write.

export async function applyPendingAction(input: { actionId: string; deviceLabel?: string }) {
  const result = executeStoredAction(input.actionId, input.deviceLabel ?? 'المساعد')
  return { status: result.status, ok: result.ok, error: result.error }
}

export async function cancelPendingAction(input: { actionId: string }) {
  const result = cancelStoredAction(input.actionId)
  return { status: result.status, ok: result.ok, error: result.error }
}

export async function expirePendingAction(input: { actionId: string }) {
  const result = expireStoredAction(input.actionId)
  return { status: result.status, ok: result.ok }
}

export const activities = {
  loadContext,
  modelStep,
  runTool,
  runTools,
  reviewStep,
  validateReply,
  persistTurn,
  persistTrace,
  compactHistory,
  budgetAllows,
  recordStepUsage,
  applyPendingAction,
  cancelPendingAction,
  expirePendingAction,
}

export type Activities = typeof activities
