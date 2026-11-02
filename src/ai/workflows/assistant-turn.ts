// One chat turn, as a workflow.
//
// The loop lives here and nowhere else: model step → tool runs → model step …
// Every iteration is a durable activity in the history, so a turn that fails
// halfway is visible in the Temporal UI with the exact tool output it had.
import { proxyActivities } from '@temporalio/workflow'
import type { Activities } from '../activities'
import { cardId, type ChatCard } from '../schemas'

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

/** Seven tool rounds plus a forced answer. Bounds latency and spend. */
export const MAX_STEPS = 8

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
  const exchanges: { id: string; name: string; args: unknown; data: unknown; summary?: string }[] = []
  let promptTokens = 0
  let completionTokens = 0

  for (let step = 0; step < MAX_STEPS; step++) {
    const out = await acts.modelStep({
      turnId: input.turnId,
      system: context.system,
      history,
      exchanges,
      cardIds: produced.map((card, index) => cardId(card, index)),
      step,
      message: input.message,
      forceAnswer: step === MAX_STEPS - 1,
    })

    if (out.kind === 'tool-calls') {
      promptTokens += out.promptTokens
      completionTokens += out.completionTokens
      for (const call of out.calls) {
        const result = await acts.runTool({ turnId: input.turnId, name: call.name, args: call.args })
        produced.push(...result.cards)
        exchanges.push({ id: call.id, name: call.name, args: call.args, data: result.data, summary: result.summary })
      }
      continue
    }

    promptTokens += out.promptTokens
    completionTokens += out.completionTokens

    const validated = await acts.validateReply({
      turnId: input.turnId,
      reply: out.reply,
      producedCards: produced,
    })

    const saved = await acts.persistTurn({
      threadId: input.threadId,
      user: input.message,
      text: validated.reply.text,
      cards: validated.cards,
      followups: validated.reply.followups,
      promptTokens,
      completionTokens,
    })

    return {
      messageId: saved.messageId,
      text: validated.reply.text,
      cards: validated.cards,
      followups: validated.reply.followups,
      promptTokens,
      completionTokens,
      degraded: out.degraded,
    }
  }

  // Out of steps. Answer from what the tools actually returned instead of
  // discarding a turn that did real work.
  const summaries = exchanges
    .map((exchange) => exchange.summary)
    .filter((summary): summary is string => Boolean(summary?.trim()))
    .slice(-3)
  const text = summaries.length > 0
    ? `جمعت البيانات دي: ${summaries.join(' · ')}`.slice(0, 780)
    : 'محتاج توضيح أكتر عشان أقدر أجاوب.'
  const cards = produced.slice(-3)
  const saved = await acts.persistTurn({
    threadId: input.threadId,
    user: input.message,
    text,
    cards,
    followups: [],
    promptTokens,
    completionTokens,
  })

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
