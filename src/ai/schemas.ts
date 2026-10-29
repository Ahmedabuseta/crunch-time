// The assistant's wire contract.
//
// Everything the phone renders comes through here: the model picks card ids,
// never card contents, and every card is validated before it is stored or sent.
// A card that fails validation is dropped rather than rendered broken — the
// client is never handed a shape it does not know.
import { z } from 'zod'

export const CardToneSchema = z.enum(['good', 'warn', 'bad'])
export const RowToneSchema = z.enum(['up', 'down', 'warn', 'good'])

export type CardTone = z.infer<typeof CardToneSchema>
export type RowTone = z.infer<typeof RowToneSchema>

export const MetricItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  tone: CardToneSchema.optional(),
})

export const ActionRowSchema = z.object({
  label: z.string(),
  /** Present for before → after rows. */
  before: z.string().optional(),
  after: z.string().optional(),
  /** Present for a single-value row. */
  value: z.string().optional(),
  tone: RowToneSchema.optional(),
})

export const ActionStatusSchema = z.enum(['proposed', 'executed', 'failed', 'cancelled', 'expired'])
export type ActionStatus = z.infer<typeof ActionStatusSchema>

/**
 * Cards are built server-side from tool output. `report` carries the raw
 * backend report: the phone runs its existing `formatReport` + `ReportView`
 * over it, so an assistant table and a Reports-tab table are the same thing.
 */
export const ChatCardSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('report'), title: z.string(), report: z.unknown() }),
  z.object({ kind: z.literal('metrics'), title: z.string().optional(), items: z.array(MetricItemSchema).max(12) }),
  z.object({
    kind: z.literal('table'),
    title: z.string(),
    columns: z.array(z.string()).max(5),
    rows: z.array(z.array(z.string())).max(50),
  }),
  z.object({
    kind: z.literal('action'),
    actionId: z.string(),
    title: z.string(),
    subject: z.string(),
    status: ActionStatusSchema,
    rows: z.array(ActionRowSchema).max(8),
    /** What the world looks like after confirming — computed, never model-written. */
    result: z.string(),
    warning: z.string().optional(),
  }),
])

export type ChatCard = z.infer<typeof ChatCardSchema>
export type ActionCard = Extract<ChatCard, { kind: 'action' }>

/**
 * What the model is allowed to produce. Deliberately tiny:
 * - `text` is the only prose it writes.
 * - `cards` are ids of cards the tools already produced, in the order it wants
 *   them shown. An id that does not exist is dropped by `resolveCards`.
 */
export const AssistantReplySchema = z.object({
  text: z.string().min(1).max(800),
  cards: z.array(z.string()).max(3).default([]),
  followups: z.array(z.string().min(1).max(60)).max(3).default([]),
})

export type AssistantReply = z.infer<typeof AssistantReplySchema>

/** The validated payload the phone receives and persists. */
export const ValidatedReplySchema = z.object({
  messageId: z.string(),
  text: z.string().min(1),
  cards: z.array(ChatCardSchema).max(3),
  followups: z.array(z.string()).max(3),
})

export type ValidatedReply = z.infer<typeof ValidatedReplySchema>

export const ToolOutputSchema = z.object({
  /** Compact JSON — the only thing the model sees. */
  data: z.unknown(),
  /** One Arabic line, used for the tool trace and as a fallback bubble. */
  summary: z.string().max(300),
  cards: z.array(ChatCardSchema).max(2).default([]),
})

export type ToolOutput = z.infer<typeof ToolOutputSchema>

/**
 * Keeps a model-chosen card list honest: unknown ids disappear, duplicates
 * collapse, and the order the model asked for is preserved.
 */
export function resolveCards(ids: readonly string[], produced: readonly ChatCard[]): ChatCard[] {
  const byId = new Map(produced.map((card, index) => [cardId(card, index), card]))
  const seen = new Set<string>()
  const out: ChatCard[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    const card = byId.get(id)
    if (!card) continue
    seen.add(id)
    out.push(card)
    if (out.length === 3) break
  }
  // Nothing the model chose survived — show what the tools found rather than
  // an empty answer with data sitting behind it.
  return out.length > 0 ? out : produced.slice(0, 3)
}

/** Stable id for a card. Actions carry their own; others are positional. */
export function cardId(card: ChatCard, index: number): string {
  return card.kind === 'action' ? card.actionId : `card-${index}`
}
