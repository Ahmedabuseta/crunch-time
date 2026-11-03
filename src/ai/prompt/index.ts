// System prompt composition.
//
// The prompt is rebuilt on every model step: only this module knows the
// restaurant facts, how many steps are left, which tools are exposed and
// whether the previous answer needs repair. `PROMPT_VERSION` is written into
// the turn trace so a prompt change can be compared against past turns.
import type { ToolDef } from '../tools/types'
import { identitySection, rulesSection, toneExamples, type IdentityFacts } from './rules'
import { toolGuideSection } from './tools'
import {
  loopSection,
  outputSection,
  repairSection,
  sequenceSection,
  stateSection,
  summarySection,
  type TurnState,
} from './turn'

export const PROMPT_VERSION = '1.0.0'

export interface TurnFacts extends IdentityFacts {
  /** Folded one-liner from the stored thread summary, when there is one. */
  conversationSummary: string | null
}

export interface PromptContext {
  facts: TurnFacts
  state: TurnState
  /** Only the tools exposed on this step. */
  tools: ToolDef[]
  followupAllowed: boolean
  /** Numbers the previous answer invented; drives one repair round. */
  repair?: string[]
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const sections: string[][] = [
    identitySection(ctx.facts),
    rulesSection(),
    loopSection(ctx.state),
    stateSection(ctx.state),
    toolGuideSection(ctx.tools),
  ]

  if (ctx.tools.some((tool) => tool.name === 'propose_actions')) sections.push(sequenceSection())

  sections.push(outputSection(ctx.followupAllowed))

  if (ctx.repair && ctx.repair.length > 0) sections.push(repairSection(ctx.repair))
  if (ctx.facts.conversationSummary?.trim()) sections.push(summarySection(ctx.facts.conversationSummary))

  sections.push(toneExamples())

  return sections.map((lines) => lines.join('\n')).join('\n\n')
}

export type { TurnState, IdentityFacts }
