const { app, BrowserWindow } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'
const MAIN_JS = path.join(__dirname, 'dist-electron', 'main.cjs')
const PRELOAD_JS = path.join(__dirname, 'dist-electron', 'preload.cjs')

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
  })
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

app.whenReady().then(async () => {
  // Migrate + seed the SQLite DB, then register all IPC handlers, then open the window.
  try {
    const { initBackend } = require(MAIN_JS)
    await initBackend()
  } catch (e) {
    console.error('[electron] backend init failed:', e)
  }
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})