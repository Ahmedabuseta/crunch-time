declare module 'electron' {
  export const app: {
    getPath(name: string): string
    relaunch(options?: any): void
    exit(exitCode?: number): void
    on(event: string, listener: (...args: any[]) => void): void
  }
  // Keeps the POS machine awake while the phone depends on its server.
  export const powerSaveBlocker: {
    start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number
    stop(id: number): boolean
    isStarted(id: number): boolean
  }
  export const ipcMain: {
    handle(channel: string, handler: (event: any, ...args: any[]) => any): void
  }
  export const dialog: {
    showSaveDialog(options?: any): Promise<{ canceled: boolean; filePath?: string }>
    showOpenDialog(options?: any): Promise<{ canceled: boolean; filePaths: string[] }>
  }
  export const ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>
  }
  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: Record<string, any>): void
  }
  export const shell: {
    openExternal(url: string): Promise<void>
  }
  export class BrowserWindow {
    constructor(opts?: any)
    static getAllWindows(): BrowserWindow[]
    loadURL(url: string): Promise<void>
    loadFile(path: string): Promise<void>
    isDestroyed(): boolean
    close(): void
    setBounds(bounds: { x?: number; y?: number; width?: number; height?: number }): void
    webContents: {
      send(channel: string, ...args: any[]): void
      print(opts: any, cb?: (success: boolean, reason: string) => void): void
      getPrintersAsync(): Promise<{ name: string; displayName?: string; isDefault?: boolean }[]>
      executeJavaScript(code: string): Promise<any>
      capturePage(): Promise<{ toPNG(): Buffer; getSize(): { width: number; height: number } }>
    }
  }
}
