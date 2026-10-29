// Normalization for the assistant guard.
//
// Phone messages arrive with diacritics, tatweel and the several spellings of
// hamza, so every comparison the guard makes — greetings, app terms, follow-up
// starters — runs through here first. Pure string work: no imports, no I/O.

/** Harakat (fatha … sukun) and the tatweel letter that only stretches a word. */
const DIACRITICS = /[\u064B-\u0652\u0640]/g

/** Invisible and direction-only marks a phone keyboard can leave behind. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

/** What a word may be made of: Latin letters, Arabic letters, digits. */
const WORD_CHARS = /[a-z0-9\u0621-\u064A\u0660-\u0669\u066E-\u06D3]+/g

/** A greeting longer than this is a sentence that happens to open with one. */
const GREETING_WORD_LIMIT = 4

/**
 * Lowercase, strip diacritics and tatweel, and collapse the different
 * spellings of the same letter onto one form, so "أَلْفَاتُورَة" and
 * "الفاتوره" compare equal.
 */
export function normalizeArabic(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(INVISIBLE, '')
    .replace(DIACRITICS, '')
    // Every hamza form of alef is the same letter to a reader.
    .replace(/[آأإٱ]/g, 'ا')
    // Alef maqsura prints as a final yeh in handwriting and on phones.
    .replace(/ى/g, 'ي')
    // The round ta marbuta is written as a heh all the time.
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalized tokens. Punctuation is a separator, not something to delete:
 * "فاتورة,النهاردة" has to stay two words.
 */
export function words(input: string): string[] {
  return normalizeArabic(input).match(WORD_CHARS) ?? []
}

/**
 * The greetings worth answering without a model. Kept to short, whole-message
 * phrases — the wording matches what a customer or the owner actually types.
 */
const GREETINGS = [
  'السلام عليكم',
  'سلام عليكم',
  'وعليكم السلام',
  'عليكم السلام',
  'اهلا',
  'اهلين',
  'اهلا وسهلا',
  'اهلا بيك',
  'مرحبا',
  'مرحبتين',
  'هاي',
  'هالو',
  'هلا',
  'هلا بيك',
  'صباح الخير',
  'صباح النور',
  'مساء الخير',
  'مساء النور',
  'ازيك',
  'ازيكم',
  'اخبارك',
  'اخبارك ايه',
  'عامل ايه',
  'شكرا',
  'شكرا جدا',
  'تسلم',
  'تسلم ايدك',
  'يسلمو',
  'hello',
  'hi',
  'hey',
  'good morning',
  'good afternoon',
  'good evening',
  'good night',
  'thanks',
  'thank you',
  'thx',
  'bye',
  'goodbye',
]

/** Greetings as normalized word runs, so matching ignores spelling noise. */
const GREETING_PHRASES = GREETINGS
  .map(phrase => words(phrase).join(' '))
  .filter(phrase => phrase.length > 0)

/**
 * True for a short greeting and nothing longer. A question that opens with
 * "أهلاً" is still a question: the word limit keeps a greeting from swallowing
 * a real request, and the word-run match keeps "هاي" from matching "هايبر".
 */
export function isGreeting(input: string): boolean {
  const tokens = words(input)
  if (tokens.length === 0 || tokens.length > GREETING_WORD_LIMIT) return false
  const padded = ` ${tokens.join(' ')} `
  return GREETING_PHRASES.some(phrase => padded.includes(` ${phrase} `))
}
