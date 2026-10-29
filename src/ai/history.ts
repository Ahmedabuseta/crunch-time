// Transcript storage and the rolling window handed to the model.
//
// The window is deliberately small: an owner's questions are short and mostly
// independent, and every extra turn costs tokens on every request. When the
// thread grows past `KEEP` turns the oldest are folded into a one-line summary
// written by the model itself — cheaper than replaying them and enough for
// "وإمبارح؟" to still make sense.
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
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
 * The turns to send to the model: the last `KEEP_TURNS`, oldest first, with the
 * stored summary (when there is one) as a leading assistant note.
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
