// The Temporal worker.
//
// It runs inside the Electron main process: same process, same database
// handle, same tool layer — which is what keeps the tools from needing an RPC
// hop. The workflow bundle is prebuilt by scripts/build-electron.mjs, because
// Temporal's own bundler runs webpack at worker start and that is not something
// to do on a shop PC at boot.
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { NativeConnection, Worker } from '@temporalio/worker'
import { activities } from '../activities'
import { temporalAddress } from './server'

export const TASK_QUEUE = 'assistant'

let worker: Worker | null = null
let runPromise: Promise<void> | null = null
let lastError: string | null = null

export interface WorkerStatus {
  running: boolean
  error: string | null
  bundlePath: string | null
}

/**
 * Resolved next to the compiled main process bundle in production, and from the
 * repository root under vitest — where the module is ESM and `__dirname` does
 * not exist, so the check is a `typeof` rather than a direct reference.
 */
export function workflowBundlePath(): string {
  const candidates = [
    typeof __dirname === 'string' ? path.join(__dirname, 'workflows.cjs') : null,
    path.join(process.cwd(), 'dist-electron', 'workflows.cjs'),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[candidates.length - 1]
}

export function workerStatus(): WorkerStatus {
  const bundlePath = workflowBundlePath()
  return {
    running: worker !== null,
    error: lastError,
    bundlePath: existsSync(bundlePath) ? bundlePath : null,
  }
}

export async function startWorker(port: number): Promise<{ ok: boolean; error?: string }> {
  if (worker) return { ok: true }

  const bundlePath = workflowBundlePath()
  if (!existsSync(bundlePath)) {
    lastError = 'حزمة سير العمل غير موجودة — أعد بناء التطبيق'
    return { ok: false, error: lastError }
  }

  try {
    const connection = await NativeConnection.connect({ address: temporalAddress(port) })
    const instance = await Worker.create({
      connection,
      taskQueue: TASK_QUEUE,
      activities,
      // Prebuilt by Temporal's own bundler (scripts/build-electron.mjs), so the
      // sandbox gets the webpack-shaped bundle it expects and no bundling
      // happens at runtime.
      workflowBundle: { code: readFileSync(bundlePath, 'utf8') } as any,
    })
    worker = instance
    lastError = null
    // `run()` never resolves while the worker is healthy.
    runPromise = instance.run().catch((err: any) => {
      lastError = err?.message || 'العامل وقف'
      worker = null
    })
    return { ok: true }
  } catch (err: any) {
    lastError = err?.message || 'تعذّر تشغيل العامل'
    worker = null
    return { ok: false, error: lastError ?? undefined }
  }
}

export async function stopWorker(): Promise<void> {
  const instance = worker
  worker = null
  if (!instance) return
  try {
    await instance.shutdown()
  } catch {
    // already stopped
  }
  await runPromise?.catch(() => undefined)
  runPromise = null
}
