// One chat turn, as a workflow.
//
// The loop lives here and nowhere else: model step → tool runs → model step …
// Every iteration is a durable activity in the history, so a turn that fails
// halfway is visible in the Temporal UI with the exact tool output it had.
//
// The workflow stays deterministic: it never reads the clock, never touches the
// database and never talks to the provider directly. Durations are measured in
// the activities; the trace timestamp comes from `loadContext`.
import { proxyActivities } from '@temporalio/workflow'
import type { Activities } from '../activities'
import { cardId, type ChatCard } from '../schemas'
import {
  MAX_STEPS,
  MAX_CALLS_PER_STEP,
  MAX_TOOL_CALLS,
  MAX_CONSECUTIVE_FAILURES,
  MAX_EXTRA_TOOLS,
  callSignature,
  duplicateResult,
  fallbackAnswer,
  planCalls,
  toolFailed,
  type ToolExchange,
  type ToolCall,
} from '../loop'
import type { TraceCall, TurnTrace } from '../trace'

export { MAX_STEPS }

// Non-retryable by type on purpose: a schema failure, a rejected key or an
// unknown tool will not fix itself, and retrying them just bills the owner.
const acts = proxyActivities<Activities>({
  startToCloseTimeout: '90 seconds',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '20s',
    maximumAttempts: 4,
    nonRetryableErrorTypes: [
      'ValidationError',
      'ConfigError',
      'ProviderAuth',
      'UnknownTool',
      'ToolFailed',
      'EmptyReply',
    ],
  },
})

export interface TurnInput {
  turnId: string
  threadId: string
  message: string
}

export interface TurnResult {
  messageId: string
  text: string
  cards: ChatCard[]
  followups: string[]
  promptTokens: number
  completionTokens: number
  /** True when the model's structured output failed and the prose was used. */
  degraded: boolean
}

export async function assistantTurn(input: TurnInput): Promise<TurnResult> {
  const context = await acts.loadContext({ threadId: input.threadId })
  // The user turn is already persisted by the HTTP layer before this workflow
  // starts, so it is part of the history `loadContext` returned.
  const history = context.messages
  const produced: ChatCard[] = []
  const exchanges: ToolExchange[] = []
  const extraTools = new Set<string>()
  const seen = new Set<string>()
  const traceCalls: TraceCall[] = []

  let promptTokens = 0
  let completionTokens = 0
  let promptChars = 0
  let promptVersion = ''
  let callsUsed = 0
  let consecutiveFailures = 0
  let repaired = false
  let pendingRepair: string[] | null = null
  let unknown: string[] = []
  let steps = 0

  const turnActionIds = () =>
    produced
      .filter((card): card is Extract<ChatCard, { kind: 'action' }> => card.kind === 'action')
      .map((card) => card.actionId)

  const writeTrace = async (degraded: boolean) => {
    const trace: TurnTrace = {
      turnId: input.turnId,
      threadId: input.threadId,
      promptVersion,
      message: input.message,
      startedAt: context.startedAt,
      durationMs: 0,
      steps,
      calls: traceCalls,
      promptTokens,
      completionTokens,
      promptChars,
      degraded,
      unknownNumbers: unknown,
    }
    await acts.persistTrace({ trace })
  }

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const isLast = step === MAX_STEPS - 1
    const out = await acts.modelStep({
      turnId: input.turnId,
      facts: context.facts,
      history,
      exchanges,
      cardIds: produced.map((card, index) => cardId(card, index)),
      step,
      maxSteps: MAX_STEPS,
      message: input.message,
      extraTools: [...extraTools],
      forceAnswer: isLast || pendingRepair !== null,
      repair: pendingRepair ?? undefined,
    })

    steps += 1
    promptChars = Math.max(promptChars, out.promptChars)
    promptVersion = out.promptVersion
    promptTokens += out.promptTokens
    completionTokens += out.completionTokens
    pendingRepair = null

    if (out.kind === 'tool-calls') {
      const capped = out.calls.slice(0, MAX_CALLS_PER_STEP)
      const { run, skipped } = planCalls(capped, seen, MAX_TOOL_CALLS - callsUsed)

      // Answer a repeated call from the earlier result instead of paying for it
      // twice. It still has to be a tool result so the SDK message stays valid.
      for (const skip of skipped) {
        const signature = callSignature(skip.call.name, skip.call.args)
        const previous = exchanges.find((entry) => callSignature(entry.name, entry.args) === signature)
        const synthetic = duplicateResult(previous)
        exchanges.push({
          id: skip.call.id,
          name: skip.call.name,
          args: skip.call.args,
          data: synthetic.data,
          summary: synthetic.summary,
        })
        traceCalls.push({ name: skip.call.name, ms: 0, ok: true, duplicate: true })
      }

      if (run.length === 0) continue

      const batch = await acts.runTools({
        turnId: input.turnId,
        calls: run,
        turnActionIds: turnActionIds(),
      })

      for (let index = 0; index < batch.results.length; index += 1) {
        const result = batch.results[index]
        const call = run[index] as ToolCall
        produced.push(...result.cards)
        exchanges.push({
          id: result.id,
          name: result.name,
          args: call.args,
          data: result.data,
          summary: result.summary,
          ms: result.ms,
        })
        seen.add(callSignature(result.name, call.args))
        callsUsed += 1

        const failed = toolFailed({ data: result.data })
        consecutiveFailures = failed ? consecutiveFailures + 1 : 0
        traceCalls.push({ name: result.name, ms: result.ms, ok: !failed, duplicate: false })

        if (result.name === 'find_tools') {
          const found = (result.data as { tools?: { name?: unknown }[] } | null)?.tools
          if (Array.isArray(found)) {
            for (const entry of found) {
              const name = String(entry?.name ?? '').trim()
              if (!name || extraTools.size >= MAX_EXTRA_TOOLS) continue
              extraTools.add(name)
            }
          }
        }
      }

      // Two refusals in a row: stop probing and answer from what actually came
      // back. A small model will otherwise retry the same broken call until the
      // step budget is gone.
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break

      continue
    }

    const validated = await acts.validateReply({
      turnId: input.turnId,
      reply: out.reply,
      producedCards: produced,
      exchanges,
    })
    unknown = validated.unknown

    // One repair round: the answer invented a number. The next step is forced
    // to answer again with the exact figures called out.
    if (unknown.length > 0 && !repaired && step < MAX_STEPS - 1) {
      repaired = true
      pendingRepair = unknown
      continue
    }

    // Still wrong (or no step left to fix it): keep the data cards and answer
    // from the tools' own summaries. An invented figure never reaches the chat.
    //
    // A provider that fails to call `answer` after a real tool run is the same
    // situation: the canned "needs context" line would hide data the turn
    // actually fetched, so the summary is the answer.
    const useFallback = unknown.length > 0 || (out.degraded && exchanges.length > 0)
    const text = useFallback ? fallbackAnswer(exchanges) : validated.reply.text
    const cards = unknown.length > 0 ? produced.slice(-3) : validated.cards
    const followups = useFallback ? [] : validated.reply.followups
    const degraded = out.degraded || unknown.length > 0

    const saved = await acts.persistTurn({
      turnId: input.turnId,
      threadId: input.threadId,
      user: input.message,
      text,
      cards,
      followups,
      promptTokens,
      completionTokens,
    })

    await writeTrace(degraded)

    return {
      messageId: saved.messageId,
      text,
      cards,
      followups,
      promptTokens,
      completionTokens,
      degraded,
    }
  }

  // Out of steps (or braked): answer from what the tools actually returned
  // instead of discarding a turn that did real work.
  const text = fallbackAnswer(exchanges)
  const cards = produced.slice(-3)
  const saved = await acts.persistTurn({
    turnId: input.turnId,
    threadId: input.threadId,
    user: input.message,
    text,
    cards,
    followups: [],
    promptTokens,
    completionTokens,
  })

  await writeTrace(true)

  return {
    messageId: saved.messageId,
    text,
    cards,
    followups: [],
    promptTokens,
    completionTokens,
    degraded: true,
  }
}
