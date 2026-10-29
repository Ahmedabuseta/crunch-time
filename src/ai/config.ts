// Assistant configuration: the provider, the model, the encrypted key and the
// caps. Read by the HTTP layer, the workflow and the runtime supervisor.
//
// The key is decrypted here and nowhere else. `getAiConfig()` is the only
// function that returns plaintext, and only the model-step activity calls it —
// the key never enters a workflow payload, a log line or a renderer response.
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { getDb, getSqlite } from '../db/client'
import * as schema from '../db/schema'
import { decryptSecret, encryptSecret, maskKey, newCipherKey } from './secret'

const { settings } = schema

export interface AiConfig {
  enabled: boolean
  provider: string
  baseUrl: string
  model: string
  /** True when a key is stored — the plaintext is never part of this object. */
  hasKey: boolean
  dailyTokenLimit: number
  temporalPort: number
}

export interface AiConfigWithKey extends AiConfig {
  apiKey: string
}

/** What the phone is allowed to see. */
export function getAiConfig(): AiConfig {
  const db = getDb()
  const row = db.select({
    enabled: settings.aiEnabled,
    provider: settings.aiProvider,
    baseUrl: settings.aiBaseUrl,
    model: settings.aiModel,
    keyEnc: settings.aiApiKeyEnc,
    dailyLimit: settings.aiDailyTokenLimit,
    temporalPort: settings.aiTemporalPort,
  }).from(settings).where(eq(settings.id, 'settings')).get()

  return {
    enabled: Boolean(row?.enabled),
    provider: row?.provider || 'openai',
    baseUrl: row?.baseUrl || 'https://api.openai.com/v1',
    model: row?.model || 'gpt-4o-mini',
    hasKey: Boolean(row?.keyEnc),
    dailyTokenLimit: Number(row?.dailyLimit ?? 150000),
    temporalPort: Number(row?.temporalPort) || 7233,
  }
}

/** Decrypts the stored key. Throws a plain Arabic error the caller can surface. */
export function getProviderKey(): string | null {
  const db = getDb()
  const row = db.select({ keyEnc: settings.aiApiKeyEnc, cipher: settings.aiKeyCipher })
    .from(settings).where(eq(settings.id, 'settings')).get()
  if (!row?.keyEnc) return null
  if (!row.cipher) throw new Error('مفتاح التشفير مفقود — أعد إدخال مفتاح API')
  try {
    return decryptSecret(row.keyEnc, row.cipher)
  } catch {
    throw new Error('تعذّر فك تشفير مفتاح API — أعد إدخاله')
  }
}

/** Full config plus the decrypted key, for the model activity only. */
export function getAiConfigWithKey(): AiConfigWithKey {
  const config = getAiConfig()
  const apiKey = getProviderKey()
  if (!apiKey) throw new Error('مفتاح API غير محدد')
  return { ...config, apiKey }
}

/**
 * The per-install cipher key. Created lazily so an install that never enabled
 * the assistant carries no key material at all.
 */
function ensureCipherKey(): string {
  const db = getDb()
  const row = db.select({ cipher: settings.aiKeyCipher }).from(settings).where(eq(settings.id, 'settings')).get()
  if (row?.cipher) return row.cipher
  const cipher = newCipherKey()
  writePatch({ aiKeyCipher: cipher })
  return cipher
}

function writePatch(patch: Record<string, unknown>): void {
  const db = getDb()
  const row = db.select({ id: settings.id }).from(settings).where(eq(settings.id, 'settings')).get()
  if (row) db.update(settings).set(patch).where(eq(settings.id, 'settings')).run()
  else db.insert(settings).values({ id: 'settings', ...patch } as any).run()
}

export interface AiConfigPatch {
  enabled?: boolean
  provider?: string
  baseUrl?: string
  model?: string
  /** Write-only. An empty string clears the stored key. */
  apiKey?: string
  dailyTokenLimit?: number
  temporalPort?: number
}

const BASE_URL = /^https?:\/\/[^\s]+$/i
const MODEL = /^[A-Za-z0-9._:\/-]{1,120}$/

/**
 * Validates and applies a partial update. Returns the Arabic error instead of
 * throwing so the HTTP layer can answer 400 with something the owner can read.
 */
export function updateAiConfig(patch: AiConfigPatch): { ok: true } | { ok: false; error: string } {
  const next: Record<string, unknown> = {}

  if (patch.enabled !== undefined) {
    if (patch.enabled && !getAiConfig().hasKey && !patch.apiKey) {
      return { ok: false, error: 'حدّد مفتاح API الأول قبل تفعيل المساعد' }
    }
    next.aiEnabled = Boolean(patch.enabled)
  }

  if (patch.provider !== undefined) {
    const provider = String(patch.provider).trim().slice(0, 40)
    if (!provider) return { ok: false, error: 'اسم المزوّد غير صالح' }
    next.aiProvider = provider
  }

  if (patch.baseUrl !== undefined) {
    const baseUrl = String(patch.baseUrl).trim().replace(/\/+$/, '')
    if (!BASE_URL.test(baseUrl)) return { ok: false, error: 'عنوان الخدمة لازم يبدأ بـ http:// أو https://' }
    next.aiBaseUrl = baseUrl
  }

  if (patch.model !== undefined) {
    const model = String(patch.model).trim()
    if (!MODEL.test(model)) return { ok: false, error: 'اسم الموديل غير صالح' }
    next.aiModel = model
  }

  if (patch.dailyTokenLimit !== undefined) {
    const limit = Math.floor(Number(patch.dailyTokenLimit))
    if (!Number.isFinite(limit) || limit < 0 || limit > 100_000_000) {
      return { ok: false, error: 'حد الاستخدام غير صالح' }
    }
    next.aiDailyTokenLimit = limit
  }

  if (patch.temporalPort !== undefined) {
    const port = Math.floor(Number(patch.temporalPort))
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      return { ok: false, error: 'بورت خدمة التشغيل غير صالح — اختر من 1024 إلى 65535' }
    }
    next.aiTemporalPort = port
  }

  if (patch.apiKey !== undefined) {
    const key = String(patch.apiKey).trim()
    if (!key) {
      next.aiApiKeyEnc = null
    } else {
      if (key.length < 8 || key.length > 512) return { ok: false, error: 'مفتاح API غير صالح' }
      next.aiApiKeyEnc = encryptSecret(key, ensureCipherKey())
    }
  }

  if (Object.keys(next).length > 0) writePatch(next)
  return { ok: true }
}

/** True when the person pasting the key should recognise it afterwards. */
export function keyHint(): string | null {
  try {
    const key = getProviderKey()
    return key ? maskKey(key) : null
  } catch {
    return null
  }
}

// ─── Privileged actions (desktop only) ──────────────────────
// Rotating the cipher orphans the stored key on purpose: the owner re-enters it
// once rather than the app keeping a key it can no longer protect.
export function resetCipher() {
  writePatch({ aiKeyCipher: newCipherKey(), aiApiKeyEnc: null })
  return { ok: true as const }
}

/** Wipes the transcript, pending actions and today's usage. The config stays. */
export function resetAssistantData() {
  const sqlite = getSqlite()
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM ai_messages').run()
    sqlite.prepare('DELETE FROM ai_threads').run()
    sqlite.prepare('DELETE FROM ai_actions').run()
    sqlite.prepare('DELETE FROM ai_usage').run()
  })()
  return { ok: true as const }
}

/** Housekeeping run at boot: drop expired proposals nobody confirmed. */
export function expireStaleActions(): number {
  const sqlite = getSqlite()
  try {
    const res = sqlite.prepare(
      "UPDATE ai_actions SET status = 'expired' WHERE status = 'proposed' AND expires_at < ?",
    ).run(new Date().toISOString())
    return res.changes
  } catch {
    return 0
  }
}

/** A stable per-install id salt for the classifier cache and thread ids. */
export function threadId(): string {
  return 'owner'
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex')
}
