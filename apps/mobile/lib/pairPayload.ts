// Parses the payload the desktop puts in the pairing QR. Deliberately
// dependency-free so it can be unit-tested, and tolerant of the shapes a QR
// might carry: our own scheme, raw JSON, or a bare URL (PIN login fallback).

export interface PairPayload {
  url: string
  code: string | null
}

function queryToMap(query: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of query.split('&')) {
    if (!part) continue
    const index = part.indexOf('=')
    const rawKey = index === -1 ? part : part.slice(0, index)
    const rawValue = index === -1 ? '' : part.slice(index + 1)
    try {
      out[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue)
    } catch {
      out[rawKey] = rawValue
    }
  }
  return out
}

export function buildPairPayload(url: string, code: string): string {
  return `crunchtime://pair?u=${encodeURIComponent(url)}&c=${encodeURIComponent(code)}`
}

export function parsePairPayload(raw: unknown): PairPayload | null {
  const text = String(raw ?? '').trim()
  if (!text) return null

  const scheme = /^crunchtime:\/\/pair\?(.+)$/i.exec(text)
  if (scheme) {
    const params = queryToMap(scheme[1])
    const url = (params.u || params.url || '').trim()
    const code = (params.c || params.code || '').trim()
    return url ? { url, code: code || null } : null
  }

  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text)
      const url = String(obj.u ?? obj.url ?? '').trim()
      if (!url) return null
      const code = obj.c ?? obj.code
      return { url, code: code ? String(code).trim() : null }
    } catch {
      return null
    }
  }

  if (/^https?:\/\//i.test(text)) return { url: text, code: null }

  return null
}
