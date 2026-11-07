// Transcript storage and the rolling window handed to the model.
//
// The window is deliberately small: an owner's questions are short and mostly
// independent, and every extra turn costs tokens on every request. When the
// thread grows past `KEEP` turns the oldest are folded into a one-line summary
// written by the model itself — cheaper than replaying them and enough for
// "وإمبارح؟" to still make sense.
import { desc, eq } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { now, uuid } from '../backend/shared'
import type { ChatCard } from './schemas'

const { aiMessages, aiThreads } = schema

/** How many turns survive in context. */
export const KEEP_TURNS = 20
/** Above this the summary is refreshed. */
export const SUMMARISE_AT = 30

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  cards: ChatCard[]
  followups: string[]
  createdAt: string
}

export function appendMessage(
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
  cards: ChatCard[] = [],
  followups: string[] = [],
): StoredMessage {
  const message: StoredMessage = {
    id: uuid(),
    role,
    content,
    cards,
    followups,
    createdAt: now(),
  }
  getDb().insert(aiMessages).values({
    id: message.id,
    threadId,
    role,
    content,
    cards: JSON.stringify(cards),
    followups: JSON.stringify(followups),
    createdAt: message.createdAt,
  }).run()
  touchThread(threadId)
  return message
}

function touchThread(threadId: string): void {
  const db = getDb()
  const existing = db.select({ id: aiThreads.id }).from(aiThreads).where(eq(aiThreads.id, threadId)).get()
  if (existing) db.update(aiThreads).set({ updatedAt: now() }).where(eq(aiThreads.id, threadId)).run()
  else db.insert(aiThreads).values({ id: threadId, updatedAt: now() }).run()
}

export function listMessages(threadId: string, limit = 50, before?: string): StoredMessage[] {
  const rows = getDb().select().from(aiMessages)
    .where(eq(aiMessages.threadId, threadId))
    .orderBy(desc(aiMessages.createdAt))
    .all()
  const filtered = before ? rows.filter((row) => row.createdAt < before) : rows
  return filtered.slice(0, Math.min(Math.max(limit, 1), 200)).reverse().map(toMessage)
}

function toMessage(row: typeof aiMessages.$inferSelect): StoredMessage {
  return {
    id: row.id,
    role: row.role === 'user' ? 'user' : 'assistant',
    content: row.content,
    cards: parseJson<ChatCard[]>(row.cards, []),
    followups: parseJson<string[]>(row.followups, []),
    createdAt: row.createdAt,
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * The turns to send to the model: the last `KEEP_TURNS`, oldest first. The
 * stored summary is not a message: `loadContext` reads it separately and the
 * prompt renders it as conversation context, so it costs one small section
 * instead of a fake turn the model might answer.
 */
export function modelHistory(threadId: string): { role: 'user' | 'assistant'; content: string }[] {
  const rows = listMessages(threadId, KEEP_TURNS)
  return rows.map((row) => ({ role: row.role, content: row.content }))
}

export function getSummary(threadId: string): string | null {
  const row = getDb().select({ summary: aiThreads.summary }).from(aiThreads).where(eq(aiThreads.id, threadId)).get()
  return row?.summary ?? null
}

export function saveSummary(threadId: string, summary: string, upto: string): void {
  const db = getDb()
  const existing = db.select({ id: aiThreads.id }).from(aiThreads).where(eq(aiThreads.id, threadId)).get()
  if (existing) db.update(aiThreads).set({ summary, summaryUpto: upto, updatedAt: now() }).where(eq(aiThreads.id, threadId)).run()
  else db.insert(aiThreads).values({ id: threadId, summary, summaryUpto: upto, updatedAt: now() }).run()
}

/** True when the thread has grown enough to be worth compacting. */
export function needsSummary(threadId: string): boolean {
  const rows = getDb().select({ id: aiMessages.id }).from(aiMessages).where(eq(aiMessages.threadId, threadId)).all()
  return rows.length > SUMMARISE_AT
}

/**
 * Folds the oldest turns into a stored summary, once the thread is long enough.
 *
 * `KEEP_TURNS` already drops everything older than twenty turns from the model's
 * window, so without this the assistant silently forgets the start of a long
 * conversation. `cheapSummary` is deterministic and costs no tokens: it lists the
 * questions asked, which is what a follow-up like «وإمبارح؟» needs to resolve.
 *
 * Called from the turn activity rather than from `persistTurn` so a failure
 * here can never take down a turn that already produced an answer.
 */
export function compactThread(threadId: string): { compacted: boolean } {
  try {
    if (!needsSummary(threadId)) return { compacted: false }
    const summary = cheapSummary(threadId)
    if (!summary.trim()) return { compacted: false }
    const rows = listMessages(threadId, 1)
    const upto = rows[rows.length - 1]?.createdAt ?? now()
    saveSummary(threadId, summary, upto)
    return { compacted: true }
  } catch {
    // A transcript that cannot be compacted still answers; it just forgets.
    return { compacted: false }
  }
}

/**
 * Drops the newest assistant line. A retry re-runs the same question, so the
 * old answer has to go: otherwise the transcript (and every later history load)
 * would show two answers to one question.
 */
export function removeLastAssistant(threadId: string): void {
  // rowid, not createdAt: two lines written in the same millisecond must still
  // have an unambiguous newest one, or a retry could delete the question.
  const row = getSqlite()
    .prepare('SELECT id, role FROM ai_messages WHERE thread_id = ? ORDER BY rowid DESC LIMIT 1')
    .get(threadId) as { id: string; role: string } | undefined
  if (!row || row.role !== 'assistant') return
  getSqlite().prepare('DELETE FROM ai_messages WHERE id = ?').run(row.id)
}

export function clearHistory(threadId: string): void {
  const db = getDb()
  db.delete(aiMessages).where(eq(aiMessages.threadId, threadId)).run()
  db.delete(aiThreads).where(eq(aiThreads.id, threadId)).run()
}

/** One line the summariser can produce without a model round trip. */
export function cheapSummary(threadId: string, count = 10): string {
  const rows = listMessages(threadId, count)
  const userTurns = rows.filter((row) => row.role === 'user').map((row) => row.content.slice(0, 60))
  return userTurns.length ? `أسئلة سابقة: ${userTurns.join(' · ')}` : ''
}
