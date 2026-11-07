// The per-step half of the prompt: how many steps are left, what already ran,
// how to answer, and the repair note when the previous answer invented a
// number. Keeping this out of rules.ts means the model sees the loop state on
// every step instead of a static rule it can drift away from.

export interface TurnState {
  step: number
  maxSteps: number
  /** Tool calls already run this turn, in order. */
  ran: { name: string; summary: string }[]
  /** Tool calls that returned an error: the turn's dead ends. */
  failed: { name: string; summary: string }[]
  cardIds: string[]
}

const MAX_RAN_LINES = 4
const MAX_RAN_CHARS = 800

function remaining(state: TurnState): number {
  return Math.max(0, state.maxSteps - state.step)
}

export function loopSection(state: TurnState): string[] {
  const lines = [
    '## عقد الدور',
    `- عندك ${remaining(state)} خطوة من ${state.maxSteps}. كل خطوة: تنادي أدوات أو تجاوب بـ answer.`,
    '- لو محتاج أكتر من رقم مستقل، نادي كل الأدوات في نفس الخطوة — مش واحدة ورا التانية.',
    '- أداة رجعت خطأ: صحّح المدخلات وجرّب مرة واحدة. نفس الخطأ تاني = غيّر الطريقة أو قول إنك مش قادر.',
    '- ممنوع تكرر نفس الاستدعاء بنفس المدخلات؛ النتيجة القديمة موجودة في «حالة الدور».',
    '- لما البيانات تكفي، نادي answer فوراً. متكملش خطوات زيادة عشان «تتأكد».',
  ]

  if (state.step >= state.maxSteps - 1) {
    lines.push('- دي آخر خطوة: ممنوع تنادي أداة بيانات. لازّم تجاوب بـ answer الآن.')
  } else if (state.step >= state.maxSteps - 2) {
    lines.push('- فاضل خطوتين تقريباً: ابدأ تجهّز الإجابة من البيانات اللي معاك.')
  }

  return lines
}

export function stateSection(state: TurnState): string[] {
  const lines = ['## حالة الدور', `الخطوة ${state.step + 1} من ${state.maxSteps} — فاضل ${remaining(state)}.`]

  const ran = state.ran.slice(-MAX_RAN_LINES)
  if (ran.length > 0) {
    lines.push('أدوات اتنادت:')
    let used = 0
    for (const entry of ran) {
      const summary = String(entry.summary ?? '').trim().slice(0, 200)
      if (!summary) continue
      const line = `- ${entry.name} → ${summary}`
      if (used + line.length > MAX_RAN_CHARS) break
      lines.push(line)
      used += line.length
    }
  } else {
    lines.push('لسه مفيش أدوات اتنادت في الدور ده.')
  }

  const failed = state.failed ?? []
  if (failed.length > 0) {
    lines.push('', 'طرق مسدودة — متعدهاش تاني بنفس المدخلات:')
    for (const entry of failed.slice(-MAX_RAN_LINES)) {
      const summary = String(entry.summary ?? '').trim().slice(0, 160)
      if (!summary) continue
      lines.push(`- ${entry.name} فشلت: ${summary}`)
    }
  }

  lines.push(
    state.cardIds.length > 0
      ? `كروت متاحة في الرد ده: ${state.cardIds.join(', ')}`
      : 'مفيش كروت متاحة في الرد ده.',
  )

  return lines
}

export function sequenceSection(): string[] {
  return [
    '## التعديلات المتسلسلة',
    '- لو الطلب فيه أكتر من تغيير: نادي أدوات التغيير كلها في خطوة واحدة، وبعد ما ترجع نادي propose_actions في الخطوة اللي بعدها بـ action_ids.',
    '- اعرض كارت الخطة بس، مش كروت الخطوات. لو التغيير واحد، سيب كارت الإجراء العادي.',
    '- الخطة بتتنفّذ بالترتيب وبتقف عند أول خطأ. متوعدش إن الخطوات كلها هتنجح.',
  ]
}

export function outputSection(followupAllowed: boolean): string[] {
  return [
    '## الشكل',
    'الرد بيتبعت عن طريق استدعاء أداة `answer` — مش نص حر ومش JSON في الشات.',
    '- `text`: جملة أو جملتين بالعربي المصري.',
    '- `cards`: ids الكروت اللي عايز تعرضها بالترتيب (الأهم الأول)، بحد أقصى 3. لو مفيش كارت مفيد سيبها فاضية. لو الأداة أنتجت كارت إجراء، اعرضه دايماً.',
    followupAllowed
      ? '- `followups`: من 2 لـ 3 اقتراحات قصيرة (أقل من 60 حرف) لسؤال العميل بعده.'
      : '- `followups`: سيبها فاضية.',
    'لو كتبت الرد كنص عادي بدل ما تنادي `answer`، هيتجاهل وهيتطلب منك تاني — فاستخدم الأداة دايماً.',
  ]
}

export function repairSection(unknown: string[]): string[] {
  return [
    '## تصحيح مطلوب',
    `الأرقام دي مش موجودة في نتائج الأدوات: ${unknown.join('، ')}.`,
    'اكتب الرد من جديد. استخدم أرقام من النتائج بس، أو شيل الرقم لو مش متأكد منه. ممنوع تحسب رقم جديد بنفسك.',
  ]
}

export function summarySection(summary: string): string[] {
  return ['## سياق المحادثة', String(summary).slice(0, 600)]
}

/**
 * The reviewer's note for the next step. Deliberately a separate, last section:
 * the model has just been asked to change course, and an instruction at the
 * bottom of the prompt is the one small models follow most reliably.
 */
export function steerSection(note: string): string[] {
  return ['## ملاحظة المراجع', String(note).trim().slice(0, 280)]
}

/**
 * The database shape, for the steps where `query_database` is on offer.
 *
 * Only rendered when SQL is actually callable: the digest is a few hundred
 * tokens, and every other turn should not pay for it.
 */
export function schemaSection(digest: string): string[] {
  const body = String(digest ?? '').trim()
  if (!body) return []
  return ['## مخطط قاعدة البيانات', body]
}
