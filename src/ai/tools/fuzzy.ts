// Close-enough matching for Arabic catalogue names.
//
// resolve.ts is deliberately strict: an exact name wins, a unique prefix or
// substring wins, and a tie asks the owner to pick. That still leaves the typo
// a phone keyboard produces all the time — «فرايدي» for «فرايداي», «سجك» for
// «سجق» — which used to come back as "no such item". This module scores how
// close two names are so the resolver can accept a *single* near match and
// still refuse to guess when two names are equally close.
//
// Pure string work: no database, no dependency.
import { normalizeArabic } from '../guard/arabic'

/**
 * Arabic menu names are written with and without the definite article:
 * «السجق» on the phone, «سجق» in the catalogue. Removing a leading «ال» on
 * each word makes both forms the same lookup key without touching the stored
 * name or the normaliser used elsewhere.
 */
export function withoutArticle(value: string): string {
  return String(value ?? '')
    .split(' ')
    .map((word) => (word.length > 2 && word.startsWith('ال') ? word.slice(2) : word))
    .join(' ')
}

/** The comparison key: normalised Arabic, definite article removed. */
export function normalizeTerm(value: string): string {
  return withoutArticle(normalizeArabic(value))
}

/**
 * At or above this a candidate counts as a real match. A one-letter typo on a
 * four-letter name lands at ~56, so the bar sits just under it; anything below
 * is a hint for the owner, never something the resolver acts on.
 */
export const STRONG_SCORE = 50

export function isStrongScore(score: number): boolean {
  return score >= STRONG_SCORE
}

/**
 * 100 exact · 85-95 requested phrase is a prefix of the name · 70-80 substring ·
 * 30-65 one edit away (two edits for names of five letters or more) · 30-55
 * every requested word appears in the name · 0 nothing close enough.
 *
 * Unrelated names return 0 rather than a small number: a "score" that is
 * always positive is a score the resolver cannot threshold on.
 */
export function fuzzyScore(query: string, candidate: string): number {
  const needle = normalizeTerm(query)
  const name = normalizeTerm(candidate)
  if (!needle || !name) return 0
  if (needle === name) return 100

  if (name.startsWith(needle)) {
    return round(85 + 10 * (needle.length / name.length))
  }
  if (name.includes(needle)) {
    return round(70 + 10 * (needle.length / name.length))
  }

  // One or two letters are a prefix of half the menu, and one substitution
  // in two letters is not evidence of anything.
  if (needle.length < 3) return 0

  const distance = editDistance(needle, name)
  const longest = Math.max(needle.length, name.length)
  const similarity = 1 - distance / Math.max(1, longest)

  if (distance <= 1) return round(30 + 35 * similarity)
  if (Math.min(needle.length, name.length) >= 5 && distance <= 2) {
    return round(30 + 30 * similarity)
  }

  return tokenScore(needle, name)
}

/**
 * Optimal-string-alignment Damerau-Levenshtein: insertions, deletions,
 * substitutions and adjacent transpositions each cost one. Small and
 * allocation-light — the resolver runs it over a menu of a few dozen names.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let before: number[] = [] // row i-2, for the transposition rule
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, index) => index)

  for (let i = 1; i <= a.length; i += 1) {
    const row: number[] = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(
        previous[j] + 1, // deletion
        row[j - 1] + 1, // insertion
        previous[j - 1] + substitution, // substitution
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (before[j - 2] ?? value) + 1) // transposition
      }
      row.push(value)
    }
    before = previous
    previous = row
  }

  return previous[b.length]
}

/**
 * Words that appear in both names but do not line up as one string — «شيدر
 * بطاطس» against «بطاطس شيدر». Never a strong match on its own: a reordered
 * name is a hint, not something worth acting on silently.
 */
function tokenScore(needle: string, name: string): number {
  const requested = needle.split(' ').filter(Boolean)
  const available = name.split(' ').filter(Boolean)
  if (requested.length === 0 || available.length === 0) return 0

  let matched = 0
  for (const word of requested) {
    if (available.includes(word)) matched += 1
  }
  const coverage = matched / requested.length
  if (coverage < 0.6) return 0
  return round(30 + 25 * coverage)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
