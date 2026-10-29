// The assistant's HTTP surface.
//
// Everything here runs behind the existing bearer-token hook, exactly like the
// rest of the remote POS routes. The chat endpoint is the first streaming route
// in this codebase: it hijacks the reply so Fastify does not try to send a body
// of its own, then writes SSE frames while the workflow runs.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Backend } from '../backend'
import { uuid } from '../backend/shared'
import { getAiConfig, getProviderKey, keyHint, threadId, updateAiConfig, type AiConfigPatch } from '../ai/config'
import { getSavedReply, type ReplyKey } from '../ai/guard/replies'
import { needsClassifier, verdict } from '../ai/guard/topic'
import { normalizeArabic } from '../ai/guard/arabic'
import { isAboutTheApp } from '../ai/guard/classify'
import { recordUsage, todaySnapshot, withinBudget } from '../ai/guard/budget'
import { appendMessage, clearHistory, listMessages } from '../ai/history'
import { cancelAction, executeAction, getAction } from '../ai/actions'
import { closeTurn, subscribe, type TurnEvent } from '../ai/streams'
import { ensureRuntime, getClient, runtimeStatus, TASK_QUEUE } from '../ai/runtime'
import { createRateLimiter } from './ratelimit'

// A single owner tapping a suggestion chip a few times is normal; a script is
// not. 20 turns a minute is well above human speed.
const chatLimiter = createRateLimiter({ max: 20, windowMs: 60_000, lockMs: 60_000 })

const RATE_KEY = 'owner'

interface ChatBody {
  message?: string
}

interface TurnMessage {
  messageId: string
  text: string
  cards: unknown[]
  followups: string[]
  promptTokens: number
  completionTokens: number
}

type Blocked = { blocked: ReplyKey; message: string }
type Ready = { ok: true }

export function registerAssistantRoutes(app: FastifyInstance, backend: Backend) {
  void backend

  // ─── Config ─────────────────────────────────────────────────
  app.get('/assistant/config', async () => {
    const config = getAiConfig()
    const runtime = runtimeStatus()
    return {
      config: {
        ...config,
        keyHint: keyHint(),
        today: todaySnapshot(config.dailyTokenLimit),
        temporalRunning: runtime.running,
        temporalError: runtime.error,
      },
    }
  })

  app.put('/assistant/config', async (req, reply) => {
    const patch = (req.body || {}) as AiConfigPatch
    const result = updateAiConfig(patch)
    if (!result.ok) return reply.code(400).send({ ok: false, error: result.error })
    // Enabling or moving the port has to move the runtime with it, so the
    // stored config and the running processes can never disagree.
    if (patch.enabled !== undefined || patch.temporalPort !== undefined) {
      await ensureRuntime()
    }
    const config = getAiConfig()
    return { config: { ...config, keyHint: keyHint(), today: todaySnapshot(config.dailyTokenLimit) } }
  })

  // One-token ping, so a bad key is distinguishable from a bad model name.
  app.post('/assistant/test', async (_req, reply) => {
    const config = getAiConfig()
    if (!config.hasKey) return reply.code(400).send({ ok: false, error: getSavedReply('no_key') })
    const started = Date.now()
    try {
      const { generateText } = await import('ai')
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
      const provider = createOpenAICompatible({
        name: config.provider || 'openai-compatible',
        baseURL: config.baseUrl,
        apiKey: getProviderKey() ?? '',
      })
      await generateText({
        model: provider(config.model),
        prompt: 'ping',
        maxOutputTokens: 1,
        temperature: 0,
      })
      recordUsage({ promptTokens: 1, completionTokens: 1 })
      return { ok: true, model: config.model, latencyMs: Date.now() - started }
    } catch (err: any) {
      return { ok: false, error: providerMessage(err) }
    }
  })

  // ─── History ────────────────────────────────────────────────
  app.get('/assistant/history', async (req) => {
    const query = (req.query || {}) as Record<string, unknown>
    const limit = Number(query.limit) || 50
    return {
      messages: listMessages(threadId(), limit, query.before ? String(query.before) : undefined),
    }
  })

  app.delete('/assistant/history', async () => {
    clearHistory(threadId())
    return { ok: true }
  })

  // ─── Chat ───────────────────────────────────────────────────
  app.post('/assistant/chat', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body || {}) as ChatBody
    const message = String(body.message ?? '').trim()
    const wantsStream = String((req.query as Record<string, unknown>)?.stream ?? '1') !== '0'
    const thread = threadId()
    const turnId = uuid()

    if (!wantsStream) {
      const outcome = await prepareTurn(message, thread)
      if ('blocked' in outcome) {
        return { ok: true, blocked: outcome.blocked, message: outcome.message }
      }
      try {
        return { ok: true, message: await runTurn(turnId, thread, message) }
      } catch (err: any) {
        return reply.code(502).send({ ok: false, error: providerMessage(err) })
      }
    }

    // Hijack before writing: Fastify must not try to send a body after us, and
    // the headers have to be on the wire before the workflow starts producing
    // deltas.
    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    let finished = false
    const canWrite = () => !finished && !raw.writableEnded && !raw.destroyed
    const send = (event: string, data: unknown) => {
      if (!canWrite()) return
      try {
        raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      } catch {
        finished = true
      }
    }
    // Ends the response exactly once. Called from `finally`, so a turn that
    // throws still terminates the stream instead of leaving the phone hanging.
    const finish = () => {
      if (finished) return
      finished = true
      try {
        if (!raw.writableEnded) raw.end()
      } catch {
        // the socket is gone; nothing left to close
      }
    }

    const unsubscribe = subscribe(turnId, (event: TurnEvent) => {
      if (event.type === 'status') send('status', { tool: event.tool })
      else if (event.type === 'text') send('text', { d: event.delta })
    })

    // `req.raw`'s own 'close' fires as soon as the request body is fully read,
    // which is before the turn has even started — so the response is what is
    // watched instead.
    reply.raw.on('close', () => {
      // The phone went away. Stop writing, but let the workflow finish so the
      // answer is in the transcript — and so a proposed action still exists to
      // be confirmed.
      unsubscribe()
      closeTurn(turnId)
    })

    try {
      const outcome = await prepareTurn(message, thread)
      if ('blocked' in outcome) {
        send('text', { d: outcome.message })
        send('done', { messageId: null, cards: [], followups: [], blocked: outcome.blocked })
      } else {
        const result = await runTurn(turnId, thread, message)
        send('done', {
          messageId: result.messageId,
          cards: result.cards,
          followups: result.followups,
          usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
        })
      }
    } catch (err: any) {
      send('error', { code: 'turn_failed', message: providerMessage(err) })
    } finally {
      unsubscribe()
      closeTurn(turnId)
      finish()
    }
  })

  // ─── Actions ────────────────────────────────────────────────
  app.post('/assistant/actions/:id/confirm', async (req, reply) =>
    decideAction(String((req.params as Record<string, unknown>).id), true, reply))

  app.post('/assistant/actions/:id/cancel', async (req, reply) =>
    decideAction(String((req.params as Record<string, unknown>).id), false, reply))

  app.get('/assistant/actions/:id', async (req, reply) => {
    const action = getAction(String((req.params as Record<string, unknown>).id))
    if (!action) return reply.code(404).send({ ok: false, error: 'الإجراء غير موجود' })
    return { ok: true, action: { status: action.status, preview: action.preview } }
  })

  // ─── Internals ──────────────────────────────────────────────

  /**
   * Everything that can reject a message before it costs anything: disabled,
   * no key, rate limit, budget, then the topic guard, and only then the runtime.
   */
  async function prepareTurn(message: string, thread: string): Promise<Blocked | Ready> {
    const config = getAiConfig()
    if (!config.enabled) return block(thread, message, 'disabled')
    if (!config.hasKey) return block(thread, message, 'no_key')

    if (chatLimiter.retryAfter(RATE_KEY) !== null) return block(thread, message, 'rate_limited')
    if (!withinBudget(config.dailyTokenLimit)) return block(thread, message, 'budget')
    if (message.length < 2) return block(thread, message, 'empty')

    const decision = verdict(message, { previousTurnWasTool: lastAssistantHadCards(thread) })
    if (decision.decision === 'block') {
      const key: ReplyKey = decision.reason === 'empty'
        ? 'empty'
        : decision.reason === 'greeting'
          ? 'greeting'
          : 'off_topic'
      return block(thread, message, key)
    }

    if (needsClassifier(decision) && !(await isAboutTheApp(normalizeArabic(message)))) {
      return block(thread, message, 'off_topic')
    }

    const runtime = await ensureRuntime()
    if (!runtime.ok) return block(thread, message, 'temporal_down')

    return { ok: true }
  }

  /** Records a refused turn so the transcript explains why nothing happened. */
  function block(thread: string, message: string, key: ReplyKey): Blocked {
    chatLimiter.recordFailure(RATE_KEY)
    const text = getSavedReply(key)
    try {
      appendMessage(thread, 'user', message)
      appendMessage(thread, 'assistant', text)
    } catch {
      // The transcript is best-effort; the reply still reaches the phone.
    }
    return { blocked: key, message: text }
  }

  function lastAssistantHadCards(thread: string): boolean {
    try {
      const rows = listMessages(thread, 2)
      const last = rows[rows.length - 1]
      return Boolean(last && last.role === 'assistant' && last.cards.length > 0)
    } catch {
      return false
    }
  }

  async function decideAction(id: string, approve: boolean, reply: FastifyReply) {
    const action = getAction(id)
    if (!action) return reply.code(404).send({ ok: false, error: 'الإجراء غير موجود' })
    if (action.status === 'executed') return { ok: true, status: 'executed' }
    if (action.status !== 'proposed') {
      return reply.code(409).send({ ok: false, status: action.status, error: 'الإجراء ده اتلغى أو انتهى' })
    }

    // Prefer the workflow: it is what makes the confirm durable, and its
    // validator rejects a malformed decision before anything is written.
    if (action.workflowId) {
      try {
        const handle = getClient().workflow.getHandle(action.workflowId)
        const result = await handle.executeUpdate<{ status: string; ok: boolean; error?: string }, [boolean]>('confirm', {
          args: [approve],
        })
        return { ok: result.ok, status: result.status, error: result.error }
      } catch {
        // Fall through: a Temporal outage must not strand a write the owner
        // has already agreed to.
      }
    }

    const result = approve
      ? executeAction(id, 'المساعد')
      : cancelAction(id)
    return { ok: result.ok, status: result.status, error: 'error' in result ? result.error : undefined }
  }

  /**
   * Persists the user turn, starts the workflow and waits for its result. The
   * workflow reads history itself, so the user row is written first — otherwise
   * the model would never see the question it is answering.
   */
  async function runTurn(turnId: string, thread: string, message: string): Promise<TurnMessage> {
    appendMessage(thread, 'user', message)
    const client = getClient()
    const handle = await client.workflow.start('assistantTurn', {
      taskQueue: TASK_QUEUE,
      workflowId: `turn-${turnId}`,
      args: [{ turnId, threadId: thread, message }],
      searchAttributes: { ThreadId: [thread] },
    })
    return (await handle.result()) as TurnMessage
  }
}

function providerMessage(err: any): string {
  const status = Number(err?.statusCode ?? err?.status ?? 0)
  if (status === 401 || status === 403) return 'مفتاح API مرفوض — راجع المفتاح في الإعدادات'
  if (status === 429) return 'المزوّد بيرفض الطلبات دلوقتي — جرّب بعد شوية'
  const message = String(err?.message ?? '')
  if (/not found|unknown.*workflow|activity/i.test(message)) return 'خدمة التشغيل مش جاهزة — أعد تفعيل المساعد'
  return message.slice(0, 240) || 'حصل خطأ غير متوقع'
}
