// Activities — the only place that does I/O.
//
// The workflow owns control flow and nothing else. Every model call, every
// tool run and every database write happens here, which is what lets Temporal
// replay a turn deterministically and show it in the UI with real durations.
import { Output, streamText, tool } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { ApplicationFailure } from '@temporalio/activity'
import { getAiConfigWithKey } from '../config'
import { buildSystemPrompt } from '../prompt'
import { ALL_TOOLS, getTool, redact } from '../tools'
import { resolveCards, AssistantReplySchema, ToolOutputSchema, type AssistantReply, type ChatCard } from '../schemas'
import { appendMessage, modelHistory } from '../history'
import { recordUsage } from '../guard/budget'
import { publishStatus, publishText } from '../streams'
import { getDb } from '../../db/client'
import * as schema from '../../db/schema'
import { eq } from 'drizzle-orm'
import {
  cancelAction as cancelStoredAction,
  executeAction as executeStoredAction,
  expireAction as expireStoredAction,
} from '../actions'

const { settings } = schema

export interface LoadContextInput {
  threadId: string
}

export interface LoadContextOutput {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}

export async function loadContext(input: LoadContextInput): Promise<LoadContextOutput> {
  const row = getDb().select({
    name: settings.restaurantName,
    currency: settings.currencyLabel,
  }).from(settings).where(eq(settings.id, 'settings')).get()

  const system = buildSystemPrompt({
    restaurantName: row?.name || 'Crunch Time',
    currencyLabel: row?.currency || 'ج.م',
    today: new Date().toISOString().slice(0, 10),
    cardsAvailable: 0,
    followupAllowed: true,
  })

  return { system, messages: modelHistory(input.threadId) }
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
  system: string
  /** Plain turns from the transcript, oldest first. */
  history: { role: 'user' | 'assistant'; content: string }[]
  /** Tool calls already run this turn, in order. */
  exchanges: { id: string; name: string; args: unknown; data: unknown }[]
  /** Ids of cards produced so far, so the model can choose among them. */
  cardIds: string[]
  step: number
}

export type ModelStepOutput =
  | { kind: 'tool-calls'; calls: { id: string; name: string; args: unknown }[] }
  | { kind: 'answer'; reply: AssistantReply; promptTokens: number; completionTokens: number; degraded: boolean }

/**
 * One model round trip. Streams prose to the phone through the turn registry
 * and returns either the tool calls to run next or the validated answer.
 */
export async function modelStep(input: ModelStepInput): Promise<ModelStepOutput> {
  const config = safeConfig()
  const provider = createOpenAICompatible({
    name: config.provider || 'openai-compatible',
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    // Ask for a real JSON schema rather than a bare "respond in JSON" hint. A
    // provider that rejects it answers 400 and `run(false)` retries without the
    // structured output, so this can only help.
    supportsStructuredOutputs: true,
  })

  const system = input.cardIds.length
    ? `${input.system}\n\nكروت متاحة في الرد ده: ${input.cardIds.join(', ')}`
    : `${input.system}\n\nمفيش كروت متاحة في الرد ده.`

  const sdkTools = {
    ...Object.fromEntries(
      ALL_TOOLS.map((def) => [
        def.name,
        tool({ description: def.description, inputSchema: def.schema }),
      ]),
    ),
    [ANSWER_TOOL]: answerTool(),
  }

  // Tool calls and their results are reassembled here rather than in the
  // workflow: the workflow stores plain JSON, and only this module knows the
  // SDK's message shape.
  const messages = buildMessages(input.history, input.exchanges)

  const run = async (withOutput: boolean) => {
    // The SDK replaces a provider failure that happens before the first step
    // with a bare NoOutputGeneratedError, so the real one is kept here for the
    // fallback in `readToolCalls`.
    let streamError: unknown
    const result = streamText({
      model: provider(config.model),
      system,
      messages,
      tools: sdkTools,
      // One step per activity: the workflow decides when to go round again.
      maxRetries: 1,
      onError: ({ error }) => {
        streamError = error
      },
      ...(withOutput ? { output: Output.object({ schema: AssistantReplySchema }) } : {}),
    })

    if (withOutput) {
      // Partial objects are unvalidated by definition, so only their `text`
      // field is used — and only to drive the live bubble. The trusted value
      // is `result.output` below.
      let shown = ''
      try {
        for await (const partial of result.partialOutputStream) {
          const value = (partial as { text?: unknown } | undefined)?.text
          if (typeof value !== 'string') continue
          if (value.startsWith(shown)) {
            publishText(input.turnId, value.slice(shown.length))
            shown = value
          } else if (value.length > shown.length) {
            publishText(input.turnId, value.slice(shown.length))
            shown = value
          }
        }
      } catch {
        // A malformed partial must not kill the step; the final output decides.
      }
      return { result, shown, plain: false, streamError: () => streamError }
    }

    let shown = ''
    for await (const delta of result.textStream) {
      shown += delta
      // Buffered on purpose: this path serves providers that cannot take a
      // structured output, so the stream is the model's raw JSON. It is
      // published below once parsed, never word by word into the bubble.
    }
    return { result, shown, plain: true, streamError: () => streamError }
  }

  let attempt: Awaited<ReturnType<typeof run>>
  try {
    // No `response_format`: the answer is a tool call now, so asking a provider
    // to also constrain the *text* buys nothing and Groq rejects the pair.
    attempt = await run(false)
  } catch (err: any) {
    throw providerFailure(err)
  }

  /**
   * Reads the step's tool calls. Groq refuses a JSON `response_format` on a
   * request that also carries tools, and the SDK surfaces that 400 as a bare
   * NoOutputGeneratedError. Retrying once without the structured output keeps
   * the tool loop alive; the answer then falls back to the streamed prose.
   */
  const readToolCalls = async () => {
    try {
      return (await attempt.result.toolCalls) ?? []
    } catch (err: any) {
      const cause = attempt.streamError() ?? err
      if (!isStructuredOutputUnsupported(cause)) throw providerFailure(cause)
      attempt = await run(false)
      return (await attempt.result.toolCalls) ?? []
    }
  }

  const calls = await readToolCalls()
  const answerCall = calls.find((call) => call.toolName === ANSWER_TOOL)

  if (!answerCall && calls.length > 0) {
    return {
      kind: 'tool-calls',
      calls: calls.map((call) => ({ id: call.toolCallId, name: call.toolName, args: call.input })),
    }
  }

  /**
   * No `answer` call and no data tool: the model replied in prose, which no
   * schema can enforce. Ask once more with a tool choice it cannot ignore.
   * That is the enforcement — one extra round trip, only for a provider or a
   * model that ignores the instruction.
   */
  const forceAnswer = async () => {
    const forced = streamText({
      model: provider(config.model),
      system: `${system}\n\nقدّم ردك الآن باستخدام أداة «${ANSWER_TOOL}» فقط، ومتكتبش نص حر.`,
      messages,
      tools: { [ANSWER_TOOL]: answerTool() },
      toolChoice: { type: 'tool', toolName: ANSWER_TOOL },
      maxRetries: 1,
    })
    const forcedCalls = (await forced.toolCalls) ?? []
    const call = forcedCalls.find((entry) => entry.toolName === ANSWER_TOOL)
    if (!call) {
      throw ApplicationFailure.nonRetryable('الموديل مارجّعش رد', 'EmptyReply')
    }
    return call
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
  const reply = readAnswer(finalCall.input)

  // The whole reply arrives inside the tool call, so the bubble is filled once
  // instead of token by token. That is the cost of enforcement, and it is what
  // stops a JSON payload ever reaching the chat.
  publishText(input.turnId, reply.text)

  return { kind: 'answer', reply, promptTokens, completionTokens, degraded: false }
}

/**
 * Rebuilds the SDK message array from plain JSON. Tool calls and their results
 * are stored as flat records in the workflow, because a workflow payload has to
 * stay serialisable and version-independent.
 */
function buildMessages(
  history: { role: 'user' | 'assistant'; content: string }[],
  exchanges: { id: string; name: string; args: unknown; data: unknown }[],
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
        output: { type: 'json', value: exchange.data },
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

function readAnswer(input: unknown): AssistantReply {
  const parsed = AssistantReplySchema.safeParse(input)
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable('رد المساعد غير مطابق للمخطط', 'ValidationError', {
      issues: parsed.error.flatten(),
    })
  }
  return parsed.data
}

function providerFailure(err: any): Error {
  const status = Number(err?.statusCode ?? err?.status ?? 0)
  const message = String(err?.message ?? err?.responseBody ?? 'تعذّر الاتصال بالمزوّد')
  if (status === 401 || status === 403 || /invalid.*key|unauthor/i.test(message)) {
    return ApplicationFailure.nonRetryable('مفتاح API مرفوض — راجع المفتاح في الإعدادات', 'ProviderAuth')
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
    throw ApplicationFailure.nonRetryable(`أداة غير معروفة: ${input.name}`, 'UnknownTool')
  }

  publishStatus(input.turnId, def.name)

  let raw: unknown
  try {
    raw = await def.run(input.args as any, { turnId: input.turnId, cards: [], now: new Date() })
  } catch (err: any) {
    throw ApplicationFailure.nonRetryable(err?.message || 'تعذّر تنفيذ الأداة', 'ToolFailed')
  }

  const parsed = ToolOutputSchema.safeParse(raw)
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      `نتيجة الأداة ${def.name} غير صالحة`,
      'ValidationError',
      { issues: parsed.error.flatten() },
    )
  }

  return {
    summary: parsed.data.summary,
    data: redact(parsed.data.data),
    cards: parsed.data.cards,
  }
}

export interface ValidateReplyInput {
  turnId: string
  reply: AssistantReply
  producedCards: ChatCard[]
}

export interface ValidateReplyOutput {
  reply: AssistantReply
  cards: ChatCard[]
}

/**
 * The wire contract gate. A reply that does not parse is a hard, visible
 * failure — `ValidationError` is configured as non-retryable on the workflow,
 * so it surfaces in the Temporal UI instead of being retried into a bill.
 */
export async function validateReply(input: ValidateReplyInput): Promise<ValidateReplyOutput> {
  const parsed = AssistantReplySchema.safeParse(input.reply)
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable('رد المساعد غير مطابق للمخطط', 'ValidationError', {
      issues: parsed.error.flatten(),
    })
  }
  if (!parsed.data.text.trim()) {
    throw ApplicationFailure.nonRetryable('رد المساعد فاضي', 'ValidationError')
  }
  return { reply: parsed.data, cards: resolveCards(parsed.data.cards, input.producedCards) }
}

export interface PersistTurnInput {
  threadId: string
  user: string
  text: string
  cards: ChatCard[]
  followups: string[]
  promptTokens: number
  completionTokens: number
}

export async function persistTurn(input: PersistTurnInput): Promise<{ messageId: string }> {
  const message = appendMessage(input.threadId, 'assistant', input.text, input.cards, input.followups)
  try {
    recordUsage({ promptTokens: input.promptTokens, completionTokens: input.completionTokens })
  } catch {
    // Usage accounting must never fail a turn.
  }
  return { messageId: message.id }
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
  validateReply,
  persistTurn,
  applyPendingAction,
  cancelPendingAction,
  expirePendingAction,
}

export type Activities = typeof activities
