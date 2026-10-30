// The pure half of the assistant: Arabic normalisation, greetings, the reply
// schemas and card resolution. No database, no Electron, no network.
import { describe, it, expect } from 'vitest'
import { normalizeArabic, words, isGreeting } from '../ai/guard/arabic'
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
