// Small helpers shared by the server route modules.
export function deviceLabel(headers: Record<string, any>, body: any): string {
  const raw = headers['x-device-label'] || body?.deviceLabel
  const label = String(raw ?? '').trim()
  return label || 'تطبيق الهاتف'
}

export function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
