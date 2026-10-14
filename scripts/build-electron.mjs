import { build, context } from 'esbuild'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, '..')
const outdir = path.join(root, 'dist-electron')

const base = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outdir,
  external: ['electron', 'better-sqlite3', 'argon2', 'electron-updater', 'electron-log', 'fastify', 'ws'],
  legalComments: 'none',
  logLevel: 'info',
}

const entries = [
  path.join(root, 'src/ipc/main.ts'),
  path.join(root, 'src/ipc/preload.ts'),
]
const opts = (entry) => ({ ...base, entryPoints: [entry], outExtension: { '.js': '.cjs' } })

if (process.argv.includes('--watch')) {
  // Watch mode never wipes the output directory: electron may already hold
  // main.cjs/preload.cjs open, and a valid bundle has to be on disk the whole
  // time so a freshly started app can always load one.
  const contexts = await Promise.all(entries.map((e) => context(opts(e))))
  for (const ctx of contexts) {
    await ctx.rebuild()
    await ctx.watch()
  }
  console.log('[electron] watching src/ipc → dist-electron (still restart the app to load a rebuilt main)')
} else {
  rmSync(outdir, { recursive: true, force: true })
  await Promise.all(entries.map((e) => build(opts(e))))
}
