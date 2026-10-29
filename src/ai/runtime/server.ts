// Supervises the Temporal dev server.
//
// The binary is not on npm, so it is shipped as an extra resource (or pointed
// at with TEMPORAL_CLI_PATH). It keeps its own SQLite file under the app's
// user-data directory, which is what makes a confirmation survive an app
// restart — the whole reason this workflow exists.
import { spawn, type ChildProcess } from 'child_process'
import { createConnection } from 'net'
import { existsSync } from 'fs'
import path from 'path'
import { getElectron } from '../../backend/electron'

let child: ChildProcess | null = null
let boundPort: number | null = null
let lastError: string | null = null

export interface TemporalRuntimeStatus {
  running: boolean
  port: number | null
  uiPort: number | null
  error: string | null
  binaryPath: string | null
  binaryMissing: boolean
}

/** Where the binary might be, most specific first. */
export function findBinary(): string | null {
  // `resourcesPath` exists only in a packaged Electron build and is not part of
  // Node's own typings.
  const resourcesPath = (process as any).resourcesPath as string | undefined
  const candidates = [
    process.env.TEMPORAL_CLI_PATH,
    resourcesPath ? path.join(resourcesPath, 'temporal') : null,
    // repository build output, used by `npm run dev` and by tests
    path.join(process.cwd(), 'build', 'temporal'),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // unreadable path — keep looking
    }
  }
  return null
}

function dataDir(): string {
  try {
    return getElectron().app.getPath('userData')
  } catch {
    return process.cwd()
  }
}

export function temporalStatus(): TemporalRuntimeStatus {
  const binaryPath = findBinary()
  return {
    running: child !== null && boundPort !== null,
    port: boundPort,
    uiPort: boundPort !== null ? boundPort + 1000 : null,
    error: lastError,
    binaryPath,
    binaryMissing: !binaryPath,
  }
}

/** Polls a TCP port until it accepts a connection or the deadline passes. */
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port })
      const done = (result: boolean) => {
        socket.removeAllListeners()
        socket.destroy()
        resolve(result)
      }
      socket.setTimeout(750)
      socket.once('connect', () => done(true))
      socket.once('timeout', () => done(false))
      socket.once('error', () => done(false))
    })
    if (ok) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

/**
 * Starts the dev server and waits until its frontend port answers. Idempotent:
 * a second call on the same port is a no-op.
 */
export async function startTemporal(port: number): Promise<{ ok: boolean; error?: string }> {
  if (child && boundPort === port) return { ok: true }
  if (child) await stopTemporal()

  const binaryPath = findBinary()
  if (!binaryPath) {
    lastError = 'ملف خدمة التشغيل (temporal) غير موجود — نزّله في مجلد build'
    return { ok: false, error: lastError }
  }

  const dbFile = path.join(dataDir(), 'temporal.db')
  const args = [
    'server', 'start-dev',
    '--db-filename', dbFile,
    '--port', String(port),
    '--ui-port', String(port + 1000),
    '--headless',
    // Registered at boot because the dev server does not create search
    // attributes on first use — a workflow would otherwise be rejected.
    '--search-attribute', 'ThreadId=Keyword',
    '--search-attribute', 'Model=Keyword',
    '--search-attribute', 'Outcome=Keyword',
  ]

  try {
    const proc = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    child = proc
    boundPort = port
    lastError = null

    proc.on('exit', (code) => {
      if (child === proc) {
        child = null
        boundPort = null
        if (code !== 0) lastError = `خدمة التشغيل وقفت (${code})`
      }
    })
    proc.on('error', (err) => {
      lastError = err.message
      child = null
      boundPort = null
    })

    const ready = await waitForPort(port, 25_000)
    if (!ready) {
      lastError = 'خدمة التشغيل مبتفتحش البورت — جرّب بورت تاني'
      await stopTemporal()
      return { ok: false, error: lastError ?? undefined }
    }
    return { ok: true }
  } catch (err: any) {
    lastError = err?.message || 'تعذّر تشغيل خدمة التشغيل'
    await stopTemporal()
    return { ok: false, error: lastError ?? undefined }
  }
}

export async function stopTemporal(): Promise<void> {
  const proc = child
  child = null
  boundPort = null
  if (!proc) return
  try {
    proc.kill('SIGTERM')
  } catch {
    // already gone
  }
  // Give it a moment, then make sure.
  await new Promise((resolve) => setTimeout(resolve, 400))
  try {
    if (!proc.killed) proc.kill('SIGKILL')
  } catch {
    // already gone
  }
}

export function temporalAddress(port: number): string {
  return `127.0.0.1:${port}`
}
