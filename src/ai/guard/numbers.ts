// Number enforcement.
//
// The prompt says every figure must come from a tool, but prose cannot enforce
// it. This module reads the answer's numbers and the turn's tool outputs and
// returns the ones that have no source. The workflow then asks the model once
// to repair the answer; if it cannot, the deterministic summary is persisted
// instead. A wrong number never reaches the owner.
import type { ToolExchange } from '../loop'

const ARABIC_INDIC = /[٠-٩]/g
const EASTERN_ARABIC_INDIC = /[۰-۹]/g

/** Arabic-Indic and Persian digits, plus the Arabic thousands/decimal marks. */
export function normalizeDigits(input: string): string {
  return String(input ?? '')
    .replace(ARABIC_INDIC, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(EASTERN_ARABIC_INDIC, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٬,]/g, '')
    .replace(/٫/g, '.')
}

interface Token {
  raw: string
  value: number
}

function textNumbers(input: string): Token[] {
  const normalized = normalizeDigits(input)
  const matches = normalized.match(/\d+(?:\.\d+)?/g) ?? []
  const tokens: Token[] = []
  for (const raw of matches) {
    const value = Number(raw)
    if (!Number.isFinite(value)) continue
    tokens.push({ raw, value })
  }
  return tokens
}

/**
 * Every number the tools actually returned. Array lengths count: "3 أصناف" is
 * a truthful statement about a three-row result even though no cell holds a 3.
 */
function allowedNumbers(exchanges: readonly ToolExchange[]): number[] {
  const out: number[] = []
  const seen = new Set<number>()

  const add = (value: number) => {
    if (!Number.isFinite(value)) return
    for (const candidate of variants(value)) {
      if (seen.has(candidate)) continue
      seen.add(candidate)
      out.push(candidate)
    }
  }

  const walk = (value: unknown, depth: number): void => {
    if (depth > 10 || value === null || value === undefined) return
    if (typeof value === 'number') return add(Math.abs(value))
    if (typeof value === 'string') {
      for (const token of textNumbers(value)) add(token.value)
      return
    }
    if (Array.isArray(value)) {
      add(value.length)
      for (const entry of value) walk(entry, depth + 1)
      return
    }
    if (typeof value === 'object') {
      for (const entry of Object.values(value as Record<string, unknown>)) walk(entry, depth + 1)
    }
  }

  for (const exchange of exchanges) {
    walk(exchange.data, 0)
    if (exchange.summary) walk(exchange.summary, 0)
  }

  return out
}

/** The value as written, plus the rounded forms prose usually uses. */
function variants(value: number): number[] {
  const rounded = [value, Math.round(value), round(value, 1), round(value, 2)]
  const negative = rounded.map((entry) => -entry)
  return [...rounded, ...negative]
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function matches(value: number, allowed: readonly number[]): boolean {
  const target = Math.abs(value)
  for (const candidate of allowed) {
    const absolute = Math.abs(candidate)
    if (Math.abs(absolute - target) <= 0.011) return true
    if (absolute === 0) continue
    if (Math.abs(absolute - target) <= absolute * 0.01) return true
  }
  return false
}

/**
 * Numbers in `text` that no tool returned, in order of appearance, deduped.
 * Empty when the turn ran no tools — a greeting or a refusal must stay clean.
 */
export function unknownNumbers(text: string, exchanges: readonly ToolExchange[]): string[] {
  const body = String(text ?? '').trim()
  if (!body || exchanges.length === 0) return []

  const allowed = allowedNumbers(exchanges)
  if (allowed.length === 0) return []

  const unknown: string[] = []
  const seen = new Set<string>()
  for (const token of textNumbers(body)) {
    // A year is prose, not a business figure: "نوفمبر ٢٠٢٦" must not be
    // reported as invented money just because no tool returned 2026.
    if (token.raw.length === 4 && token.value >= 1900 && token.value <= 2100) continue
    if (matches(token.value, allowed)) continue
    if (seen.has(token.raw)) continue
    seen.add(token.raw)
    unknown.push(token.raw)
    if (unknown.length >= 5) break
  }
  return unknown
}
