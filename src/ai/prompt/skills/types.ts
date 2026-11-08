// What a skill is.
//
// Today every turn carried all 23 rules, so a question about the price of one
// product paid for six rules about stocktakes. A skill is the narrow half of
// that: the rules that only matter in one domain, one worked example in the
// shop's own voice, and the tools that domain reaches for first.
//
// A skill is data, not code — the router picks it, the prompt renders it, and
// nothing about it can run.
export interface Skill {
  /** Stable id, written into the turn trace so a change can be measured. */
  id: string
  /** Arabic label for the trace and the review page. */
  name: string
  /**
   * Normalised words and phrases that select this skill. Matched against
   * `normalizeArabic(message)` exactly like the tool router, so «بكام» and
   * «بكم» are the same trigger.
   */
  triggers: string[]
  /** Narrow rules. Rendered as a numbered list under the skill's heading. */
  rules: string[]
  /** One worked example: a question, the tool call, the answer's shape. */
  example: string[]
  /** Tools this domain reaches for, most specific first. Used for the trace. */
  prefer: string[]
}
