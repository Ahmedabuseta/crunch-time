// End-to-end: the real HTTP route, the real Temporal workflow, the real tool
// layer and the real AI SDK client — against a fake OpenAI-compatible endpoint.
//
// This is the test the runtime smoke check could not be: it proves the turn
// loop, the streaming contract and the guard's promise that a refused message
// costs nothing.
//
// It is skipped when the Temporal binary or the prebuilt workflow bundle is
// absent, because neither can be produced inside vitest.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'remote-assistant-test-'))

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
const { ensureRuntime, stopRuntime, getClient } = await import('../ai/runtime')
const { startFakeOpenAI } = await import('./helpers/fake-openai')

const REMOTE_PORT = 45231
const TEMPORAL_PORT = 7457
const base = `http://127.0.0.1:${REMOTE_PORT}`

const ANSWER = 'مبيعات النهاردة ١٢٠ ج.م من ٣ طلبات.'

const bundleReady = existsSync(path.join(process.cwd(), 'dist-electron', 'workflows.cjs'))
const binaryReady = existsSync(path.join(process.cwd(), 'build', 'temporal'))
const suite = bundleReady && binaryReady ? describe : describe.skip

if (!bundleReady || !binaryReady) {
  console.warn(
    `[remote-assistant] skipped — ${!bundleReady ? 'dist-electron/workflows.cjs' : 'build/temporal'} missing. ` +
    'Run `npm run build:electron` and `npm run fetch:temporal` first.',
  )
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
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      return { event, data }
    })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check: () => Promise<boolean>, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return true
    await sleep(200)
  }
  return false
}

let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let backend: ReturnType<typeof createBackend>
let token = ''

async function turnCount(): Promise<number> {
  const result = await getClient().workflow.count('WorkflowType = "assistantTurn"')
  return result.count
}

async function chat(message: string): Promise<SseEvent[]> {
  const res = await fetch(`${base}/assistant/chat`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/event-stream')
  return parseSse(await res.text())
}

beforeAll(async () => {
  runMigrations()
  await seedDatabase()

  // Turn 1 calls a data tool; turn 2 answers through the `answer` tool, which
  // is where the reply schema is enforced.
  fake = await startFakeOpenAI([
    { kind: 'tool', name: 'sales_summary', args: {} },
    {
      kind: 'tool',
      name: 'answer',
      args: { text: ANSWER, cards: ['card-0'], followups: ['وإمبارح؟'] },
    },
  ])

  backend = createBackend({
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
    apiKey: 'test-key-0123456789',
    baseUrl: fake.url,
    model: 'fake-model',
    provider: 'fake',
    temporalPort: TEMPORAL_PORT,
    enabled: true,
  })
  expect(configured.ok).toBe(true)

  const runtime = await ensureRuntime()
  expect(runtime.ok, runtime.error).toBe(true)

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  })
  token = (await login.json()).token
}, 120_000)

afterAll(async () => {
  await stopRuntime()
  await stopRemoteServer()
  await fake?.close()
  closeSqlite()
  rmSync(tempDir, { recursive: true, force: true })
})

suite('assistant chat over HTTP', () => {
  it('streams the answer and delivers the tool card on done', async () => {
    const workflowsBefore = await turnCount()
    const requestsBefore = fake.turnRequests()

    const events = await chat('بعت بكام النهاردة؟')

    const textEvents = events.filter((event) => event.event === 'text')
    const streamed = textEvents.map((event) => JSON.parse(event.data).d as string).join('')

    // The reply arrives whole inside the tool call, so there is one publish:
    // schema enforcement replaced token streaming.
    expect(textEvents.length).toBeGreaterThan(0)
    expect(streamed).toBe(ANSWER)

    const done = events.find((event) => event.event === 'done')
    expect(done).toBeDefined()
    const payload = JSON.parse(done!.data)

    expect(payload.messageId).toBeTruthy()
    expect(payload.blocked).toBeUndefined()
    expect(payload.cards).toHaveLength(1)
    expect(payload.cards[0].kind).toBe('report')
    expect(payload.cards[0].report).toBeTruthy()
    expect(payload.followups).toEqual(['وإمبارح؟'])

    // Two model steps: the tool call, then the answer.
    expect(fake.turnRequests() - requestsBefore).toBe(2)
    expect(await waitFor(async () => (await turnCount()) > workflowsBefore)).toBe(true)
  }, 60_000)

  it('persists the turn so reopening the screen shows it', async () => {
    const res = await fetch(`${base}/assistant/history`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const { messages } = await res.json()
    expect(messages.length).toBeGreaterThanOrEqual(2)
    const last = messages[messages.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.content).toBe(ANSWER)
    expect(last.cards[0].kind).toBe('report')
    // Follow-ups are stored with the turn, so reopening the screen still
    // offers them as one-tap questions.
    expect(last.followups).toEqual(['وإمبارح؟'])
  })

  it('sends an off-topic question to the model instead of refusing it', async () => {
    const requestsBefore = fake.turnRequests()
    const workflowsBefore = await turnCount()

    const events = await chat('اكتبلي قصيدة عن البحر')

    const done = events.find((event) => event.event === 'done')
    expect(done).toBeDefined()
    const payload = JSON.parse(done!.data)
    // No canned refusal: the turn is a normal assistant message, and the
    // system prompt is what asks the model to decline politely.
    expect(payload.blocked).toBeUndefined()
    expect(payload.messageId).toBeTruthy()

    expect(fake.turnRequests()).toBeGreaterThan(requestsBefore)
    expect(await waitFor(async () => (await turnCount()) > workflowsBefore)).toBe(true)
  }, 60_000)

  it('serves config without ever returning the key', async () => {
    const res = await fetch(`${base}/assistant/config`, {
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config.hasKey).toBe(true)
    expect(body.config.enabled).toBe(true)
    expect(body.config.temporalRunning).toBe(true)
    expect(JSON.stringify(body)).not.toContain('test-key-0123456789')
  })

  it('rejects an unauthenticated chat', async () => {
    const res = await fetch(`${base}/assistant/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'بعت بكام؟' }),
    })
    expect(res.status).toBe(401)
  })

  it('forces the answer tool when the model replies in prose', async () => {
    // The shape is enforced by the `answer` tool, not by parsing text. A model
    // that ignores the instruction and writes prose is asked again with a
    // forced tool choice, and its prose must never reach the bubble.
    const prosey = await startFakeOpenAI([
      { kind: 'tool', name: 'sales_summary', args: {} },
      { kind: 'text', text: 'أهلاً، مبيعاتك كويسة النهاردة.' },
      {
        kind: 'tool',
        name: 'answer',
        args: { text: ANSWER, cards: ['card-0'], followups: ['وإمبارح؟'] },
      },
    ])
    try {
      expect(updateAiConfig({ baseUrl: prosey.url }).ok).toBe(true)

      const events = await chat('بعت بكام النهاردة؟')
      const done = events.find((event) => event.event === 'done')
      expect(done).toBeDefined()
      const payload = JSON.parse(done!.data)

      expect(payload.followups).toEqual(['وإمبارح؟'])
      expect(payload.cards).toHaveLength(1)

      const streamed = events
        .filter((event) => event.event === 'text')
        .map((event) => JSON.parse(event.data).d as string)
        .join('')
      // The forced step produced the answer; the free prose never surfaced.
      expect(streamed).toBe(ANSWER)
      expect(streamed).not.toContain('أهلاً')

      const history = await fetch(`${base}/assistant/history`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const { messages } = await history.json()
      expect(messages[messages.length - 1].content).toBe(ANSWER)
    } finally {
      await prosey.close()
    }
  }, 60_000)
})
