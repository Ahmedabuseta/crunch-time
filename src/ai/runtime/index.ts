// Runtime orchestration: server, worker, client — one switch.
//
// The assistant is only usable while all three are up, and a half-up runtime is
// worse than a down one (the phone would hang on a start it can never finish),
// so `ensureRuntime` is all-or-nothing and reports the first failure.
import { Client, Connection, WorkflowNotFoundError } from '@temporalio/client'
import { getAiConfig } from '../config'
import { startTemporal, stopTemporal, temporalStatus } from './server'
import { startWorker, stopWorker, workerStatus, TASK_QUEUE } from './worker'

let client: Client | null = null
let connection: Connection | null = null
let lastError: string | null = null

export { TASK_QUEUE }

export interface RuntimeStatus {
  enabled: boolean
  running: boolean
  port: number | null
  uiPort: number | null
  error: string | null
  binaryMissing: boolean
  workerRunning: boolean
}

export function runtimeStatus(): RuntimeStatus {
  const config = getAiConfig()
  const temporal = temporalStatus()
  const worker = workerStatus()
  return {
    enabled: config.enabled,
    running: temporal.running && worker.running,
    port: temporal.port,
    uiPort: temporal.uiPort,
    error: lastError ?? temporal.error ?? worker.error,
    binaryMissing: temporal.binaryMissing,
    workerRunning: worker.running,
  }
}

export async function ensureRuntime(): Promise<{ ok: boolean; error?: string }> {
  const config = getAiConfig()
  if (!config.enabled) {
    await stopRuntime()
    return { ok: true }
  }

  const started = await startTemporal(config.temporalPort)
  if (!started.ok) {
    lastError = started.error ?? 'تعذّر تشغيل خدمة التشغيل'
    return { ok: false, error: lastError ?? undefined }
  }

  const worked = await startWorker(config.temporalPort)
  if (!worked.ok) {
    lastError = worked.error ?? 'تعذّر تشغيل العامل'
    await stopTemporal()
    return { ok: false, error: lastError }
  }

  try {
    if (!connection) {
      connection = await Connection.connect({ address: `127.0.0.1:${config.temporalPort}` })
      client = new Client({ connection })
    }
  } catch (err: any) {
    lastError = err?.message || 'تعذّر الاتصال بخدمة التشغيل'
    await stopRuntime()
    return { ok: false, error: lastError ?? undefined }
  }

  lastError = null
  return { ok: true }
}

export async function stopRuntime(): Promise<void> {
  await stopWorker()
  try {
    await connection?.close()
  } catch {
    // already closed
  }
  connection = null
  client = null
  await stopTemporal()
}

export function getClient(): Client {
  if (!client) throw new Error('خدمة التشغيل مش جاهزة')
  return client
}

/** True when a workflow id is still running — used to avoid double-starting. */
export async function workflowExists(workflowId: string): Promise<boolean> {
  try {
    const handle = getClient().workflow.getHandle(workflowId)
    await handle.describe()
    return true
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) return false
    return false
  }
}
