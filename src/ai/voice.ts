// Speech in and out, through the same BYOK provider the chat already uses.
//
// Both directions are plain OpenAI-compatible endpoints, so this works against
// Groq (`whisper-large-v3-turbo`, `playai-tts-arabic`) and against OpenAI
// without a second configuration. The key never leaves the desktop: the phone
// sends audio here and gets text back, or sends text and gets audio back.
//
// Consequence worth stating: a voice turn costs more than a typed one — the
// transcription and the speech are billed on top of the chat completion.
import { getAiConfig, getProviderKey } from './config'

/**
 * Chosen for Arabic, not for English. `playai-tts-arabic` is the voice the
 * owner will hear; `whisper-large-v3-turbo` is the fast multilingual model, and
 * it handles Egyptian dialect noticeably better than `whisper-1`.
 */
export const STT_MODEL = 'whisper-large-v3-turbo'
export const TTS_MODEL = 'playai-tts-arabic'
export const TTS_VOICE = 'Ahmad-PlayAI'

/** One spoken answer should not become a two-minute monologue. */
export const MAX_SPEECH_CHARS = 600

/** A phone recording is a few hundred kilobytes; anything near this is a bug. */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024

export class VoiceError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'VoiceError'
  }
}

function credentials(): { baseUrl: string; apiKey: string } {
  const config = getAiConfig()
  if (!config.hasKey) throw new VoiceError('مفتاح API غير محدد', 'no_key')
  const apiKey = getProviderKey()
  if (!apiKey) throw new VoiceError('مفتاح API غير محدد', 'no_key')
  return { baseUrl: config.baseUrl.replace(/\/+$/, ''), apiKey }
}

/** Turns a short recording into text. `audio` is the raw file, not base64. */
export async function transcribe(audio: Buffer, mime = 'audio/mp4'): Promise<string> {
  if (audio.length === 0) throw new VoiceError('التسجيل فاضي', 'empty_audio')
  if (audio.length > MAX_AUDIO_BYTES) throw new VoiceError('التسجيل طويل أوي', 'audio_too_large')

  const { baseUrl, apiKey } = credentials()

  // A filename is required by the endpoint even though it is never used.
  const extension = mime.includes('wav') ? 'wav' : mime.includes('mpeg') ? 'mp3' : 'm4a'
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `voice.${extension}`)
  form.append('model', STT_MODEL)
  // The owner speaks Egyptian Arabic; naming it biases the decode.
  form.append('language', 'ar')
  form.append('response_format', 'json')

  let response: Response
  try {
    response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch {
    throw new VoiceError('تعذّر الوصول لخدمة التفريغ — راجع الشبكة', 'network')
  }

  if (!response.ok) throw providerVoiceError(response.status, await readError(response))

  const body = (await response.json().catch(() => null)) as { text?: string } | null
  const text = String(body?.text ?? '').trim()
  if (!text) throw new VoiceError('مسمعتش حاجة — جرّب تقرب من الميكروفون', 'no_speech')
  return text
}

/** Renders the answer as speech. Returns the encoded audio bytes. */
export async function synthesize(text: string): Promise<{ audio: Buffer; mime: string }> {
  const spoken = String(text ?? '').trim()
  if (!spoken) throw new VoiceError('مفيش نص يتقرا', 'empty_text')

  const { baseUrl, apiKey } = credentials()

  let response: Response
  try {
    response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: spoken.slice(0, MAX_SPEECH_CHARS),
        response_format: 'mp3',
      }),
    })
  } catch {
    throw new VoiceError('تعذّر الوصول لخدمة الصوت — راجع الشبكة', 'network')
  }

  if (!response.ok) throw providerVoiceError(response.status, await readError(response))

  const audio = Buffer.from(await response.arrayBuffer())
  if (audio.length === 0) throw new VoiceError('الخدمة رجّعت صوت فاضي', 'empty_audio')
  return { audio, mime: 'audio/mpeg' }
}

async function readError(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300)
  } catch {
    return ''
  }
}

function providerVoiceError(status: number, detail: string): VoiceError {
  if (status === 401 || status === 403) {
    return new VoiceError('مفتاح API مرفوض — راجع المفتاح في الإعدادات', 'provider_auth')
  }
  if (status === 400 || status === 404) {
    // The usual cause is a provider without an audio endpoint, or a model name
    // its account cannot use.
    return new VoiceError('المزوّد رفض الطلب — تأكد إن حسابك فيه موديل الصوت ده', 'provider_rejected')
  }
  if (status === 429) return new VoiceError('المزوّد بيرفض الطلبات دلوقتي — جرّب بعد شوية', 'rate_limited')
  return new VoiceError(detail || `خطأ من المزوّد (${status})`, 'provider_error')
}
