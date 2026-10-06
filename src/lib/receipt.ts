// ─── Receipt branding ──────────────────────────────────────────
// Single source of truth for the professional receipt header/footer data.
// Everything here is admin-editable from Settings → «بيانات المحل والإيصال»
// and persisted in the `settings` table (single row, id = 'settings').

export interface ReceiptInfo {
  /** Store name shown as the receipt letterhead (settings.restaurantName) */
  storeName: string
  /** Short line under the store name — e.g. "بيتزا و برجر" */
  tagline: string
  /** Shop logo as a data URL (`data:image/...;base64,...`) or '' to use text */
  logo: string
  phone: string
  phone2: string
  address: string
  /** سجل تجاري — commercial registration number */
  taxNumber: string
  /** الرقم الضريبي — VAT / tax ID */
  vatNumber: string
  /** Closing thank-you line */
  footer: string
  /** Legal / policy lines (return policy, offers, …) */
  terms: string
  /** Website or social handle */
  social: string
  /** Currency label printed next to every amount */
  currencyLabel: string
  showLogo: boolean
  showCashier: boolean
  showOrderId: boolean
  showTax: boolean
}

export const RECEIPT_INFO_DEFAULTS: ReceiptInfo = {
  storeName: 'Crunch Time',
  tagline: '',
  logo: '',
  phone: '',
  phone2: '',
  address: '',
  taxNumber: '',
  vatNumber: '',
  footer: 'شكراً لزيارتكم',
  terms: '',
  social: '',
  currencyLabel: 'ج.م',
  showLogo: true,
  showCashier: true,
  showOrderId: true,
  showTax: true,
}

// SQLite hands back 0/1 integers, drizzle booleans come back as booleans and
// JSON-ish sources may use "0"/"false" — treat all of them the same way.
// The logo is embedded into print HTML as an <img src>, so only accept inline
// raster data URLs (never remote paths or script/svg payloads).
const SAFE_LOGO_RE = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,[a-z0-9+/=\s]+$/i

export function safeLogoSrc(logo: string | null | undefined): string {
  const value = String(logo ?? '').trim()
  return SAFE_LOGO_RE.test(value) ? value : ''
}

function boolField(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null || v === '') return fallback
  if (typeof v === 'string') return v !== '0' && v.toLowerCase() !== 'false'
  return Boolean(v)
}

function strField(v: unknown, fallback: string): string {
  if (v === undefined || v === null) return fallback
  return String(v).trim() || fallback
}

function optionalStr(v: unknown): string {
  if (v === undefined || v === null) return ''
  return String(v).trim()
}

/**
 * Normalize a raw settings row into a ReceiptInfo.
 * Unknown/legacy rows (or a missing settings row) degrade to the defaults,
 * so callers can always rely on every field being a printable string/boolean.
 */
export function normalizeReceiptInfo(raw: any): ReceiptInfo {
  const s = raw && typeof raw === 'object' ? raw : {}
  return {
    // The settings column is `restaurantName`; `storeName` is accepted as an alias
// so already-normalized ReceiptInfo objects round-trip through this function.
storeName: strField(s.restaurantName ?? s.storeName, RECEIPT_INFO_DEFAULTS.storeName),
    tagline: optionalStr(s.storeTagline ?? s.tagline),
    logo: safeLogoSrc(s.storeLogo ?? s.logo),
    phone: optionalStr(s.storePhone),
    phone2: optionalStr(s.storePhone2),
    address: optionalStr(s.storeAddress),
    taxNumber: optionalStr(s.taxNumber),
    vatNumber: optionalStr(s.vatNumber),
    footer: optionalStr(s.receiptFooter) || RECEIPT_INFO_DEFAULTS.footer,
    terms: optionalStr(s.receiptTerms),
    social: optionalStr(s.receiptSocial),
    currencyLabel: optionalStr(s.currencyLabel) || RECEIPT_INFO_DEFAULTS.currencyLabel,
    showLogo: boolField(s.showLogo, RECEIPT_INFO_DEFAULTS.showLogo),
    showCashier: boolField(s.showCashier, RECEIPT_INFO_DEFAULTS.showCashier),
    showOrderId: boolField(s.showOrderId, RECEIPT_INFO_DEFAULTS.showOrderId),
    showTax: boolField(s.showTax, RECEIPT_INFO_DEFAULTS.showTax),
  }
}

/** Contact lines (phone / address) as printed under the letterhead. */
export function receiptContactLines(info: ReceiptInfo): string[] {
  const lines: string[] = []
  const phones = [info.phone, info.phone2].map(p => p.replace(/[^\d+]/g, '')).filter(Boolean)
  if (phones.length > 0) lines.push(phones.join(' · '))
  if (info.address) lines.push(info.address)
  return lines
}

/** Legal registration line (س.ت / رقم ضريبي), omitted when both are empty. */
export function receiptLegalLine(info: ReceiptInfo): string {
  const parts: string[] = []
  if (info.taxNumber) parts.push(`س.ت: ${info.taxNumber}`)
  if (info.vatNumber) parts.push(`رقم ضريبي: ${info.vatNumber}`)
  return parts.join(' — ')
}

/** Split a free-text block into printable lines. */
export function receiptLines(text: string): string[] {
  return optionalStr(text).split('\n').map(l => l.trim()).filter(Boolean)
}

// ─── Logo processing ───────────────────────────────────────────
// The logo travels inside the print HTML as a data URL, so it gets downscaled
// before it reaches the database (keeps settings rows and print payloads small).

export const LOGO_MAX_WIDTH = 420
export const LOGO_MAX_HEIGHT = 180
/** Hard ceiling for the stored base64 payload (~170 KB of raw image). */
export const LOGO_MAX_BYTES = 170 * 1024

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('فشل قراءة الصورة'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('الملف ده مش صورة صالحة'))
    img.src = src
  })
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  // PNG keeps logo transparency; drop to JPEG only if the result is too big.
  let out = canvas.toDataURL('image/png')
  if (out.length > LOGO_MAX_BYTES) out = canvas.toDataURL('image/jpeg', 0.85)
  return out
}

/**
 * Read + downscale a picked image file into a data URL suitable for storage.
 * Rejects with an Arabic message so the settings page can surface it directly.
 */
export async function processLogoFile(file: File): Promise<string> {
  if (!file.type?.startsWith('image/')) throw new Error('اختار ملف صورة (PNG أو JPG)')
  if (file.size > 12 * 1024 * 1024) throw new Error('الصورة كبيرة أوي — اختار صورة أقل من 12 ميجا')

  const source = await readFileAsDataUrl(file)
  const img = await loadImage(source)

  const scale = Math.min(1, LOGO_MAX_WIDTH / img.width, LOGO_MAX_HEIGHT / img.height)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('مقدرناش نجهّز الصورة')
  ctx.drawImage(img, 0, 0, w, h)

  const dataUrl = canvasToDataUrl(canvas)
  if (dataUrl.length > LOGO_MAX_BYTES) {
    throw new Error('الصورة لسه كبيرة بعد التصغير — اختار شعار أصغر أو أبسط')
  }
  return dataUrl
}