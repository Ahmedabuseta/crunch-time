// Which temporal binary the runtime picks.
//
// This is the bug that made the whole end-to-end suite fail on Linux with
// "خدمة التشغيل وقفت (1)" and nothing else: a checkout that has just run a
// Windows release build contains both `build/temporal` (ELF) and
// `build/temporal.exe` (PE), and the lookup tried the `.exe` first. The Linux
// binary was there the whole time — the app just handed the OS a Windows one.
//
// The test runs the real `findBinary` with the real filesystem, because the bug
// was in the ordering of real paths, not in a pure function.
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const tempDir = mkdtempSync(path.join(tmpdir(), 'find-binary-'))

vi.mock('electron', () => ({
  app: { getPath: () => tempDir, getName: () => 'fastfood-cashier' },
  ipcMain: { handle: () => {} },
  BrowserWindow: class MockWindow {},
}))

const { findBinary } = await import('../ai/runtime/server')

const originalCwd = process.cwd()
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
const originalEnv = process.env.TEMPORAL_CLI_PATH

function usePlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

/** A throwaway checkout with a `build/` directory holding both names. */
function fakeCheckout(files: string[]): string {
  const root = mkdtempSync(path.join(tempDir, 'checkout-'))
  const build = path.join(root, 'build')
  require('node:fs').mkdirSync(build, { recursive: true })
  for (const name of files) writeFileSync(path.join(build, name), '')
  return root
}

beforeAll(() => {
  delete process.env.TEMPORAL_CLI_PATH
})

afterAll(() => {
  process.chdir(originalCwd)
  Object.defineProperty(process, 'platform', originalPlatform)
  if (originalEnv === undefined) delete process.env.TEMPORAL_CLI_PATH
  else process.env.TEMPORAL_CLI_PATH = originalEnv
  rmSync(tempDir, { recursive: true, force: true })
})

describe('findBinary', () => {
  it('prefers the ELF binary on linux even when a .exe is present', () => {
    // The exact state `fetch:temporal` left behind after a Windows release:
    // both files, and the .exe is newer.
    usePlatform('linux')
    const root = fakeCheckout(['temporal', 'temporal.exe'])
    process.chdir(root)

    const found = findBinary()
    expect(found).toBe(path.join(root, 'build', 'temporal'))
    expect(found?.endsWith('.exe')).toBe(false)
  })

  it('prefers the .exe on windows', () => {
    usePlatform('win32')
    const root = fakeCheckout(['temporal', 'temporal.exe'])
    process.chdir(root)

    expect(findBinary()).toBe(path.join(root, 'build', 'temporal.exe'))
  })

  it('still falls back to the other name when only one exists', () => {
    usePlatform('linux')
    const onlyExe = fakeCheckout(['temporal.exe'])
    process.chdir(onlyExe)
    // Not ideal, but better than reporting no runtime at all: the start path
    // will fail loudly with the child's own stderr.
    expect(findBinary()).toBe(path.join(onlyExe, 'build', 'temporal.exe'))
  })

  it('honours an explicit TEMPORAL_CLI_PATH above everything else', () => {
    usePlatform('linux')
    const root = fakeCheckout(['temporal', 'temporal.exe'])
    process.chdir(root)

    const explicit = path.join(root, 'build', 'temporal.exe')
    process.env.TEMPORAL_CLI_PATH = explicit
    try {
      expect(findBinary()).toBe(explicit)
    } finally {
      delete process.env.TEMPORAL_CLI_PATH
    }
  })
})
