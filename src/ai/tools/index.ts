// The registry the activity layer turns into AI SDK tools.
//
// `redact` is the last gate before anything reaches the model: the tool layer
// already avoids key material and full phone numbers, and this catches whatever
// a future tool forgets.
import { READ_TOOLS } from './read'
import { WRITE_TOOLS } from './write'
import { MANAGE_READ_TOOLS } from './manage-read'
import { MANAGE_WRITE_TOOLS } from './manage-write'
import { ANALYTICS_TOOLS } from './analytics'
import { ALIAS_TOOLS } from './aliases'
import type { ToolDef, ToolRegistry } from './types'

export const ALL_TOOLS: ToolDef[] = [
  ...READ_TOOLS,
  ...MANAGE_READ_TOOLS,
  ...ANALYTICS_TOOLS,
  ...WRITE_TOOLS,
  ...MANAGE_WRITE_TOOLS,
  ...ALIAS_TOOLS,
]

export const TOOLS: ToolRegistry = new Map(ALL_TOOLS.map((tool) => [tool.name, tool]))

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.get(name)
}

export function toolNames(): string[] {
  return ALL_TOOLS.map((tool) => tool.name)
}

const SECRET_KEY = /pin|hash|secret|token|api_?key|password|cipher/i
const PHONE_KEY = /phone|mobile|tel$/i

/**
 * Deep copy with secret-shaped keys removed and phone numbers masked to their
 * last four digits. Applied to every tool's `data` before the model sees it.
 */
export function redact<T>(value: T): T {
  return walk(value, 0) as T
}

function walk(value: unknown, depth: number): unknown {
  if (depth > 8) return null
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => walk(entry, depth + 1))
  if (typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) continue
    if (PHONE_KEY.test(key) && typeof entry === 'string') {
      const digits = entry.replace(/\D/g, '')
      out[key] = digits.length >= 5 ? `••••${digits.slice(-4)}` : '••••'
      continue
    }
    out[key] = walk(entry, depth + 1)
  }
  return out
}
