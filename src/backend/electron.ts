// Electron-only capabilities the backend needs, injected by createBackend()
// so the domain modules stay plain Node. The server (running inside the
// Electron main process) injects the real implementations; tests can inject
// fakes.
export interface PrinterInfo { name: string; displayName?: string; isDefault?: boolean; [k: string]: unknown }

export interface ElectronBits {
  // Print HTML on the OS print driver via a hidden window (silentPrint).
  print: (html: string, deviceName?: string | null, copies?: number, paperWidth?: string) => Promise<{ ok: boolean; error?: string }>
  // Printers visible to the OS (same list the renderer's sender reports).
  listPrinters: () => Promise<PrinterInfo[]>
  dialogs: {
    showSaveDialog: (opts: any) => Promise<{ canceled: boolean; filePath?: string }>
    showOpenDialog: (opts: any) => Promise<{ canceled: boolean; filePaths?: string[] }>
  }
  app: {
    getPath: (name: string) => string
    relaunch: () => void
    exit: (code?: number) => void
  }
}

let bits: ElectronBits | null = null

export function setElectron(b: ElectronBits): void {
  bits = b
}

export function getElectron(): ElectronBits {
  if (!bits) throw new Error('Backend Electron bits not injected — call createBackend() first')
  return bits
}
