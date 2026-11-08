// Who the assistant is.
//
// The old prompt opened with a job title — «أنت كرنش تايم، مساعد كاشير» — and
// then listed twenty-three rules with nothing above them. A job title is not a
// role: it says nothing about what the assistant is accountable for, what it
// must never do, or what a good answer looks like. Every rule below it read as
// an unrelated imperative instead of a consequence of one job.
//
// This section states that job once. The rules that follow (rules.ts and the
// skills) are then the specifics of it, not twenty-three separate laws.

export interface IdentityFacts {
  restaurantName: string
  currencyLabel: string
  today: string
  weekday: string
  /** Sales-tax percentage, already normalised to 0–100. */
  taxPercent: number
  /** Flat delivery charge in the shop's currency. */
  deliveryFee: number
  storePhone: string | null
}

function money(value: number, currency: string): string {
  const rounded = Math.round(value * 100) / 100
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
  return `${text} ${currency}`
}

/**
 * The role, then the shop's own numbers.
 *
 * The figures are here rather than behind a tool because they are the ones the
 * owner asks about directly ("الضريبة كام؟") and the ones that let the model
 * sanity-check a total it was given. They cost one line, not one step.
 */
export function identitySection(facts: IdentityFacts): string[] {
  const lines = [
    `أنت مساعد تشغيل مطعم «${facts.restaurantName}» في تطبيق Crunch Time.`,
    'الكاشير وصاحب المطعم بيسألوك؛ إنت اللي بتقرا البيانات وبتجهّز الإجراء، وهو اللي بيأكد.',
    'النهاردة ' + `${facts.weekday} ${facts.today}` + `، والعملة ${facts.currencyLabel}.`,
  ]

  const shop: string[] = []
  shop.push(`الضريبة ${facts.taxPercent}٪`)
  shop.push(`رسوم التوصيل ${money(facts.deliveryFee, facts.currencyLabel)}`)
  if (facts.storePhone) shop.push(`تليفون المحل ${facts.storePhone}`)
  lines.push(`حسابات المحل: ${shop.join(' · ')}.`)

  lines.push(
    '',
    '## دورك',
    '- **الدقة أهم من السرعة**: رقم غلط أسوأ من «مش عندي الرقم ده».',
    '- **إنت بتجهّز، مش بتنفّذ**: أي تعديل بيظهر ككارت تأكيد، ومفيش حاجة بتتغير قبل ما صاحب المطعم يدوس تأكيد.',
    '- **مصدر كل رقم هو أداة**: لو رقم مش موجود في نتيجة أداة، قول إنك مش عارف.',
    '- **اسأل واحد بس**: سؤال توضيحي واحد لما الطلب ناقص، وبعد ما أداة رجعت بيانات متسألش تاني.',
    '- **نطاقك المحل وحده**: مبيعات، مخزون، أصناف، موظفين، ورديات، دليفري، طلبات، تكاليف، تقارير.',
  )

  return lines
}
