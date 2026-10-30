// The pure half of the assistant: Arabic normalisation, the topic guard, the
// reply schemas and card resolution. No database, no Electron, no network.
import { describe, it, expect } from 'vitest'
import { normalizeArabic, words, isGreeting } from '../ai/guard/arabic'
import { appTermScore, looksOffTopic, isFollowUp, verdict, needsClassifier } from '../ai/guard/topic'
import {
  AssistantReplySchema,
  ChatCardSchema,
  ToolOutputSchema,
  ValidatedReplySchema,
  resolveCards,
  type ChatCard,
} from '../ai/schemas'
import { redact } from '../ai/tools'
import { normalizeBaseUrl } from '../../apps/mobile/lib/http'

describe('arabic normalisation', () => {
  it('strips diacritics and tatweel', () => {
    expect(normalizeArabic('مَبيعاتـــ')).toBe('مبيعات')
  })

  it('unifies alef, ya and ta marbuta', () => {
    expect(normalizeArabic('أصناف إضافات آلة')).toBe('اصناف اضافات اله')
    expect(normalizeArabic('وردىة')).toBe('ورديه')
  })

  it('lowercases latin text and collapses whitespace', () => {
    expect(normalizeArabic('  Hello   World  ')).toBe('hello world')
  })

  it('tokenises away punctuation', () => {
    // «ج.م» splits on the dot — the tokeniser keeps letters, not phrases.
    expect(words('بعت بكام؟ 1200 ج.م!')).toEqual(['بعت', 'بكام', '1200', 'ج', 'م'])
  })
})

describe('greetings', () => {
  it('recognises the usual openings', () => {
    for (const greeting of ['السلام عليكم', 'ازيك', 'hello', 'صباح الخير', 'شكرا']) {
      expect(isGreeting(greeting)).toBe(true)
    }
  })

  it('does not swallow a real question', () => {
    expect(isGreeting('ازيك يا كابتن عايز أعرف مبيعات النهاردة')).toBe(false)
  })
})

describe('topic guard', () => {
  it('scores app vocabulary in both languages', () => {
    expect(appTermScore('مبيعات النهاردة كام')).toBeGreaterThan(0)
    expect(appTermScore('what was my revenue today')).toBeGreaterThan(0)
    expect(appTermScore('المخزون ناقص')).toBeGreaterThan(0)
  })

  it('does not match a term inside another word', () => {
    // «هاي» is a greeting term; it must not fire on «هايبر».
    expect(appTermScore('هايبر ماركت')).toBe(0)
  })

  it('flags unrelated requests only when no app term is present', () => {
    expect(looksOffTopic('اكتبلي قصيدة')).toBe(true)
    expect(looksOffTopic('اكتبلي قصيدة عن المخزون')).toBe(false)
  })

  it('keeps a short follow-up after a tool answer', () => {
    expect(isFollowUp('وطب ليه؟', true)).toBe(true)
    expect(isFollowUp('ليه', true)).toBe(true)
    expect(isFollowUp('ليه', false)).toBe(false)
  })

  it('treats a price question as ours even when it names only a product', () => {
    // "how much is the crunch?" — the noun is not in the dictionary.
    expect(appTermScore('بكام الكرنش')).toBeGreaterThan(0)
    expect(appTermScore('بكم كرانشي')).toBeGreaterThan(0)
    expect(appTermScore('how much is the crunch')).toBeGreaterThan(0)
    expect(verdict('بكام الكرنش', { previousTurnWasTool: false }).reason).toBe('app-term')
  })

  it('recognises names from the shop’s own menu', () => {
    // Nothing here is dictionary vocabulary; only the menu knows the name.
    expect(appTermScore('الكرنش بومب')).toBe(0)
    expect(appTermScore('الكرنش بومب', ['الكرنش بومب'])).toBeGreaterThan(0)
    expect(
      verdict('بكام الكرنش بومب', {
        previousTurnWasTool: false,
        appTerms: ['الكرنش بومب'],
      }).decision
    ).toBe('allow')
  })

  it('still refuses an unrelated request that is not about a product', () => {
    expect(verdict('اكتبلي قصيدة', { previousTurnWasTool: false }).reason).toBe('off-topic')
  })

  it('decides in the documented order', () => {
    const allow = (message: string) => verdict(message, { previousTurnWasTool: false })
    expect(allow('؟').decision).toBe('block')
    expect(allow('؟').reason).toBe('empty')
    expect(verdict('السلام عليكم', { previousTurnWasTool: false }).reason).toBe('greeting')
    expect(allow('بعت بكام النهاردة').decision).toBe('allow')
    expect(allow('اكتبلي قصيدة').reason).toBe('off-topic')
    expect(allow('حاجة غريبة خالص').reason).toBe('uncertain')
  })

  it('asks for the classifier only when uncertain', () => {
    expect(needsClassifier({ decision: 'allow', reason: 'uncertain' })).toBe(true)
    expect(needsClassifier({ decision: 'allow', reason: 'app-term' })).toBe(false)
    expect(needsClassifier({ decision: 'block', reason: 'off-topic' })).toBe(false)
  })
})

describe('assistant reply schema', () => {
  it('accepts a minimal answer and fills the optional lists', () => {
    const parsed = AssistantReplySchema.parse({ text: 'المبيعات ١٠٠' })
    expect(parsed.cards).toEqual([])
    expect(parsed.followups).toEqual([])
  })

  it('rejects an empty answer', () => {
    expect(AssistantReplySchema.safeParse({ text: '' }).success).toBe(false)
  })

  it('rejects more than three cards', () => {
    expect(AssistantReplySchema.safeParse({ text: 'x', cards: ['a', 'b', 'c', 'd'] }).success).toBe(false)
  })

  it('rejects malformed cards on the wire contract', () => {
    expect(ValidatedReplySchema.safeParse({ messageId: 'm', text: 'x', cards: [{ kind: 'nope' }], followups: [] }).success).toBe(false)
  })
})

describe('card schema', () => {
  it('accepts each card kind', () => {
    const cards = [
      { kind: 'report', title: 't', report: { total: 1 } },
      { kind: 'metrics', items: [{ label: 'a', value: '1' }] },
      { kind: 'table', title: 't', columns: ['a'], rows: [['1']] },
      {
        kind: 'action',
        actionId: 'a1',
        title: 't',
        subject: 's',
        status: 'proposed',
        rows: [{ label: 'السعر', before: '1', after: '2' }],
        result: 'r',
      },
    ]
    for (const card of cards) {
      expect(ChatCardSchema.safeParse(card).success, JSON.stringify(card)).toBe(true)
    }
  })

  it('rejects an action without a result', () => {
    expect(ChatCardSchema.safeParse({
      kind: 'action', actionId: 'a', title: 't', subject: 's', status: 'proposed', rows: [],
    }).success).toBe(false)
  })
})

describe('resolveCards', () => {
  const produced: ChatCard[] = [
    { kind: 'metrics', items: [{ label: 'a', value: '1' }] },
    { kind: 'metrics', items: [{ label: 'b', value: '2' }] },
    { kind: 'action', actionId: 'act-9', title: 't', subject: 's', status: 'proposed', rows: [], result: 'r' },
  ]

  it('keeps the order the model asked for', () => {
    const chosen = resolveCards(['card-1', 'card-0'], produced)
    // Identity, not re-derived ids: the second card's label proves the order.
    expect(chosen).toHaveLength(2)
    expect(chosen[0]).toMatchObject({ kind: 'metrics', items: [{ label: 'b' }] })
    expect(chosen[1]).toMatchObject({ kind: 'metrics', items: [{ label: 'a' }] })
  })

  it('drops ids that were never produced', () => {
    const chosen = resolveCards(['ghost', 'act-9'], produced)
    expect(chosen).toHaveLength(1)
    expect(chosen[0].kind).toBe('action')
  })

  it('falls back to the produced cards when the model chooses nothing', () => {
    expect(resolveCards([], produced)).toHaveLength(3)
  })

  it('caps the answer at three cards', () => {
    const many = [...produced, ...produced, ...produced]
    expect(resolveCards([], many)).toHaveLength(3)
  })
})

describe('redaction', () => {
  it('masks phone numbers to their last four digits', () => {
    const out = redact({ customerPhone: '01012345678', name: 'أحمد' }) as any
    expect(out.customerPhone).toBe('••••5678')
    expect(out.name).toBe('أحمد')
  })

  it('drops secret-shaped keys entirely', () => {
    const out = redact({ apiKey: 'sk-x', pinHash: 'h', remoteSecret: 's', ok: 1 }) as any
    expect(out).toEqual({ ok: 1 })
  })

  it('walks nested arrays and objects', () => {
    const out = redact({ orders: [{ phone: '01000000000', total: 5 }] }) as any
    expect(out.orders[0].phone).toBe('••••0000')
    expect(out.orders[0].total).toBe(5)
  })
})

describe('tool output schema', () => {
  it('requires a summary and defaults cards', () => {
    const parsed = ToolOutputSchema.parse({ data: { a: 1 }, summary: 'تم' })
    expect(parsed.cards).toEqual([])
  })

  it('rejects a missing summary', () => {
    expect(ToolOutputSchema.safeParse({ data: {} }).success).toBe(false)
  })
})

describe('mobile base url normalisation', () => {
  it('adds a scheme and trims trailing slashes', () => {
    expect(normalizeBaseUrl('192.168.1.5:4317/')).toBe('http://192.168.1.5:4317')
    expect(normalizeBaseUrl('https://x.example/')).toBe('https://x.example')
  })
})
