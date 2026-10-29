import type { Migration } from './types'

// Assistant: settings columns, transcript, pending actions, token usage and
// the saved replies the circuit breaker answers with.
//
// Everything here is additive — no existing row is touched, and a database
// that never enables the assistant simply keeps the defaults.
const COLUMNS: [string, string][] = [
  ['ai_enabled', 'INTEGER NOT NULL DEFAULT 0'],
  ['ai_provider', "TEXT NOT NULL DEFAULT 'openai'"],
  ['ai_base_url', "TEXT NOT NULL DEFAULT 'https://api.openai.com/v1'"],
  ['ai_model', "TEXT NOT NULL DEFAULT 'gpt-4o-mini'"],
  ['ai_api_key_enc', 'TEXT'],
  // Per-install AES key for ai_api_key_enc. Rotating it orphans the stored key,
  // which is the intended failure mode: the owner re-enters it once.
  ['ai_key_cipher', 'TEXT'],
  ['ai_daily_token_limit', 'INTEGER NOT NULL DEFAULT 150000'],
  ['ai_temporal_port', 'INTEGER NOT NULL DEFAULT 7233'],
]

// The fallback answers. Seeded, not hard-coded, so the wording can be edited
// without a release. Every key is read with a literal fallback in
// guard/replies.ts, so a missing row can never mute the assistant.
const REPLIES: [string, string][] = [
  ['off_topic', 'أنا مساعد الكاشير، بساعدك في حاجات المحل بس.\nتقدر تسألني عن: المبيعات والأرباح، المخزون واللي ناقص، أسعار الأصناف وتكلفتها، الموظفين والورديات، أو آخر الطلبات.'],
  ['empty', 'اكتب سؤالك وأنا أرد.'],
  ['greeting', 'أهلاً بيك. اسألني مثلاً: بعت بكام النهاردة؟ إيه اللي ناقص أطلبه؟ إيه أقل صنف بربح؟'],
  ['budget', 'وصلت لحد الاستخدام اليومي للمساعد. تقدر تزوّد الحد من إعدادات المساعد، أو نكمل بكرة.'],
  ['error', 'حصلت مشكلة وأنا بجهّز الرد. جرّب تاني بعد شوية.'],
  ['disabled', 'المساعد مش مفعّل. فعّله من إعدادات المساعد في شاشة المساعد.'],
  ['no_key', 'محتاج تحدد مفتاح API الأول من إعدادات المساعد.'],
  ['needs_context', 'مش قادر أجاوب السؤال ده من البيانات المتاحة. جرّب تسأل بطريقة تانية أو حدد المدة.'],
  ['rate_limited', 'استنى شوية قبل ما تبعت تاني.'],
  ['temporal_down', 'المساعد مش شغال دلوقتي — خدمة التشغيل متوقفة. جرّب تقفله وتفعّله تاني من الإعدادات.'],
]

export const migration: Migration = {
  id: '011-assistant',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(settings)').all() as { name: string }[]
    const existing = new Set(columns.map((c) => c.name))
    for (const [name, definition] of COLUMNS) {
      if (!existing.has(name)) db.exec(`ALTER TABLE settings ADD COLUMN ${name} ${definition}`)
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        cards TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ai_messages_thread ON ai_messages(thread_id, created_at);

      CREATE TABLE IF NOT EXISTS ai_threads (
        id TEXT PRIMARY KEY,
        summary TEXT,
        summary_upto TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_actions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        preview TEXT NOT NULL,
        workflow_id TEXT,
        status TEXT NOT NULL DEFAULT 'proposed',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        executed_at TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS ai_actions_status ON ai_actions(status, created_at);

      CREATE TABLE IF NOT EXISTS ai_usage (
        day TEXT PRIMARY KEY,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        requests INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS ai_replies (
        key TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    const insert = db.prepare('INSERT OR IGNORE INTO ai_replies (key, text, updated_at) VALUES (?, ?, ?)')
    const stamp = new Date().toISOString()
    for (const [key, text] of REPLIES) insert.run(key, text, stamp)
  },
}
