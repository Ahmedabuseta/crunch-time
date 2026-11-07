// REAL end-to-end run against a live provider.
//
// Unlike `remote-assistant.test.ts`, this uses a real model: a scripted message
// from the owner goes through the real HTTP route, the real Temporal workflow,
// the real tool layer and a real gpt-oss-120b. The model chooses its own tool
// calls, so this is the only test that can show whether the prompt, the router
// and the resolvers actually handle a messy multi-part message.
//
// Credentials come from the environment and are never written to disk.
// Skipped when REAL_TEST_KEY or the Temporal runtime is missing.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'real-assistant-test-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { runMigrations } = await import('../db/migrate')
const { seedDatabase } = await import('../db/seed')
const { closeSqlite } = await import('../db/client')
const { createBackend } = await import('../backend')
const { applyRemoteServer, stopRemoteServer } = await import('../server')
const { updateAiConfig } = await import('../ai/config')
const { ensureRuntime, stopRuntime } = await import('../ai/runtime')

const KEY = process.env.REAL_TEST_KEY ?? ''
/** Any OpenAI-compatible endpoint: OpenRouter, Groq, a local server. */
const BASE_URL = process.env.REAL_TEST_URL ?? 'https://openrouter.ai/api/v1'
const MODEL = process.env.REAL_TEST_MODEL ?? 'openai/gpt-oss-120b'
const REMOTE_PORT = 45233
const TEMPORAL_PORT = 7459
const base = `http://127.0.0.1:${REMOTE_PORT}`

const MESSAGE = `تم استبدال ١٥ كيلو كوردن ب ١٠ كيلو
 واستبدال ١٠ شاهيتا حار ب ٥ حار
واستبدل ٤ برجر ب ٣
 وشراء ١ جركن كاتشب 
وشراء ١ جركن هريسه
و فيه اخر واحد دايم كفته دي مجبتهاش عشان تاريخها لقيته مش تمام ورجعتها وهما ضافولي فلوسها يعني متضيفش الكفته دي`

const bundleReady = existsSync(path.join(process.cwd(), 'dist-electron', 'workflows.cjs'))
const binaryReady = existsSync(path.join(process.cwd(), 'build', 'temporal'))
const suite = KEY && bundleReady && binaryReady ? describe : describe.skip

if (!suite) {
  console.warn(`[real-assistant] skipped — ${!KEY ? 'GROQ_API_KEY' : 'temporal runtime'} missing`)
}

interface SseEvent {
  event: string
  data: string
}

function parseSse(body: string): SseEvent[] {
  return body
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/)
      const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message'
      const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
      return { event, data }
    })
}

let token = ''

async function chat(message: string, retry = false): Promise<SseEvent[]> {
  const res = await fetch(`${base}/assistant/chat`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message, ...(retry ? { retry: true } : {}) }),
  })
  expect(res.status).toBe(200)
  return parseSse(await res.text())
}

/** What the phone would end up showing: appends, then the final replacement. */
function settledText(events: SseEvent[]): string {
  return events
    .filter((event) => event.event === 'text')
    .reduce((shown, event) => {
      const data = JSON.parse(event.data) as { d: string; replace?: boolean }
      return data.replace ? data.d : shown + data.d
    }, '')
}

suite('REAL provider turn', () => {
  beforeAll(async () => {
    runMigrations()
    await seedDatabase()

    const backend = createBackend({
      print: async () => ({ ok: true }),
      listPrinters: async () => [{ name: 'Test Printer', isDefault: true }],
      dialogs: {
        showSaveDialog: async () => ({ canceled: true }),
        showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      },
      app: { getPath: () => tempDir, relaunch: () => {}, exit: () => {} },
    })

    backend.session.setUser({ id: 'test-admin', role: 'admin' })
    await backend.settings.setRemotePin('1234')
    expect(backend.settings.setRemoteConfig({ enabled: true, port: REMOTE_PORT }).ok).toBe(true)
    expect((await applyRemoteServer(backend)).ok).toBe(true)

    const configured = updateAiConfig({
      apiKey: KEY,
      baseUrl: BASE_URL,
      model: MODEL,
      provider: 'openrouter',
      temporalPort: TEMPORAL_PORT,
      enabled: true,
      dailyTokenLimit: 5_000_000,
    })
    expect(configured.ok, JSON.stringify(configured)).toBe(true)

    const runtime = await ensureRuntime()
    expect(runtime.ok, runtime.error).toBe(true)

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '1234' }),
    })
    token = (await login.json()).token
    expect(token).toBeTruthy()
  }, 120_000)

  afterAll(async () => {
    await stopRuntime()
    await stopRemoteServer()
    closeSqlite()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('answers the owner\'s real multi-part inventory message', async () => {
    const events = await chat(MESSAGE)

    const done = events.find((event) => event.event === 'done')
    expect(done, `no done event. events: ${JSON.stringify(events).slice(0, 2000)}`).toBeDefined()
    const payload = JSON.parse(done!.data)

    const thinking = events.filter((e) => e.event === 'thinking').map((e) => JSON.parse(e.data).d).join('')
    const statuses = events.filter((e) => e.event === 'status').map((e) => JSON.parse(e.data).tool)
    const text = settledText(events)

    // Everything the model actually did, printed for the run log.
    console.log('\n===== REAL TURN =====')
    console.log('THINKING CHARS:', thinking.length)
    if (thinking) console.log('THINKING:', thinking.slice(0, 700))
    console.log('TOOLS:', JSON.stringify(statuses))
    console.log('ANSWER:', text)
    console.log('CARDS:', JSON.stringify(payload.cards?.map((c: any) => ({ kind: c.kind, title: c.title, subject: c.subject, status: c.status })), null, 1))
    console.log('FOLLOWUPS:', JSON.stringify(payload.followups))

    // The per-turn trace: the only place that shows how many steps the model
    // actually spent, which is what separates "wrong plan" from "ran out of
    // budget while still reading".
    try {
      const dir = path.join(tempDir, 'assistant-traces')
      const files = readdirSync(dir).filter((name) => name.endsWith('.jsonl'))
      const last = files.sort().reverse()[0]
      if (last) {
        const lines = readFileSync(path.join(dir, last), 'utf8').trim().split('\n')
        const trace = JSON.parse(lines[lines.length - 1])
        console.log('TRACE:', JSON.stringify({
          steps: trace.steps,
          calls: trace.calls?.map((c: any) => `${c.name}${c.ok ? '' : '(FAIL)'}`),
          promptTokens: trace.promptTokens,
          completionTokens: trace.completionTokens,
          reasoningChars: trace.reasoningChars,
          degraded: trace.degraded,
          unknownNumbers: trace.unknownNumbers,
          steers: trace.steers,
          blocks: trace.blocks,
        }, null, 1))
      }
    } catch (err) {
      console.log('TRACE unavailable:', String(err).slice(0, 120))
    }
    console.log('=====================\n')

    expect(text.length).toBeGreaterThan(0)
  }, 180_000)
})
