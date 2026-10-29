// Phase 0 gate: does the assistant runtime actually work on this machine?
//
// Starts the Temporal dev server, loads the *prebuilt* workflow bundle into a
// worker and executes one `assistantTurn` against stub activities. It proves
// the three things that are easy to get wrong and expensive to discover late:
// the binary runs, the bundle is accepted by the sandbox, and the workflow's
// control flow reaches a result.
//
// Run with:  node scripts/check-assistant-runtime.mjs
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binary = process.env.TEMPORAL_CLI_PATH || path.join(root, 'build', 'temporal')
const bundlePath = path.join(root, 'dist-electron', 'workflows.cjs')
const RAW = 'assistant-turn-check'

function fail(message) {
  console.error(`FAIL  ${message}`)
  process.exit(1)
}

if (!existsSync(binary)) fail(`Temporal CLI not found at ${binary}`)
if (!existsSync(bundlePath)) fail(`Workflow bundle not found at ${bundlePath} — run npm run build:electron`)

const { Client, Connection } = await import('@temporalio/client')
const { NativeConnection, Worker } = await import('@temporalio/worker')

const port = 7433
const uiPort = port + 1000
const dataDir = mkdtempSync(path.join(tmpdir(), 'ct-temporal-check-'))

function waitForPort(target, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port: target })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) resolve(false)
        else setTimeout(attempt, 250)
      })
    }
    attempt()
  })
}

const server = spawn(binary, [
  'server', 'start-dev',
  '--db-filename', path.join(dataDir, 'temporal.db'),
  '--port', String(port),
  '--ui-port', String(uiPort),
  '--headless',
  '--search-attribute', 'ThreadId=Keyword',
], { stdio: ['ignore', 'ignore', 'pipe'] })

let serverError = ''
server.stderr.on('data', (chunk) => { serverError += String(chunk) })

async function cleanup() {
  try { server.kill('SIGKILL') } catch { /* already gone */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
}

try {
  if (!(await waitForPort(port, 40_000))) {
    fail(`Temporal server did not open port ${port}${serverError ? `\n${serverError.slice(-800)}` : ''}`)
  }

  // Stub activities: this check is about the runtime and the workflow, not the
  // model or the database.
  let step = 0
  const calls = []
  const activities = {
    async loadContext() {
      return { system: 's', messages: [{ role: 'user', content: 'بعت بكام؟' }] }
    },
    async modelStep(input) {
      calls.push(`modelStep#${input.step}`)
      step += 1
      if (step === 1) {
        return { kind: 'tool-calls', calls: [{ id: 'call-1', name: 'sales_summary', args: {} }] }
      }
      return {
        kind: 'answer',
        reply: { text: 'المبيعات ١٠٠ ج.م', cards: ['card-0'], followups: [] },
        promptTokens: 10,
        completionTokens: 5,
        degraded: false,
      }
    },
    async runTool(input) {
      calls.push(`runTool:${input.name}`)
      return { summary: 'ok', data: { total: 100 }, cards: [{ kind: 'metrics', items: [{ label: 'المبيعات', value: '100' }] }] }
    },
    async validateReply(input) {
      return { reply: input.reply, cards: input.producedCards }
    },
    async persistTurn() {
      return { messageId: 'msg-1' }
    },
  }

  const connection = await NativeConnection.connect({ address: `127.0.0.1:${port}` })
  const worker = await Worker.create({
    connection,
    taskQueue: RAW,
    activities,
    workflowBundle: { code: readFileSync(bundlePath, 'utf8') },
  })

  const client = new Client({ connection: await Connection.connect({ address: `127.0.0.1:${port}` }) })

  const result = await worker.runUntil(async () => {
    const handle = await client.workflow.start('assistantTurn', {
      taskQueue: RAW,
      workflowId: `check-${Date.now()}`,
      args: [{ turnId: 't1', threadId: 'owner', message: 'بعت بكام؟' }],
    })
    return handle.result()
  })

  await connection.close()

  if (result?.text !== 'المبيعات ١٠٠ ج.م') fail(`unexpected result: ${JSON.stringify(result)}`)
  if (!calls.includes('runTool:sales_summary')) fail(`tool activity never ran: ${calls.join(', ')}`)
  if (calls.filter((c) => c.startsWith('modelStep')).length !== 2) fail(`expected 2 model steps, got ${calls.join(', ')}`)

  console.log('PASS  temporal server starts, worker loads the bundle, assistantTurn runs')
  console.log(`      activities: ${calls.join(' → ')}`)
  await cleanup()
  process.exit(0)
} catch (err) {
  await cleanup()
  fail(err?.stack || String(err))
}
