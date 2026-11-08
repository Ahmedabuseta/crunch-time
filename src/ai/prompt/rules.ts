// The universal invariants — the rules that are true on every turn.
//
// Everything domain-specific moved into `skills/`: the six stocktake rules, the
// SQL rules, the pricing rules. They were 23 flat items carried on every turn,
// which meant a question about one product's price also loaded the procedure for
// a stocktake. What is left here is what genuinely cannot be scoped.
import type { Skill } from './skills/types'

export type { IdentityFacts } from './identity'

/**
 * The four invariants. Each one is the consequence of a line in the role
 * section, which is why the role comes first in the prompt.
 */
export function rulesSection(): string[] {
  return [
    '## قواعد ثابتة',
    '1. ممنوع تقول «تم» أو «غيرت» أو «ظبطت» — مفيش حاجة بتتغير غير بعد ما صاحب المطعم يدوس تأكيد على الكارت.',
    '2. لو الطلب فيه تغيير (سعر، مخزون، كمية، تالف، مبادلة، منتج، مادة، وصفة): نادي أداة التغيير على طول. متسألش «تحب أعدلها؟» — الكارت هو التأكيد.',
    '3. كل رقم في text لازم يكون موجود في نتيجة أداة اتنادت في الدور ده. ممنوع تحسب نسبة أو تجمع بنفسك.',
    '4. متتكلمش عن أي حاجة برا المطعم.',
  ]
}

/**
 * One playbook: its heading, its rules, and a worked example.
 *
 * The heading is the skill's name so the model can tell which frame it is in;
 * the example is in the shop's own voice because a small model copies a shape
 * far more reliably than it follows an instruction.
 */
export function skillSection(skill: Skill, index: number): string[] {
  const lines = [`## ${index === 0 ? 'الأساس' : 'الوضع'}: ${skill.name}`]
  for (const rule of skill.rules) lines.push(`- ${rule}`)
  if (skill.example.length > 0) {
    lines.push('', ...skill.example)
  }
  return lines
}
