// A minimal OpenAI-compatible endpoint for tests.
//
// It speaks just enough of the protocol for the AI SDK to drive a real tool
// loop: streaming chunks with tool calls, a streaming JSON answer for the
// structured-output step, and a plain completion for the topic classifier. The
// point is to exercise the real provider client and the real workflow rather
// than mocking either of them.
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export type FakeTurn =
  | { kind: 'tool'; name: string; args: Record<string, unknown> }
  | { kind: 'text'; text: string }

export interface FakeOpenAI {
  /** Pass straight into `ai_base_url`. */
  url: string
  /** Every request body received, in order. */
  requests: { body: any; at: number }[]
  /** Requests that carried a `tools` array — i.e. real turns, not classifier pings. */
  turnRequests: () => number
  close: () => Promise<void>
}

const CHUNK_ID = 'chatcmpl-fake'

function chunk(delta: Record<string, unknown>, finish: string | null = null, usage?: unknown) {
  return {
    id: CHUNK_ID,
    object: 'chat.completion.chunk',
    created: 1,
    model: 'fake-model',
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(usage ? { usage } : {}),
  }
}

function completion(content: string) {
  return {
    id: CHUNK_ID,
    object: 'chat.completion',
    created: 1,
    model: 'fake-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  }
}

/** Splits a string into short pieces so the client sees several deltas. */
function pieces(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += 9) out.push(text.slice(i, i + 9))
  return out.length > 0 ? out : ['']
}

export async function startFakeOpenAI(turns: FakeTurn[]): Promise<FakeOpenAI> {
  const requests: { body: any; at: number }[] = []
  let turnIndex = 0

  const server: Server = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (piece) => parts.push(piece))
    req.on('end', () => {
      let body: any = {}
      try {
        body = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')
      } catch {
        body = {}
      }
      requests.push({ body, at: Date.now() })

      // The classifier and the "test" ping send no tools; answer APP so an
      // uncertain-but-legitimate question still gets through the guard.
      const hasTools = Array.isArray(body.tools) && body.tools.length > 0
      if (!hasTools) {
        if (body.stream) {
          respondStream(res, [{ kind: 'text', text: 'APP' }])
        } else {
          respondJson(res, completion('APP'))
        }
        return
      }

      const turn = turns[Math.min(turnIndex, turns.length - 1)]
      turnIndex += 1

      if (body.stream) respondStream(res, [turn])
      else respondJson(res, completion(turn.kind === 'text' ? turn.text : ''))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as AddressInfo).port

  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    turnRequests: () => requests.filter((request) => Array.isArray(request.body?.tools) && request.body.tools.length > 0).length,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

function respondJson(res: import('node:http').ServerResponse, payload: unknown): void {
  const text = JSON.stringify(payload)
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

function respondStream(res: import('node:http').ServerResponse, script: FakeTurn[]): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })

  const write = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`)

  for (const turn of script) {
    if (turn.kind === 'tool') {
      write(chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: turn.name, arguments: '' } }] }))
      write(chunk({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(turn.args) } }] }))
      write(chunk({}, 'tool_calls', { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }))
      continue
    }
    write(chunk({ role: 'assistant', content: '' }))
    for (const piece of pieces(turn.text)) write(chunk({ content: piece }))
    write(chunk({}, 'stop', { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 }))
  }

  res.write('data: [DONE]\n\n')
  res.end()
}
