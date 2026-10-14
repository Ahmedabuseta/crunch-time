// Tailscale helper for the desktop Settings card.
//
// Detection is exact: we ask the CLI for the machine's own Tailscale IPv4 and
// prefer that over guessing from network interfaces. Installing and signing in
// cannot be fully silent — the install needs elevation and `tailscale up` needs
// the owner's Tailscale account in a browser — so those are best-effort: use a
// package manager when one is present, otherwise open the official download.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

export interface TailscaleStatus {
  installed: boolean
  /** Tailscale is up and this machine has an address. */
  online: boolean
  ipv4: string | null
  /** MagicDNS name, when the tailnet has it enabled. */
  dnsName: string | null
  /** Where we found the CLI, for the error message. */
  binary: string | null
  error: string | null
  canAutoInstall: boolean
}

const WINDOWS_CANDIDATES = [
  'C:\\Program Files\\Tailscale\\tailscale.exe',
  'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
]

function run(binary: string, args: string[], timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message || error)))
      else resolve(String(stdout))
    })
  })
}

/** `tailscale` on PATH, or the default Windows install location. */
function findBinary(): string | null {
  if (process.platform === 'win32') {
    for (const candidate of WINDOWS_CANDIDATES) {
      if (existsSync(candidate)) return candidate
    }
  }
  return 'tailscale'
}

/** Falls back to the CGNAT range when the CLI is unavailable. */
function tailscaleIpFromInterfaces(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list || []) {
      if (info.family !== 'IPv4' || info.internal) continue
      const octets = info.address.split('.').map(Number)
      if (octets.length === 4 && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) {
        return info.address
      }
    }
  }
  return null
}

function has(command: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  return run(probe, [command], 4000).then(() => true).catch(() => false)
}

export async function getTailscaleStatus(): Promise<TailscaleStatus> {
  const binary = findBinary()
  const canAutoInstall =
    process.platform === 'linux'
      ? true // apt/dnf one-liner, run by the owner
      : process.platform === 'darwin'
        ? await has('brew')
        : await has('winget')

  let installed = false
  let ipv4: string | null = null
  let dnsName: string | null = null
  let error: string | null = null

  if (binary) {
    try {
      const out = await run(binary, ['ip', '-4'])
      ipv4 = out.split('\n').map((l) => l.trim()).find(Boolean) ?? null
      installed = true
    } catch (err: any) {
      // `tailscale ip` fails both when the CLI is missing and when it is not
      // signed in; tell the two apart with a status probe.
      try {
        await run(binary, ['version'])
        installed = true
        error = 'Tailscale مش متسجّل دخول على الجهاز'
      } catch {
        error = null
      }
    }
  }

  if (installed) {
    try {
      const json = await run(binary as string, ['status', '--json'])
      const parsed = JSON.parse(json)
      dnsName = parsed?.Self?.DNSName ? String(parsed.Self.DNSName).replace(/\.$/, '') : null
    } catch {
      // MagicDNS is optional
    }
  }

  if (!ipv4) ipv4 = tailscaleIpFromInterfaces()

  return {
    installed,
    online: Boolean(ipv4),
    ipv4,
    dnsName,
    binary: installed ? binary : null,
    error,
    canAutoInstall,
  }
}

export interface TailscaleActionResult {
  ok: boolean
  /** What we actually did, for the UI to report honestly. */
  action: 'installed' | 'opened-download' | 'signed-in' | 'none'
  message: string
  error?: string
}

const DOWNLOAD_URL = 'https://tailscale.com/download'

/** Best-effort install. Never silent about what it did. */
export async function installTailscale(): Promise<TailscaleActionResult> {
  const { shell } = await import('electron')
  try {
    if (process.platform === 'win32' && (await has('winget'))) {
      await run(
        'winget',
        ['install', '--id', 'tailscale.tailscale', '-e', '--accept-package-agreements', '--accept-source-agreements'],
        300000
      )
      return { ok: true, action: 'installed', message: 'تم تثبيت Tailscale — سجّل الدخول من البرنامج' }
    }
    if (process.platform === 'darwin' && (await has('brew'))) {
      await run('brew', ['install', '--cask', 'tailscale'], 300000)
      return { ok: true, action: 'installed', message: 'تم تثبيت Tailscale — سجّل الدخول من البرنامج' }
    }
    await shell.openExternal(DOWNLOAD_URL)
    return {
      ok: true,
      action: 'opened-download',
      message:
        process.platform === 'linux'
          ? 'فتحنا صفحة التنزيل — على لينكس: curl -fsSL https://tailscale.com/install.sh | sh'
          : 'فتحنا صفحة تنزيل Tailscale — ثبّتها وسجّل الدخول',
    }
  } catch (err: any) {
    return { ok: false, action: 'none', message: 'تعذّر التثبيت التلقائي', error: err?.message }
  }
}

/** `tailscale up` opens the browser for the owner's Tailscale account. */
export async function tailscaleUp(): Promise<TailscaleActionResult> {
  const binary = findBinary()
  if (!binary) return { ok: false, action: 'none', message: 'Tailscale مش متثبّت' }
  try {
    await run(binary, ['up'], 120000)
    return { ok: true, action: 'signed-in', message: 'تم تسجيل الدخول في Tailscale' }
  } catch (err: any) {
    return {
      ok: false,
      action: 'none',
      message: 'لازم تسجّل الدخول من برنامج Tailscale نفسه',
      error: err?.message,
    }
  }
}

// ─── Funnel: the public HTTPS entry point ─────────────────────────────
// Funnel only accepts 443, 8443 and 10000, and `--bg` is what makes it
// permanent (it is registered with the tailscaled service, so it survives a
// reboot instead of dying with the terminal that started it).

export const FUNNEL_PORTS = [443, 8443, 10000] as const

export interface FunnelStatus {
  available: boolean
  enabled: boolean
  /** Public URL to put in the phone app, e.g. https://machine.tailnet.ts.net */
  url: string | null
  dnsName: string | null
  publicPort: number | null
  error: string | null
}

function publicUrlFor(dnsName: string | null, port: number): string | null {
  if (!dnsName) return null
  return port === 443 ? `https://${dnsName}` : `https://${dnsName}:${port}`
}

export async function getFunnelStatus(): Promise<FunnelStatus> {
  const binary = findBinary()
  const base: FunnelStatus = {
    available: false,
    enabled: false,
    url: null,
    dnsName: null,
    publicPort: null,
    error: null,
  }
  if (!binary) return base

  try {
    await run(binary, ['version'])
    base.available = true
  } catch {
    return base
  }

  try {
    const status = JSON.parse(await run(binary, ['status', '--json']))
    base.dnsName = status?.Self?.DNSName ? String(status.Self.DNSName).replace(/\.$/, '') : null
  } catch {
    // MagicDNS may be off; Funnel is useless without it
  }

  try {
    const config = JSON.parse(await run(binary, ['funnel', 'status', '--json']))
    const web = config?.Web ?? {}
    for (const key of Object.keys(web)) {
      const handlers = web[key]?.Handlers ?? {}
      const isPublic = Object.values<any>(handlers).some((h) => h?.Proxy && h?.AllowFunnel !== false)
      if (!isPublic) continue
      const port = Number(String(key).split(':').pop())
      if (!FUNNEL_PORTS.includes(port as any)) continue
      base.enabled = true
      base.publicPort = port
      base.url = publicUrlFor(base.dnsName, port)
      break
    }
  } catch (err: any) {
    // "funnel not enabled for this tailnet" lands here — surface it verbatim,
    // it carries the admin-console link the owner needs.
    if (base.dnsName) base.error = String(err?.message ?? '').trim() || null
  }

  return base
}

export async function enableFunnel(
  localPort: number,
  publicPort: number = 443
): Promise<TailscaleActionResult & { url?: string }> {
  const binary = findBinary()
  if (!binary) return { ok: false, action: 'none', message: 'Tailscale مش متثبّت' }
  if (!FUNNEL_PORTS.includes(publicPort as any)) {
    return { ok: false, action: 'none', message: 'Funnel بيشتغل على بورت 443 أو 8443 أو 10000 بس' }
  }
  try {
    await run(binary, ['funnel', '--bg', `--https=${publicPort}`, `localhost:${localPort}`], 60000)
    const status = await getFunnelStatus()
    return {
      ok: true,
      action: 'installed',
      message: 'تم تشغيل الوصول من أي مكان',
      url: status.url ?? publicUrlFor(status.dnsName, publicPort) ?? undefined,
    }
  } catch (err: any) {
    // Typically: HTTPS certificates off, or the funnel node attribute not
    // granted. The CLI's message says exactly which and links the console.
    return {
      ok: false,
      action: 'none',
      message: 'تعذّر تشغيل Funnel — لازم تفعّل HTTPS و Funnel للشبكة من لوحة Tailscale',
      error: String(err?.message ?? '').trim(),
    }
  }
}

export async function disableFunnel(publicPort: number = 443): Promise<TailscaleActionResult> {
  const binary = findBinary()
  if (!binary) return { ok: false, action: 'none', message: 'Tailscale مش متثبّت' }
  try {
    await run(binary, ['funnel', `--https=${publicPort}`, 'off'], 30000)
  } catch {
    try {
      await run(binary, ['funnel', 'reset'], 30000)
    } catch (err: any) {
      return { ok: false, action: 'none', message: 'تعذّر إيقاف Funnel', error: String(err?.message ?? '') }
    }
  }
  return { ok: true, action: 'none', message: 'تم إيقاف الوصول من أي مكان' }
}
