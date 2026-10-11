const { app, BrowserWindow, ipcMain } = require('electron')
const { existsSync } = require('fs')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'
const MAIN_JS = path.join(__dirname, 'dist-electron', 'main.cjs')
const PRELOAD_JS = path.join(__dirname, 'dist-electron', 'preload.cjs')
// Window/taskbar icon on Linux. Packaged builds also ship it (see the `files`
// list in package.json) so the runtime path resolves inside the asar too.
const APP_ICON = path.join(__dirname, 'build', 'icon.png')

// Keep Chromium on a whole-number scale on low-DPI Linux displays. Fractional
// device scale factors are a common source of soft glyph edges in Electron.
app.commandLine.appendSwitch('high-dpi-support', '1')
app.commandLine.appendSwitch('force-device-scale-factor', '1')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    webPreferences: {
      preload: PRELOAD_JS,
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    ...(existsSync(APP_ICON) ? { icon: APP_ICON } : {}),
  })
  win.webContents.setZoomFactor(1)
  win.once('ready-to-show', () => win.show())

  if (isDev) {
    const PORT = process.env.VITE_PORT || '5173'
    win.loadURL(`http://localhost:${PORT}`)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  // Surface renderer failures instead of leaving a silent black screen.
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[electron] did-fail-load', errorCode, errorDescription)
  })
  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[renderer]', message)
  })

  return win
}

function registerUpdaterHandlers(autoUpdater, devMode = false, ctl = null) {
  // Settings shows the installed version next to the check button.
  ipcMain.handle('updater:version', () => ({ ok: true, version: app.getVersion() }))

  // Lets a freshly reloaded renderer repaint the banner without waiting for
  // the next event — the download keeps running while the UI rebuilds.
  ipcMain.handle('updater:state', () => {
    if (devMode) return { ok: false, error: 'dev' }
    if (!autoUpdater || !ctl) return { ok: false, error: 'unavailable' }
    return { ok: true, current: app.getVersion(), ...ctl.snapshot() }
  })

  ipcMain.handle('updater:check', async () => {
    if (devMode) return { ok: false, error: 'dev' }
    if (!autoUpdater || !ctl) return { ok: false, error: 'unavailable' }
    // Answer an in-flight check/download with its live state instead of racing
    // a second one — starting the same download twice is what made the old flow
    // look like it "kept downloading".
    if (ctl.busy()) return { ok: true, busy: true, current: app.getVersion(), ...ctl.snapshot() }
    try {
      const res = await ctl.check()
      const current = app.getVersion()
      const latest = res?.updateInfo?.version || null
      // updateInfo always carries the feed's newest version, even when it
      // equals ours — only report an update when it's actually newer.
      const available = !!res?.isUpdateAvailable
      if (available) ctl.startDownload(latest)
      else ctl.setPhase('idle')
      return { ok: true, current, latest, version: available ? latest : null }
    } catch (e) {
      ctl.setPhase('idle')
      return { ok: false, error: String(e?.message || e) }
    }
  })
  ipcMain.handle('updater:quitAndInstall', () => {
    if (!autoUpdater) return { ok: false }
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  })
}

// ─── Auto-updates (electron-updater + GitHub Releases) ─────────────
// Skipped entirely in dev: no update feed, no signature, nothing to apply.
// In production: check on launch, then forward every updater event to the
// renderer so the UI can show progress + a "restart to update" button.
function setupAutoUpdates(win) {
  // Dev still registers the handlers so the Settings "check for updates"
  // button answers with an honest "dev mode" note instead of a raw IPC error.
  if (isDev) {
    registerUpdaterHandlers(null, true)
    return
  }
  if (!existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    console.log('[updater] app-update.yml not found; skipping update checks')
    registerUpdaterHandlers(null)
    return
  }
  let autoUpdater
  let CancellationToken
  try {
    ({ autoUpdater, CancellationToken } = require('electron-updater'))
  } catch (e) {
    console.error('[updater] electron-updater not available:', e?.message || e)
    registerUpdaterHandlers(null)
    return
  }
  try {
    const log = require('electron-log')
    log.transports.file.level = 'info'
    autoUpdater.logger = log
  } catch { /* logging is optional */ }

  // Differential download rebuilds the installer from the copy shipped in
  // resources/. When that file is missing (typical after a manual install) or
  // the range request to the release CDN stalls, it never emits a single
  // progress event — the UI then sat on "جارٍ التحميل" with no percentage and
  // Task Manager showed no network for the app. A full download is bigger, but
  // it always reports progress and fails loudly.
  autoUpdater.disableDifferentialDownload = true
  // Driven explicitly below, so a dead transfer can be cancelled + retried and
  // so a second "check for updates" click can never start a second download.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  const send = (status, payload) => {
    if (!win.isDestroyed()) win.webContents.send('updater:status', { status, ...payload })
  }

  const state = { phase: 'idle', version: null, transferred: 0, total: 0, percent: 0, lastEventAt: 0 }
  let cancelToken = null
  let stallTimer = null

  const stopStallWatch = () => {
    if (stallTimer) {
      clearInterval(stallTimer)
      stallTimer = null
    }
  }
  // 60s without one progress event means the transfer is dead, not slow
  // (blocked release CDN, dropped connection). Cancel it so the UI can offer a
  // retry instead of spinning forever on a download that will never finish.
  const startStallWatch = () => {
    stopStallWatch()
    stallTimer = setInterval(() => {
      if (state.phase !== 'downloading') return stopStallWatch()
      if (Date.now() - state.lastEventAt < 60_000) return
      stopStallWatch()
      // Mark first: cancelling surfaces as a rejected promise and, for some
      // paths, an "error" event — both must see the stall we already reported.
      state.phase = 'stalled'
      try { cancelToken?.cancel() } catch { /* already settled */ }
      console.warn('[updater] download stalled: no progress for 60s')
      send('stalled', { version: state.version, transferred: state.transferred, total: state.total })
    }, 5000)
  }

  const startDownload = (version) => {
    if (state.phase === 'downloading' || state.phase === 'downloaded') return
    state.phase = 'downloading'
    state.version = version || state.version
    state.transferred = 0
    state.total = 0
    state.percent = 0
    state.lastEventAt = Date.now()
    cancelToken = CancellationToken ? new CancellationToken() : null
    send('downloading', { version: state.version, percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })
    startStallWatch()
    autoUpdater.downloadUpdate(cancelToken || undefined).catch((e) => {
      console.error('[updater] download failed:', e?.message || e)
    })
  }

  autoUpdater.on('checking-for-update', () => {
    state.phase = 'checking'
    send('checking')
  })
  autoUpdater.on('update-available', (info) => {
    state.version = info?.version || null
    send('available', { version: state.version })
  })
  autoUpdater.on('update-not-available', () => {
    state.phase = 'idle'
    send('up-to-date')
  })
  autoUpdater.on('download-progress', (p) => {
    state.phase = 'downloading'
    state.lastEventAt = Date.now()
    state.transferred = p?.transferred || 0
    state.total = p?.total || 0
    state.percent = Math.round(p?.percent || 0)
    send('downloading', {
      version: state.version,
      percent: state.percent,
      transferred: state.transferred,
      total: state.total,
      bytesPerSecond: p?.bytesPerSecond || 0,
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    stopStallWatch()
    state.phase = 'downloaded'
    state.version = info?.version || state.version
    send('downloaded', { version: state.version })
  })
  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err?.message || err)
    stopStallWatch()
    // A cancelled transfer also surfaces as an "error"; the user was already
    // told the download stalled, so don't overwrite that with a bare cancel.
    if (state.phase === 'stalled') return
    state.phase = 'error'
    send('error', { message: String(err?.message || err), version: state.version })
  })

  registerUpdaterHandlers(autoUpdater, false, {
    snapshot: () => ({
      phase: state.phase,
      version: state.version,
      transferred: state.transferred,
      total: state.total,
      percent: state.percent,
    }),
    busy: () => state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'downloaded',
    check: () => autoUpdater.checkForUpdates(),
    startDownload,
    setPhase: (next) => { state.phase = next },
  })

  // Small delay so the window paints first; failures are silent to the user.
  setTimeout(() => {
    autoUpdater.checkForUpdates().then((res) => {
      if (res?.isUpdateAvailable) startDownload(res?.updateInfo?.version)
    }).catch((e) => {
      console.error('[updater] check failed:', e?.message || e)
    })
  }, 5000)
}

app.whenReady().then(async () => {
  // Migrate + seed the SQLite DB, then register all IPC handlers, then open the window.
  try {
    const { initBackend } = require(MAIN_JS)
    await initBackend()
  } catch (e) {
    console.error('[electron] backend init failed:', e)
  }
  const win = createWindow()
  setupAutoUpdates(win)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})