// The truncated-JSON reader that drives the live answer bubble.
//
// The provider streams the `answer` tool's arguments as raw JSON text, so every
// intermediate state this reader can be handed is a half-written object. These
// tests are the contract: it must never throw, never invent a character, and
// never re-publish text it already returned.
import { describe, expect, it } from 'vitest'
import { appendedDelta, partialStringField } from '../ai/partial-json'

describe('partialStringField', () => {
  it('reads a complete value', () => {
    expect(partialStringField('{"text":"أهلاً"}', 'text')).toBe('أهلاً')
  })

  it('reads a value that has not closed yet', () => {
    expect(partialStringField('{"text":"مبيعات النهاردة', 'text')).toBe('مبيعات النهاردة')
  })

  it('reads a value that has only just opened', () => {
    expect(partialStringField('{"text":"', 'text')).toBe('')
  })

  it('returns empty when the field has not started', () => {
    expect(partialStringField('{"ca', 'text')).toBe('')
    expect(partialStringField('', 'text')).toBe('')
  })

  it('decodes escapes', () => {
    expect(partialStringField('{"text":"line\\nnext"}', 'text')).toBe('line\nnext')
    expect(partialStringField('{"text":"quote \\"q\\""}', 'text')).toBe('quote "q"')
    expect(partialStringField('{"text":"back \\\\ slash"}', 'text')).toBe('back \\ slash')
  })

  it('decodes a unicode escape', () => {
    expect(partialStringField('{"text":"\\u0645"}', 'text')).toBe('م')
  })

  it('stops before an escape that is still arriving', () => {
    // The character after the backslash has not landed yet; publishing the
    // backslash itself would corrupt the bubble.
    expect(partialStringField('{"text":"abc\\', 'text')).toBe('abc')
    // A `\u` with fewer than four hex digits is not decodable yet.
    expect(partialStringField('{"text":"abc\\u06', 'text')).toBe('abc')
  })

  it('does not match a key name inside another value', () => {
    const json = '{"context":"some text here","text":"الجواب"}'
    expect(partialStringField(json, 'text')).toBe('الجواب')
  })

  it('ignores a field whose value is not a string', () => {
    expect(partialStringField('{"text":null,"other":1}', 'text')).toBe('')
    expect(partialStringField('{"text":42}', 'text')).toBe('')
  })

  it('never throws on malformed input', () => {
    for (const input of ['{', '{"text"', '{"text":', '{"text":"a', 'not json at all', '[]', '{"text" "x"}']) {
      expect(() => partialStringField(input, 'text')).not.toThrow()
    }
  })
})

describe('appendedDelta', () => {
  it('returns the new tail only', () => {
    expect(appendedDelta('مبيعات', 'مبيعات النهاردة')).toBe(' النهاردة')
  })

  it('returns nothing when the text did not grow', () => {
    expect(appendedDelta('مبيعات', 'مبيعات')).toBe('')
  })

  it('returns nothing rather than rendering backwards', () => {
    // A repair or a rewrite: the bubble must not duplicate text it already has.
    expect(appendedDelta('مبيعات النهاردة', 'مبيعات')).toBe('')
  })

  it('returns everything on the first call', () => {
    expect(appendedDelta('', 'أهلاً')).toBe('أهلاً')
    expect(appendedDelta('', '')).toBe('')
  })
})
