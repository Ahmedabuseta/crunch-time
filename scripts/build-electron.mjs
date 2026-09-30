import { build } from 'esbuild'
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
  external: ['electron', 'better-sqlite3', 'argon2'],
  legalComments: 'none',
  logLevel: 'info',
}

rmSync(outdir, { recursive: true, force: true })

await Promise.all([
  build({ ...base, entryPoints: [path.join(root, 'src/ipc/main.ts')], outExtension: { '.js': '.cjs' } }),
  build({ ...base, entryPoints: [path.join(root, 'src/ipc/preload.ts')], outExtension: { '.js': '.cjs' } }),
])