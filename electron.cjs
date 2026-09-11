const { app, BrowserWindow } = require('electron')
const path = require('path')

const PORT = process.env.VITE_PORT || '5173'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'ipc', 'preload.ts'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
  })

  win.loadURL(`http://localhost:${PORT}`)
  win.webContents.openDevTools()
}

app.whenReady().then(() => {
  // Register IPC handlers (compiled TS will be used in production)
  try {
    const { registerIpcHandlers } = require('./src/ipc/main')
    registerIpcHandlers()
  } catch (e) {
    console.log('IPC handlers will be registered from compiled TS')
  }
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
