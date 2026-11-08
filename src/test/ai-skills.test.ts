// Skill selection: which playbook a message loads.
//
// Two things are being protected here. First, that a question about money does
// not carry the six stocktake rules — that was the whole point of splitting the
// prompt. Second, that moving those rules out of `rules.ts` did not drop one of
// them: they were the most carefully written part of the old prompt, and a
// silent loss would be invisible until an owner got a bad answer about a
// shortage.
import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, type TurnFacts } from '../ai/prompt'
import { GENERAL, SKILLS, STOCK_AUDIT } from '../ai/prompt/skills'
import { MAX_SKILLS, selectSkills, skillIds } from '../ai/prompt/skills/select'

const facts: TurnFacts = {
  restaurantName: 'كرنش تايم',
  currencyLabel: 'ج.م',
  today: '2026-11-03',
  weekday: 'الثلاثاء',
  conversationSummary: null,
  taxPercent: 14,
  deliveryFee: 25,
  storePhone: '01000000000',
}

const state = {
  step: 1,
  maxSteps: 8,
  ran: [] as { name: string; summary: string }[],
  failed: [] as { name: string; summary: string }[],
  cardIds: [] as string[],
}

const promptFor = (message: string) =>
  buildSystemPrompt({ facts, state, tools: [], followupAllowed: true, message })

describe('selection', () => {
  it('always loads the general playbook', () => {
    expect(skillIds(selectSkills('بعت بكام النهاردة؟'))[0]).toBe('general')
    expect(skillIds(selectSkills('أهلاً'))).toEqual(['general'])
  })

  it('routes a sales question to the sales playbook', () => {
    expect(skillIds(selectSkills('بعت بكام النهاردة؟'))).toEqual(['general', 'sales'])
  })

  it('routes a shortage question to the stocktake playbook', () => {
    expect(skillIds(selectSkills('في عجز في جرد السجق؟'))).toContain('stock-audit')
  })

  it('routes a multi-item change to stock actions', () => {
    expect(skillIds(selectSkills('استبدل ١٥ كيلو كوردن بـ ١٠ واستلم جركن كاتشب')))
      .toContain('stock-actions')
  })

  it('routes a price question to pricing', () => {
    expect(skillIds(selectSkills('السجق بكام؟'))).toEqual(['general', 'pricing'])
  })

  it('routes a recipe question to recipes', () => {
    expect(skillIds(selectSkills('تكلفة وصفة الكريب إيه؟'))).toContain('recipes')
  })

  it('never loads more than the cap', () => {
    // A message that hits several domains at once is still capped, because the
    // rules would compete with the tool schemas for the token budget.
    const ids = skillIds(selectSkills('بكام السجق وفي عجز في جرد كوردن واستبدل ٥ كيلو ووصفة الكريب'))
    expect(ids.length).toBeLessThanOrEqual(MAX_SKILLS)
    expect(ids[0]).toBe('general')
  })

  it('prefers the specific domain over the broad one', () => {
    // «جرد» is a strong stocktake signal; «مبيعات» appears often in stocktake
    // questions too, so the specific one has to win.
    const ids = skillIds(selectSkills('مبيعات السجق وفي فرق في الجرد'))
    expect(ids).toContain('stock-audit')
  })

  it('returns general alone for an empty message', () => {
    expect(skillIds(selectSkills(''))).toEqual(['general'])
  })
})

describe('the stocktake rules survived the move', () => {
  // Each of the old rules 16–21, by a phrase that must still be present.
  const anchors = [
    'signals/verdict',
    'متقولش إن التسوية سبب العجز',
    'needsCount',
    'record_stocktake مش adjust_stock',
    'الفرق = الجرد الفعلي − رصيد النظام',
    '3–4 جمل قصيرة',
    'يخالف أرقام stock_audit',
  ]

  it('keeps every shortage rule reachable', () => {
    const body = STOCK_AUDIT.rules.join('\n')
    for (const anchor of anchors) expect(body).toContain(anchor)
  })

  it('renders them in the prompt when the skill is selected', () => {
    const prompt = promptFor('في عجز في جرد السجق؟')
    for (const anchor of anchors) expect(prompt).toContain(anchor)
  })
})

describe('the prompt stops carrying the wrong domain', () => {
  it('a price question does not load the stocktake rules', () => {
    const prompt = promptFor('السجق بكام؟')
    expect(prompt).not.toContain('record_stocktake مش adjust_stock')
    expect(prompt).not.toContain('signals/verdict')
  })

  it('a sales question does not load them either', () => {
    const prompt = promptFor('بعت بكام النهاردة؟')
    expect(prompt).not.toContain('الفرق = الجرد الفعلي')
  })

  it('the sales prompt is smaller than the stocktake prompt', () => {
    // Not a law of nature, but it is the shape the split was for: the domain
    // with six careful rules costs more than the one with six short ones.
    expect(promptFor('بعت بكام النهاردة؟').length).toBeLessThan(promptFor('في جرد وعجز؟').length)
  })
})

describe('prompt assembly', () => {
  it('opens with the role, not a rule list', () => {
    const prompt = promptFor('بعت بكام النهاردة؟')
    expect(prompt).toContain('أنت مساعد تشغيل مطعم')
    expect(prompt).toContain('## دورك')
    // The role comes before the invariants.
    expect(prompt.indexOf('## دورك')).toBeLessThan(prompt.indexOf('## قواعد ثابتة'))
  })

  it('carries the shop facts so tax and delivery need no tool call', () => {
    const prompt = promptFor('الضريبة كام؟')
    expect(prompt).toContain('14٪')
    expect(prompt).toContain('25 ج.م')
    expect(prompt).toContain('01000000000')
  })

  it('omits the phone line when the shop has none', () => {
    const prompt = buildSystemPrompt({
      facts: { ...facts, storePhone: null },
      state,
      tools: [],
      followupAllowed: true,
      message: 'أهلاً',
    })
    expect(prompt).not.toContain('تليفون المحل')
  })

  it('renders the domain playbook after the invariants', () => {
    const prompt = promptFor('السجق بكام؟')
    expect(prompt.indexOf('## قواعد ثابتة')).toBeLessThan(prompt.indexOf('الوضع: الأسعار والهوامش'))
  })

  it('every skill has a name, rules and at least one example', () => {
    for (const skill of SKILLS) {
      expect(skill.name.length).toBeGreaterThan(2)
      expect(skill.rules.length).toBeGreaterThan(0)
      expect(skill.example.length).toBeGreaterThan(0)
    }
  })

  it('general is the only skill with no triggers', () => {
    const withoutTriggers = SKILLS.filter((skill) => skill.triggers.length === 0)
    expect(withoutTriggers.map((skill) => skill.id)).toEqual([GENERAL.id])
  })

  it('stays inside the small-model budget with a domain skill and twelve tools', () => {
    const tools = Array.from({ length: 12 }, (_, index) => ({
      name: `tool_${index}`,
      description: `وصف ${index}`,
      schema: { safeParse: () => ({ success: true }) } as never,
      write: false,
      run: async () => ({ data: {}, summary: '', cards: [] }),
    }))
    const prompt = buildSystemPrompt({
      facts,
      state,
      tools,
      followupAllowed: true,
      message: 'في جرد وعجز في السجق ووصفة الكريب',
    })
    expect(prompt.length).toBeLessThan(14_000)
  })
})
