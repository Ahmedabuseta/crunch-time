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

function registerUpdaterHandlers(autoUpdater, devMode = false) {
  // Settings shows the installed version next to the check button.
  ipcMain.handle('updater:version', () => ({ ok: true, version: app.getVersion() }))
  ipcMain.handle('updater:check', async () => {
    if (devMode) return { ok: false, error: 'dev' }
    if (!autoUpdater) return { ok: false, error: 'unavailable' }
    try {
      const res = await autoUpdater.checkForUpdates()
      const current = app.getVersion()
      const latest = res?.updateInfo?.version || null
      // updateInfo always carries the feed's newest version, even when it
      // equals ours — only report an update when it's actually newer.
      return { ok: true, current, latest, version: res?.isUpdateAvailable ? latest : null }
    } catch (e) {
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
  try {
    autoUpdater = require('electron-updater').autoUpdater
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

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (status, payload) => {
    if (!win.isDestroyed()) win.webContents.send('updater:status', { status, ...payload })
  }

  autoUpdater.on('checking-for-update', () => send('checking'))
  autoUpdater.on('update-available', (info) => send('available', { version: info?.version }))
  autoUpdater.on('update-not-available', () => send('up-to-date'))
  autoUpdater.on('download-progress', (p) => send('downloading', {
    percent: Math.round(p?.percent || 0),
    transferred: p?.transferred || 0,
    total: p?.total || 0,
    bytesPerSecond: p?.bytesPerSecond || 0,
  }))
  autoUpdater.on('update-downloaded', (info) => send('downloaded', { version: info?.version }))
  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err?.message || err)
    send('error', { message: String(err?.message || err) })
  })

  registerUpdaterHandlers(autoUpdater)

  // Small delay so the window paints first; failures are silent to the user.
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => {
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