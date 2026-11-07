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
  MAX_EXTRA_TOOLS,
  callSignature,
  fallbackAnswer,
  planCalls,
  shouldBrake,
  skippedResult,
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
  let totalFailures = 0
  let repaired = false
  let pendingRepair: string[] | null = null
  let pendingSteer: string | null = null
  let pendingBlock = false
  let unknown: string[] = []
  let steps = 0
  let reasoningChars = 0
  let firstTokenMs: number | null = null
  let steers = 0
  let blocks = 0

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
      reasoningChars,
      firstTokenMs,
      steers,
      blocks,
    }
    await acts.persistTrace({ trace })
  }

  /**
   * Runs one step activity and writes the trace before rethrowing.
   *
   * Without this, a turn that fails on its fourth model call leaves no JSONL
   * record at all — which is exactly the turn someone needs to debug. The error
   * still propagates: `ValidationError` and friends must stay visible.
   */
  const traced = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } catch (err) {
      await writeTrace(true)
      throw err
    }
  }

  for (let step = 0; step < MAX_STEPS; step += 1) {
    // The daily cap is checked here too, not just before the turn: one turn is
    // up to eight model calls, so a turn that starts just under the limit could
    // otherwise spend most of the cap by itself.
    if (step > 0 && !(await acts.budgetAllows()).allowed) break

    const isLast = step === MAX_STEPS - 1
    // The reviewer asked for an answer on the previous step. It is consumed
    // once, so a block never pins the rest of the turn.
    const blockNow = pendingBlock
    pendingBlock = false
    const out = await traced(() => acts.modelStep({
      turnId: input.turnId,
      facts: context.facts,
      history,
      exchanges,
      cardIds: produced.map((card, index) => cardId(card, index)),
      step,
      maxSteps: MAX_STEPS,
      message: input.message,
      extraTools: [...extraTools],
      forceAnswer: isLast || pendingRepair !== null || blockNow,
      repair: pendingRepair ?? undefined,
      steer: pendingSteer ?? undefined,
    }))

    steps += 1
    promptChars = Math.max(promptChars, out.promptChars)
    promptVersion = out.promptVersion
    promptTokens += out.promptTokens
    completionTokens += out.completionTokens
    reasoningChars += out.reasoningChars
    // The first token of the turn, not of the last step: that is the number
    // that tells "the model is slow" apart from "the tools are slow".
    if (firstTokenMs === null && out.firstTokenMs !== null) firstTokenMs = out.firstTokenMs
    // Charged now, not at the end of the turn: a turn that throws later has
    // already spent these tokens, and the cap has to see them.
    await acts.recordStepUsage({
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
    })
    pendingRepair = null
    // The note was rendered into this step's prompt; it is not repeated.
    pendingSteer = null

    if (out.kind === 'tool-calls') {
      const capped = out.calls.slice(0, MAX_CALLS_PER_STEP)
      const { run, skipped } = planCalls(capped, seen, MAX_TOOL_CALLS - callsUsed)

      // Answer a repeated call from the earlier result instead of paying for it
      // twice. It still has to be a tool result so the SDK message stays valid.
      for (const skip of skipped) {
        const signature = callSignature(skip.call.name, skip.call.args)
        const previous = exchanges.find((entry) => callSignature(entry.name, entry.args) === signature)
        const synthetic = skippedResult(skip.reason, previous)
        exchanges.push({
          id: skip.call.id,
          name: skip.call.name,
          args: skip.call.args,
          data: synthetic.data,
          summary: synthetic.summary,
        })
        traceCalls.push({ name: skip.call.name, ms: 0, ok: true, duplicate: skip.reason === 'duplicate' })
      }

      if (run.length === 0) continue

      // The tools and the reviewer run side by side. The reviewer only needs
      // the calls, so it costs no extra wall time: a bad step is caught while
      // its results are still being produced.
      const [batch, review] = await traced(() =>
        Promise.all([
          acts.runTools({
            turnId: input.turnId,
            calls: run,
            turnActionIds: turnActionIds(),
          }),
          acts.reviewStep({
            turnId: input.turnId,
            message: input.message,
            exchanges,
            stepCalls: run,
            stepResults: [],
            remainingSteps: MAX_STEPS - step,
          }),
        ]),
      )

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
        totalFailures = failed ? totalFailures + 1 : totalFailures
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

      // The reviewer's verdict, applied now that the step has settled.
      //
      // A block is deferred rather than breaking here: the step's results are
      // already paid for and are exactly what the answer should use, so the next
      // step is forced to answer with them. Breaking would discard them.
      if (review.usedModel) {
        promptTokens += review.promptTokens
        completionTokens += review.completionTokens
      }
      if (review.review.verdict === 'steer') {
        pendingSteer = review.review.note
        steers += 1
      } else if (review.review.verdict === 'block') {
        pendingSteer = review.review.note
        pendingBlock = true
        blocks += 1
        if (step >= MAX_STEPS - 2) break
      }

      // Two refusals in a row, or five across the turn: stop probing and answer
      // from what actually came back. A small model will otherwise retry a
      // broken call — or break a fresh one on every step — until the step budget
      // is gone.
      if (shouldBrake(consecutiveFailures, totalFailures)) break

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
    })

    await writeTrace(degraded)
    await acts.compactHistory({ threadId: input.threadId })

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
  })

  await writeTrace(true)
  await acts.compactHistory({ threadId: input.threadId })

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
