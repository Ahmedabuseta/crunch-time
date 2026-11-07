// Reads a string field out of a JSON object literal that is still arriving.
//
// The answer reaches the phone as the `answer` tool's arguments, which the
// provider streams as raw JSON text. Publishing the finished call would mean
// the owner sees a spinner and then a whole paragraph, so the live bubble is
// driven from the partial argument text instead. That text can stop anywhere —
// mid-key, mid-value, inside an escape — so this reads what is safely decodable
// and never throws.
//
// Pure and dependency-free: it is imported by the activity layer and unit
// tested on its own.

/**
 * The decoded value of `field` in a possibly-truncated JSON object literal.
 *
 * Returns `''` when the field has not started yet, or when the text is not a
 * JSON object. A trailing escape that arrived without its character is dropped
 * rather than guessed at, so the caller can publish the result and get the rest
 * on the next chunk.
 */
export function partialStringField(json: string, field: string): string {
  const text = String(json ?? '')
  const key = keyOffset(text, field)
  if (key < 0) return ''

  // Skip the colon and the whitespace a provider may put around it.
  let index = key
  while (index < text.length && text[index] !== ':') index += 1
  if (index >= text.length) return ''
  index += 1
  while (index < text.length && isSpace(text[index])) index += 1

  // A value that is not a string (`null`, a number, an array) has no text to
  // show. The field exists but nothing has been written into it yet.
  if (index >= text.length || text[index] !== '"') return ''
  index += 1

  let out = ''
  while (index < text.length) {
    const char = text[index]

    if (char === '"') return out // value closed

    if (char !== '\\') {
      out += char
      index += 1
      continue
    }

    const next = text[index + 1]
    // The escape landed without its character: stop and let the next chunk
    // finish it, rather than publish a wrong glyph.
    if (next === undefined) return out

    switch (next) {
      case 'n':
        out += '\n'
        index += 2
        break
      case 't':
        out += '\t'
        index += 2
        break
      case 'r':
        out += '\r'
        index += 2
        break
      case 'b':
        out += '\b'
        index += 2
        break
      case 'f':
        out += '\f'
        index += 2
        break
      case '"':
        out += '"'
        index += 2
        break
      case '\\':
        out += '\\'
        index += 2
        break
      case '/':
        out += '/'
        index += 2
        break
      case 'u': {
        const hex = text.slice(index + 2, index + 6)
        // Fewer than four hex digits: the escape is still arriving.
        if (hex.length < 4) return out
        const code = Number.parseInt(hex, 16)
        if (!Number.isFinite(code)) return out
        out += String.fromCharCode(code)
        index += 6
        break
      }
      default:
        // An escape JSON never mints. Keep the character and move on rather
        // than wedging the reader on a provider quirk.
        out += next
        index += 2
        break
    }
  }

  // The closing quote never arrived: the value so far is the value so far.
  return out
}

/**
 * Index of the opening quote of `"field"`, or -1.
 *
 * The search is anchored on a quoted key so `"text"` cannot match inside a
 * value such as `"context": "some text"`.
 */
function keyOffset(text: string, field: string): number {
  const needle = `"${field}"`
  let from = 0
  for (;;) {
    const at = text.indexOf(needle, from)
    if (at < 0) return -1
    // The character before the quote must be a structural position: the start
    // of the object, a comma, or whitespace after one. That rejects a key name
    // that appears inside a string value.
    const before = previousNonSpace(text, at)
    if (before === null || before === '{' || before === ',') return at + needle.length
    from = at + needle.length
  }
}

function previousNonSpace(text: string, index: number): string | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!isSpace(text[i])) return text[i]
  }
  return null
}

function isSpace(char: string | undefined): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t'
}

/**
 * The suffix of `next` that has not been published yet.
 *
 * Providers send the argument text cumulatively, so the bubble needs the tail,
 * not the whole string again. Returns `''` when nothing new (or when the model
 * rewrote earlier text, which a live bubble must not render backwards).
 */
export function appendedDelta(previous: string, next: string): string {
  if (!next) return ''
  if (!previous) return next
  if (next.startsWith(previous)) return next.slice(previous.length)
  return ''
}
