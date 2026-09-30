declare module 'electron' {
  export const app: {
    getPath(name: string): string
  }
  export const ipcMain: {
    handle(channel: string, handler: (event: any, ...args: any[]) => any): void
  }
  export const ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>
  }
  export const contextBridge: {
    exposeInMainWorld(apiKey: string, api: Record<string, any>): void
  }
  export class BrowserWindow {
    constructor(opts?: any)
    static getAllWindows(): BrowserWindow[]
    loadURL(url: string): Promise<void>
    isDestroyed(): boolean
    close(): void
    webContents: {
      print(opts: any, cb?: (success: boolean, reason: string) => void): void
      getPrintersAsync(): Promise<{ name: string; displayName?: string; isDefault?: boolean }[]>
    }
  }
}
