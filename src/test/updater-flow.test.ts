// Guards the update download flow in electron.cjs.
//
// A shipped bug: the banner said "جارٍ التحميل…" forever with no percentage and
// Task Manager showed zero network for the app — the differential downloader
// rebuilds the installer out of the copy in resources/, emits no progress
// event when it can't (missing file / stalled range request) and just hangs,
// while the check button happily started another download on top of it. These
// assertions keep the fixes in place:
//   * full download → real `download-progress` events,
//   * explicit download → it can be cancelled and retried,
//   * stall watchdog → a dead transfer is reported instead of spinning,
//   * busy guard → one check at a time,
//   * `updater:state` → a reloaded window repaints the running download.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), 'utf8')
const main = () => read('electron.cjs')
const banner = () => read('src/components/UpdateBanner.tsx')

describe('update download flow', () => {
  it('downloads the whole installer so progress events actually fire', () => {
    expect(main()).toContain('autoUpdater.disableDifferentialDownload = true')
    expect(main()).not.toMatch(/disableDifferentialDownload\s*=\s*false/)
  })

  it('drives the download explicitly instead of letting autoDownload race it', () => {
    expect(main()).toContain('autoUpdater.autoDownload = false')
    expect(main()).toContain('autoUpdater.downloadUpdate(')
  })

  it('reports a stalled download instead of showing progress forever', () => {
    expect(main()).toContain('Date.now() - state.lastEventAt < 60_000')
    expect(main()).toContain("send('stalled'")
    expect(banner()).toContain("s.status === 'stalled'")
    // Failures must be visible with a retry, never hidden by the banner.
    expect(banner()).not.toMatch(/status === 'error'\) return null/)
  })

  it('never starts a second check while one is running', () => {
    expect(main()).toContain('if (ctl.busy()) return { ok: true, busy: true,')
  })

  it('lets a reloaded renderer repaint the running download', () => {
    expect(main()).toContain("ipcMain.handle('updater:state'")
    expect(banner()).toContain('window.updater?.state?.()')
  })
})
