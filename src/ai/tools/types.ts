// The shape every tool shares.
//
// A tool returns three things to two different audiences: `data` for the model
// (compact JSON, no UI), `summary` for the trace and a fallback bubble, and
// `cards` for the phone. The activity pushes the cards into the turn's card
// list and hands the model only `data` — see `src/ai/activities/index.ts`.
import type { z } from 'zod'
import type { ChatCard, ToolOutput } from '../schemas'

export interface ToolContext {
  turnId: string
  /** Cards produced so far this turn, in call order. */
  cards: ChatCard[]
  now: Date
}

export interface ToolDef<I = any> {
  name: string
  /** Tells the model *when* to reach for it. One line, Arabic-friendly. */
  description: string
  schema: z.ZodType<I>
  /** Write tools create a pending action and never touch the database. */
  write: boolean
  run(args: I, ctx: ToolContext): Promise<ToolOutput>
}

/** Every tool in the registry, read and write. */
export type ToolRegistry = Map<string, ToolDef>

export function toolOutput(data: unknown, summary: string, cards: ChatCard[] = []): ToolOutput {
  return { data, summary, cards }
}
