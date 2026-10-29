import { build, context } from 'esbuild'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleWorkflowCode } from '@temporalio/worker'

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, '..')
const outdir = path.join(root, 'dist-electron')

const base = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outdir,
  // Kept external: the Temporal SDKs load a native N-API bridge and resolve
  // their own files at runtime, so bundling them breaks the worker.
  external: [
    'electron', 'better-sqlite3', 'argon2', 'electron-updater', 'electron-log', 'fastify', 'ws',
    '@temporalio/client', '@temporalio/worker', '@temporalio/activity', '@temporalio/common',
    '@temporalio/core-bridge', '@temporalio/proto',
  ],
  legalComments: 'none',
  logLevel: 'info',
}

const entries = [
  path.join(root, 'src/ipc/main.ts'),
  path.join(root, 'src/ipc/preload.ts'),
]
const opts = (entry) => ({ ...base, entryPoints: [entry], outExtension: { '.js': '.cjs' } })

/**
 * The workflow bundle cannot come from esbuild.
 *
 * Temporal's sandbox loads webpack-shaped output — it defines its own module
 * cache and looks for the activator the bundle installs — and it also requires
 * an SDK-version banner on the first line plus an inline source map. Its own
 * bundler emits all three, so it runs here, at build time, and never in the
 * shipped app.
 */
async function buildWorkflows() {
  const started = Date.now()
  const { code } = await bundleWorkflowCode({
    workflowsPath: path.join(root, 'src/ai/workflows/entry.ts'),
  })
  writeFileSync(path.join(outdir, 'workflows.cjs'), code)
  console.log(`[electron] workflows.cjs ${Math.round(code.length / 1024)}kb in ${Date.now() - started}ms`)
}

if (process.argv.includes('--watch')) {
  // Watch mode never wipes the output directory: electron may already hold
  // main.cjs/preload.cjs open, and a valid bundle has to be on disk the whole
  // time so a freshly started app can always load one.
  const contexts = await Promise.all(entries.map((e) => context(opts(e))))
  for (const ctx of contexts) {
    await ctx.rebuild()
    await ctx.watch()
  }
  // Workflow code changes need a worker restart anyway, so this is built once
  // rather than watched.
  await buildWorkflows()
  console.log('[electron] watching src/ipc → dist-electron (still restart the app to load a rebuilt main)')
} else {
  rmSync(outdir, { recursive: true, force: true })
  await Promise.all(entries.map((e) => build(opts(e))))
  await buildWorkflows()
}
