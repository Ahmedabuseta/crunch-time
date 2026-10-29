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

/** Four tool rounds plus the answer. Bounds both latency and spend. */
export const MAX_STEPS = 5

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
  const exchanges: { id: string; name: string; args: unknown; data: unknown }[] = []
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
    })

    if (out.kind === 'tool-calls') {
      for (const call of out.calls) {
        const result = await acts.runTool({ turnId: input.turnId, name: call.name, args: call.args })
        produced.push(...result.cards)
        exchanges.push({ id: call.id, name: call.name, args: call.args, data: result.data })
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

  // Out of steps. Answer honestly with whatever the tools found rather than
  // returning a half-finished loop to the phone.
  const text = produced.length > 0
    ? 'جمعت البيانات دي، بس محتاج أسألك توضيح أكتر عشان أكمّل.'
    : 'محتاج توضيح أكتر عشان أقدر أجاوب.'
  const cards = produced.slice(0, 3)
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
