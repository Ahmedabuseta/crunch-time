declare module 'electron' {
  export const app: {
    getPath(name: string): string
  }
}
