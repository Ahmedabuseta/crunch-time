// Downloads the Temporal CLI for the current platform into build/temporal.
//
// The binary is not published to npm, and the assistant's runtime needs it, so
// it is fetched once at packaging time rather than at app start — a shop PC
// should never have to reach the internet to keep its own chat working.
import { copyFileSync, createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs'
import { chmodSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** `--platform=win32` / `--arch=arm64`, for a cross-platform package build. */
const arg = (name) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`))
  return found ? found.split('=')[1] : null
}

const targetPlatform = arg('platform') || process.platform
const targetArch = arg('arch') || (process.arch === 'arm64' ? 'arm64' : 'amd64')
const platform = targetPlatform === 'win32' ? 'windows' : targetPlatform
const arch = targetArch

// Windows refuses to execute a PE without the `.exe` extension in most spawn
// paths, so the packaged file name follows the target, not the host.
const binaryName = targetPlatform === 'win32' ? 'temporal.exe' : 'temporal'
const target = path.join(root, 'build', binaryName)

if (existsSync(target) && !process.argv.includes('--force')) {
  console.log(`[temporal] already present at ${target} (--force to replace)`)
  process.exit(0)
}

if (targetPlatform !== process.platform) {
  console.log(`[temporal] cross-fetching for ${targetPlatform}/${targetArch} on ${process.platform}`)
}

const tmpDir = path.join(root, 'build', '.temporal-tmp')
rmSync(tmpDir, { recursive: true, force: true })
mkdirSync(tmpDir, { recursive: true })

async function download(url, destination) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destination))
}

try {
  // GitHub Releases is markedly faster than the temporal.download redirect in
  // practice, so it is tried first with the CDN as a fallback.
  let archive = null
  try {
    const latest = await fetch('https://api.github.com/repos/temporalio/cli/releases/latest', {
      headers: { accept: 'application/vnd.github+json' },
    }).then((r) => r.json())
    const tag = String(latest.tag_name || '')
    const version = tag.replace(/^v/, '')
    if (tag && version) {
      const name = `temporal_cli_${version}_${platform}_${arch}.tar.gz`
      const url = `https://github.com/temporalio/cli/releases/download/${tag}/${name}`
      console.log(`[temporal] downloading ${url}`)
      const file = path.join(tmpDir, name)
      await download(url, file)
      archive = file
    }
  } catch (err) {
    console.warn(`[temporal] GitHub download failed: ${err.message}`)
  }

  if (!archive) {
    const url = `https://temporal.download/cli/archive/latest?platform=${platform}&arch=${arch}`
    console.log(`[temporal] falling back to ${url}`)
    archive = path.join(tmpDir, 'temporal.tar.gz')
    await download(url, archive)
  }

  execFileSync('tar', ['xzf', archive, '-C', tmpDir], { stdio: 'inherit' })
  const extracted = path.join(tmpDir, targetPlatform === 'win32' ? 'temporal.exe' : 'temporal')
  if (!existsSync(extracted)) throw new Error(`archive did not contain a temporal binary`)
  copyFileSync(extracted, target)
  // The mode only matters on the host that will execute it.
  if (targetPlatform !== 'win32') chmodSync(target, 0o755)

  if (targetPlatform === process.platform) {
    const version = execFileSync(target, ['--version'], { encoding: 'utf8' }).trim()
    console.log(`[temporal] installed ${version} at ${target}`)
  } else {
    // A PE cannot run on a Linux/macOS host; the package is the verification.
    console.log(`[temporal] installed the ${targetPlatform} binary at ${target}`)
  }
  rmSync(tmpDir, { recursive: true, force: true })
} catch (err) {
  rmSync(tmpDir, { recursive: true, force: true })
  console.error(`[temporal] download failed: ${err.message}`)
  console.error('[temporal] set TEMPORAL_CLI_PATH to an existing binary instead')
  process.exit(1)
}
