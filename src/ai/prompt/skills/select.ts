// Picking the playbook for one message.
//
// Deterministic, like the tool router: the same normalisation, the same keyword
// approach, no model call. A skill is selected because the owner's words belong
// to its domain, not because a classifier thought so — which is the only way to
// explain to a shop owner why an answer was shaped the way it was.
//
// `general` is always first. Scope, tone and the defaults are never optional, so
// there is no message that gets a bare domain skill with no frame around it.
import { words } from '../../guard/arabic'
import { withoutArticle } from '../../tools/fuzzy'
import { GENERAL, DOMAIN_SKILLS } from './index'
import type { Skill } from './types'

/**
 * How many playbooks one turn may carry.
 *
 * Two is the useful maximum in practice: a message can ask about a price *and*
 * a shortage, and both rules are worth having. Three starts competing with the
 * tool schemas for an 8k-TPM budget, and the third is almost always a keyword
 * accident rather than a real second intent.
 */
export const MAX_SKILLS = 2

/**
 * Words more than one domain claims. They still count, but half — a shared word
 * is weak evidence for either side, and without the discount «تكلفة» lets
 * recipes borrow a question that was really about profit.
 */
function sharedWords(): Set<string> {
  const owners = new Map<string, number>()
  for (const skill of DOMAIN_SKILLS) {
    for (const trigger of new Set(skill.triggers.map((word) => words(word).map((w) => withoutArticle(w)).join(' ')))) {
      owners.set(trigger, (owners.get(trigger) ?? 0) + 1)
    }
  }
  return new Set([...owners.entries()].filter(([, count]) => count > 1).map(([word]) => word))
}

const SHARED = sharedWords()

/** A word without its Arabic definite article, so «الجرد» matches «جرد». */
const bare = (word: string) => withoutArticle(word)

/** Triggers as word sets, normalised once at module load. */
const normalized = DOMAIN_SKILLS.map((skill) => ({
  skill,
  triggers: [...new Set(
    skill.triggers
      .map((trigger) => words(trigger).map(bare).join(' '))
      .filter(Boolean),
  )],
}))

/**
 * The playbooks for one message: `general` plus the best-matching domains.
 *
 * Matching is on **whole words**, not substrings. Substring matching made «بيع»
 * fire inside «مبيعات» and let a two-character fragment outscore the word the
 * owner actually meant, so "بعت بكام النهاردة" could load the pricing playbook
 * instead of sales.
 *
 * Scoring then weights by how specific the word is: a trigger that only one
 * skill owns counts more than one several skills share («تكلفة» belongs to both
 * sales and recipes). A message that names one domain's vocabulary twice wins
 * over one that brushed against another's once.
 *
 * Ties fall back to `SKILLS` order, which lists the specific domains before the
 * broad one.
 */
export function selectSkills(message: string, limit = MAX_SKILLS): Skill[] {
  const tokens = new Set(words(message).map(bare))
  const cap = Math.max(1, Math.trunc(limit))

  if (tokens.size === 0) return [GENERAL]

  const scored = normalized
    .map(({ skill, triggers }) => {
      const hits = triggers.filter((trigger) => {
        const triggerWords = trigger.split(' ')
        return triggerWords.every((word) => tokens.has(word))
      })
      // A shared word counts half: two domains claiming it means it says less
      // about which one the owner meant.
      const score = hits.reduce((total, trigger) => total + (SHARED.has(trigger) ? 0.5 : 1), 0)
      return { skill, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const picked = scored.slice(0, Math.max(0, cap - 1)).map((entry) => entry.skill)
  return [GENERAL, ...picked]
}

/** The ids of the selected skills, for the turn trace. */
export function skillIds(skills: readonly Skill[]): string[] {
  return skills.map((skill) => skill.id)
}
