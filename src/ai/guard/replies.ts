// The canned answers the circuit breaker sends.
//
// The wording lives in the `ai_replies` table (seeded by migration 011) so the
// owner can edit it without a release. Every read still carries a literal
// fallback: a missing row, an older database or a table that was never created
// must leave the assistant answering, never silent.
import { getSqlite } from '../../db/client'

export type ReplyKey =
  | 'empty'
  | 'greeting'
  | 'budget'
  | 'error'
  | 'disabled'
  | 'no_key'
  | 'needs_context'
  | 'rate_limited'
  | 'temporal_down'

/** Same wording as the seeded rows in `src/db/migrations/011-assistant.ts`. */
const FALLBACKS: Record<ReplyKey, string> = {
  empty: 'اكتب سؤالك وأنا أرد.',
  greeting: 'أهلاً بيك. اسألني مثلاً: بعت بكام النهاردة؟ إيه اللي ناقص أطلبه؟ إيه أقل صنف بربح؟',
  budget: 'وصلت لحد الاستخدام اليومي للمساعد. تقدر تزوّد الحد من إعدادات المساعد، أو نكمل بكرة.',
  error: 'حصلت مشكلة وأنا بجهّز الرد. جرّب تاني بعد شوية.',
  disabled: 'المساعد مش مفعّل. فعّله من إعدادات المساعد في شاشة المساعد.',
  no_key: 'محتاج تحدد مفتاح API الأول من إعدادات المساعد.',
  needs_context: 'مش قادر أجاوب السؤال ده من البيانات المتاحة. جرّب تسأل بطريقة تانية أو حدد المدة.',
  rate_limited: 'استنى شوية قبل ما تبعت تاني.',
  temporal_down: 'المساعد مش شغال دلوقتي — خدمة التشغيل متوقفة. جرّب تقفله وتفعّله تاني من الإعدادات.',
}

/** The saved text, or the built-in one when the row or the table is missing. */
export function getSavedReply(key: ReplyKey): string {
  // A key that somehow arrives from the renderer still has to produce a reply.
  const known = Object.prototype.hasOwnProperty.call(FALLBACKS, key) ? key : 'error'
  const fallback = FALLBACKS[known]
  try {
    const row = getSqlite()
      .prepare('SELECT text FROM ai_replies WHERE key = ?')
      .get(key) as { text: string } | undefined
    // An empty row is as good as no row: the owner clearing the text should not
    // leave the phone with a blank bubble.
    if (row && typeof row.text === 'string' && row.text.trim().length > 0) return row.text
    return fallback
  } catch {
    // Migration 011 never ran (some tests, a brand-new file) — still answer.
    return fallback
  }
}

/** Upsert an edited reply. A missing table silently keeps the built-in text. */
export function setSavedReply(key: string, text: string): void {
  const cleanKey = String(key || '').trim()
  if (!cleanKey) return
  try {
    getSqlite().prepare(`
      INSERT INTO ai_replies (key, text, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at
    `).run(cleanKey, String(text || ''), new Date().toISOString())
  } catch {
    // Same rule as the read side: saving a reply must never crash the screen.
  }
}
