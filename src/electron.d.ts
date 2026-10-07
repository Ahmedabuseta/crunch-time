declare module 'electron' {
  export const app: {
    getPath(name: string): string
    relaunch(options?: any): void
    exit(exitCode?: number): void
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
  export class BrowserWindow {
    constructor(opts?: any)
    static getAllWindows(): BrowserWindow[]
    loadURL(url: string): Promise<void>
    loadFile(path: string): Promise<void>
    isDestroyed(): boolean
    close(): void
    setBounds(bounds: { x?: number; y?: number; width?: number; height?: number }): void
    webContents: {
      print(opts: any, cb?: (success: boolean, reason: string) => void): void
      getPrintersAsync(): Promise<{ name: string; displayName?: string; isDefault?: boolean }[]>
      executeJavaScript(code: string): Promise<any>
      capturePage(): Promise<{ toPNG(): Buffer; getSize(): { width: number; height: number } }>
    }
  }
}
