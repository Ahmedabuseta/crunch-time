// Crunch Time brand assets — every icon in the app is derived from ONE master
// image so the badge can never drift between the window, the installer, the
// taskbar and the browser tab.
//
//   node scripts/generate-icon.mjs     (or: npm run icons)
//
// Input:  build/logo-master.png  — the 1024×1024 round badge, transparent bg
// Outputs:
//   build/icon.png      512×512   Linux AppImage/deb + electron-builder default
//   build/icon.ico      16..256   Windows app icon + NSIS installer/uninstaller
//   build/favicon.png   64×64     buildResources favicon
//   public/favicon.png  64×64     browser tab icon (served by Vite)
//   src/assets/logo.png 256×256   in-app <Logo /> component
import { PNG } from 'pngjs'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const masterPath = path.join(root, 'build', 'logo-master.png')

if (!existsSync(masterPath)) {
  console.error(`Missing master artwork: ${path.relative(root, masterPath)}`)
  process.exit(1)
}
const master = PNG.sync.read(readFileSync(masterPath))

// Area-average (box) downscale with premultiplied alpha. Naive sampling makes
// the badge's thin yellow ring and small text shimmer; averaging whole source
// pixels — weighting colour by alpha — keeps edges clean all the way to 16px.
function resize(src, size) {
  if (src.width === size && src.height === size) return src
  const out = new PNG({ width: size, height: size })
  const scaleX = src.width / size
  const scaleY = src.height / size

  for (let y = 0; y < size; y++) {
    const y0 = y * scaleY
    const y1 = Math.min(src.height, (y + 1) * scaleY)
    for (let x = 0; x < size; x++) {
      const x0 = x * scaleX
      const x1 = Math.min(src.width, (x + 1) * scaleX)

      let r = 0, g = 0, b = 0, a = 0, area = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        if (wy <= 0) continue
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx)
          if (wx <= 0) continue
          const w = wx * wy
          const i = (sy * src.width + sx) * 4
          const alpha = src.data[i + 3] / 255
          r += src.data[i] * alpha * w
          g += src.data[i + 1] * alpha * w
          b += src.data[i + 2] * alpha * w
          a += alpha * w
          area += w
        }
      }

      const o = (y * size + x) * 4
      if (a > 0) {
        out.data[o] = Math.round(r / a)
        out.data[o + 1] = Math.round(g / a)
        out.data[o + 2] = Math.round(b / a)
      }
      // Fully transparent stays fully transparent; partially covered edge
      // pixels keep coverage (a / area) instead of blowing out to opaque.
      out.data[o + 3] = Math.round(Math.min(1, a / area) * 255)
    }
  }
  return out
}

// ICO container with PNG-compressed frames (Vista+; electron-builder and the
// Windows shell both accept it). Avoids a second dependency for encoding.
function icoFrom(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(frames.length, 4)

  const entries = []
  let offset = 6 + 16 * frames.length
  for (const frame of frames) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 0) // width (0 = 256)
    entry.writeUInt8(frame.size >= 256 ? 0 : frame.size, 1) // height (0 = 256)
    entry.writeUInt8(0, 2) // palette colours
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(frame.png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += frame.png.length
    entries.push(entry)
  }
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.png)])
}

function emit(relPath, png) {
  const file = path.join(root, relPath)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, PNG.sync.write(png))
  console.log(`  ${relPath.padEnd(22)} ${png.width}×${png.height}`)
}

console.log(`Master: ${path.relative(root, masterPath)} (${master.width}×${master.height})`)

emit('build/icon.png', resize(master, 512))
emit('build/favicon.png', resize(master, 64))
emit('public/favicon.png', resize(master, 64))
emit('src/assets/logo.png', resize(master, 256))

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const frames = icoSizes.map((size) => ({ size, png: PNG.sync.write(resize(master, size)) }))
writeFileSync(path.join(root, 'build', 'icon.ico'), icoFrom(frames))
console.log(`  ${'build/icon.ico'.padEnd(22)} ${icoSizes.join(', ')}`)
