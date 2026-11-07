// Per-turn execution trace.
//
// No migration: one JSON line per turn is all a debugging session needs, and it
// keeps the assistant's tables small on the shop PC. `GET /assistant/trace/:id`
// reads the same file the activity wrote.
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface TraceCall {
  name: string
  ms: number
  ok: boolean
  duplicate: boolean
}

export interface TurnTrace {
  turnId: string
  threadId: string
  promptVersion: string
  message: string
  startedAt: string
  durationMs: number
  steps: number
  calls: TraceCall[]
  promptTokens: number
  completionTokens: number
  promptChars: number
  degraded: boolean
  /** Numbers the answer carried that no tool returned. */
  unknownNumbers: string[]
  /** Chars of reasoning the model produced — 0 means the provider hid it. */
  reasoningChars: number
  /** Time to the first token. Separates "slow model" from "slow tools". */
  firstTokenMs: number | null
  /** Reviewer verdicts that changed the turn, for tuning the review prompt. */
  steers: number
  blocks: number
}

/**
 * Resolved lazily: importing electron statically would make every module that
 * imports the activities depend on the Electron runtime (tests included).
 */
async function tracesDir(): Promise<string> {
  try {
    const { app } = await import('electron')
    return path.join(app.getPath('userData'), 'assistant-traces')
  } catch {
    return path.join(tmpdir(), 'crunch-time-assistant-traces')
  }
}

function dayKey(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export async function appendTrace(record: TurnTrace): Promise<string | null> {
  try {
    const dir = await tracesDir()
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `${dayKey()}.jsonl`)
    await appendFile(file, `${JSON.stringify(record)}\n`, 'utf8')
    return file
  } catch {
    // A missing trace must never fail a finished turn.
    return null
  }
}

export async function readTrace(turnId: string, days = 7): Promise<TurnTrace | null> {
  try {
    const dir = await tracesDir()
    const files = (await readdir(dir)).filter((name) => name.endsWith('.jsonl')).sort().reverse().slice(0, days)
    for (const name of files) {
      const body = await readFile(path.join(dir, name), 'utf8')
      for (const line of body.split('\n')) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line) as TurnTrace
          if (parsed.turnId === turnId) return parsed
        } catch {
          // Skip a truncated line from a crash mid-write.
        }
      }
    }
    return null
  } catch {
    return null
  }
}
