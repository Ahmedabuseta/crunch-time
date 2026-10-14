import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  server: {
    // The dev server shares this repo with the Expo app and the main-process
    // build. Watching them made Vite full-reload the renderer whenever Metro or
    // esbuild wrote a file — which threw the cashier back to the login screen
    // mid-task. Only the renderer's own source is interesting.
    watch: {
      ignored: ['**/apps/**', '**/dist-electron/**', '**/release/**', '**/squashfs-root/**', '**/docker/**'],
    },
  },
  optimizeDeps: {
    exclude: ['better-sqlite3'],
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // reseed-dev.test.ts wipes the real dev database. Opt in explicitly:
    //   npx vitest run src/test/reseed-dev.test.ts
    // (export-menu.test.ts guards itself with EXPORT_MENU=1)
    exclude: ['**/node_modules/**', '**/.git/**', 'src/test/reseed-dev.test.ts'],
    testTimeout: 10000,
  },
})
