// System prompt composition.
//
// The prompt is rebuilt on every model step: only this module knows the
// restaurant facts, which playbook the owner's message belongs to, how many
// steps are left, which tools are exposed and whether the previous answer needs
// repair. `PROMPT_VERSION` is written into the turn trace so a prompt change can
// be compared against past turns.
//
// The order is deliberate:
//   1. role      — who it is and what it is accountable for, before any rule
//   2. invariants — the four rules true of every turn
//   3. skills    — the rules and one worked example for *this* domain
//   4. loop      — how many steps are left
//   5. tools     — only the schemas exposed on this step
//   … then anything corrective (schema, repair, steer) last, where a small model
//   actually reads it.
import type { ToolDef } from '../tools/types'
import { identitySection, type IdentityFacts } from './identity'
import { rulesSection, skillSection } from './rules'
import { GENERAL } from './skills'
import { selectSkills, skillIds } from './skills/select'
import type { Skill } from './skills/types'
import { toolGuideSection } from './tools'
import {
  loopSection,
  outputSection,
  repairSection,
  schemaSection,
  sequenceSection,
  stateSection,
  steerSection,
  summarySection,
  type TurnState,
} from './turn'

/** 2.0.0: the prompt gained a role and lost 19 always-on rules. */
export const PROMPT_VERSION = '2.0.0'

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
  /** The owner's message: it decides which playbooks load. */
  message?: string
  /**
   * Overrides automatic selection. Used by tests and by a future caller that
   * already knows the domain.
   */
  skills?: Skill[]
  /** Numbers the previous answer invented; drives one repair round. */
  repair?: string[]
  /** The reviewer asked the model to change course. Rendered last. */
  steer?: string
  /** Bounded DDL digest, only when `query_database` is exposed this step. */
  schema?: string
}

/** The playbooks this turn carries. Exported so the trace can record them. */
export function skillsFor(ctx: Pick<PromptContext, 'message' | 'skills'>): Skill[] {
  if (ctx.skills) return ctx.skills
  return ctx.message ? selectSkills(ctx.message) : [GENERAL]
}

/** Ids of the playbooks a prompt was built from, for the turn trace. */
export function promptSkillIds(ctx: Pick<PromptContext, 'message' | 'skills'>): string[] {
  return skillIds(skillsFor(ctx))
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const skills = skillsFor(ctx)

  const sections: string[][] = [
    identitySection(ctx.facts),
    rulesSection(),
    // The domain playbooks, `general` first. Each brings its own worked example.
    ...skills.map((skill, index) => skillSection(skill, index)),
    loopSection(ctx.state),
    stateSection(ctx.state),
    toolGuideSection(ctx.tools),
  ]

  // The digest costs a few hundred tokens, so it only rides along on the steps
  // where the model can actually run SQL.
  if (ctx.schema && ctx.tools.some((tool) => tool.name === 'query_database')) {
    sections.push(schemaSection(ctx.schema))
  }

  if (ctx.tools.some((tool) => tool.name === 'propose_actions')) sections.push(sequenceSection())

  sections.push(outputSection(ctx.followupAllowed))

  if (ctx.repair && ctx.repair.length > 0) sections.push(repairSection(ctx.repair))
  if (ctx.facts.conversationSummary?.trim()) sections.push(summarySection(ctx.facts.conversationSummary))

  // Last, so it is the freshest instruction in the prompt.
  if (ctx.steer?.trim()) sections.push(steerSection(ctx.steer))

  return sections.map((lines) => lines.join('\n')).join('\n\n')
}

export type { TurnState, IdentityFacts, Skill }
export { GENERAL }
