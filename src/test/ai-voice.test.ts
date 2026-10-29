// Speech in and out, against a fake provider.
//
// The interesting parts are not "does fetch work" but: is the Arabic model
// asked for, is the text capped so a spoken answer cannot become a monologue,
// and does a rejected key stay a 400 rather than looking like an expired
// session to the phone.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'ai-voice-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { closeSqlite } = await import('../db/client')
const { updateAiConfig } = await import('../ai/config')
const { transcribe, synthesize, STT_MODEL, TTS_MODEL, TTS_VOICE, MAX_SPEECH_CHARS, VoiceError } =
  await import('../ai/voice')

const AUDIO = Buffer.from('fake-audio-bytes')

interface Seen {
  transcription: { model?: string; language?: string; contentType?: string } | null
  speech: any
}

let seen: Seen = { transcription: null, speech: null }
let status = 200
let server: ReturnType<typeof createServer>
let baseUrl = ''

beforeAll(async () => {
  runMigrations()
  await seedDatabase()

  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks)
      const contentType = String(req.headers['content-type'] ?? '')

      if (req.url?.endsWith('/audio/transcriptions')) {
        // A multipart body: the model and language are plain text parts.
        const body = raw.toString('utf8')
        seen.transcription = {
          contentType,
          model: /name="model"\r\n\r\n([^\r]+)/.exec(body)?.[1],
          language: /name="language"\r\n\r\n([^\r]+)/.exec(body)?.[1],
        }
        if (status !== 200) {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'nope' }))
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ text: '  بعت بكام النهاردة؟  ' }))
        return
      }

      if (req.url?.endsWith('/audio/speech')) {
        seen.speech = JSON.parse(raw.toString('utf8'))
        if (status !== 200) {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end('{}')
          return
        }
        res.writeHead(200, { 'content-type': 'audio/mpeg' })
        res.end(Buffer.from('mp3-bytes'))
        return
      }

      res.writeHead(404).end()
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  expect(updateAiConfig({ apiKey: 'gsk-test-0123456789', baseUrl }).ok).toBe(true)
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('transcription', () => {
  it('asks for the Arabic Whisper model and trims the result', async () => {
    status = 200
    const text = await transcribe(AUDIO, 'audio/mp4')

    expect(text).toBe('بعت بكام النهاردة؟')
    expect(seen.transcription?.model).toBe(STT_MODEL)
    // Arabic is named explicitly; the owner speaks Egyptian dialect.
    expect(seen.transcription?.language).toBe('ar')
    expect(seen.transcription?.contentType).toContain('multipart/form-data')
  })

  it('refuses an empty recording before calling the provider', async () => {
    await expect(transcribe(Buffer.alloc(0))).rejects.toMatchObject({ code: 'empty_audio' })
  })

  it('maps a rejected key to a provider_auth error, not a session error', async () => {
    status = 401
    await expect(transcribe(AUDIO)).rejects.toBeInstanceOf(VoiceError)
    await expect(transcribe(AUDIO)).rejects.toMatchObject({ code: 'provider_auth' })
    status = 200
  })
})

describe('speech', () => {
  it('asks for the Arabic voice and returns the audio bytes', async () => {
    status = 200
    const result = await synthesize('مبيعات النهاردة ٤٢٠٠ ج.م')

    expect(result.mime).toBe('audio/mpeg')
    expect(result.audio.toString()).toBe('mp3-bytes')
    expect(seen.speech.model).toBe(TTS_MODEL)
    expect(seen.speech.voice).toBe(TTS_VOICE)
    expect(seen.speech.response_format).toBe('mp3')
  })

  it('caps a long answer so it cannot become a monologue', async () => {
    status = 200
    await synthesize('ا'.repeat(5000))
    expect(seen.speech.input.length).toBe(MAX_SPEECH_CHARS)
  })

  it('refuses empty text', async () => {
    await expect(synthesize('   ')).rejects.toMatchObject({ code: 'empty_text' })
  })
})
