// Encryption for the owner's provider API key.
//
// AES-256-GCM with a per-install key held in the settings row. This keeps
// `src/ai` plain Node (unit-testable, no Electron import) at the cost of one
// property `safeStorage` has: someone who can read the database file can also
// read the key, so this protects backups and stray copies, not a live machine.
// That is the same boundary the remote PIN hash lives behind, and the tradeoff
// is called out in the phone's settings sheet rather than hidden.
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto'

const VERSION = 'v1'
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

/** 32 random bytes, hex-encoded, generated once per install. */
export function newCipherKey(): string {
  return randomBytes(32).toString('hex')
}

function keyBuffer(hex: string): Buffer {
  const key = Buffer.from(String(hex || ''), 'hex')
  if (key.length !== 32) throw new Error('مفتاح التشفير غير صالح')
  return key
}

/** `v1.<iv>.<tag>.<ciphertext>` — all base64url, so it survives any text column. */
export function encryptSecret(plain: string, keyHex: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, keyBuffer(keyHex), iv)
  const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, b64(iv), b64(tag), b64(body)].join('.')
}

export function decryptSecret(payload: string, keyHex: string): string {
  const parts = String(payload || '').split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('صيغة المفتاح المشفّر غير صالحة')
  const [, ivPart, tagPart, bodyPart] = parts
  const decipher = createDecipheriv(ALGO, keyBuffer(keyHex), unb64(ivPart))
  decipher.setAuthTag(unb64(tagPart))
  return Buffer.concat([decipher.update(unb64(bodyPart)), decipher.final()]).toString('utf8')
}

/** True when two ciphertexts are byte-identical without a timing leak. */
export function sameCipher(a: string, b: string): boolean {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

const b64 = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

/** First and last four characters — enough for the owner to recognise a key. */
export function maskKey(key: string): string {
  const clean = String(key || '').trim()
  if (clean.length <= 10) return '••••'
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`
}
