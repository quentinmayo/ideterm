// Generates build/icon.png (1024) and build/icon.ico (multi-size) from build/icon.svg.
// Run with: node scripts/make-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = await readFile(join(root, 'build', 'icon.svg'))

// Main 1024px PNG used by Linux + as the source electron-builder converts for macOS.
await sharp(svg).resize(1024, 1024).png().toFile(join(root, 'build', 'icon.png'))

// Windows .ico packs several sizes.
const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  icoSizes.map((s) => sharp(svg).resize(s, s).png().toBuffer())
)
await writeFile(join(root, 'build', 'icon.ico'), await pngToIco(pngBuffers))

console.log('Wrote build/icon.png and build/icon.ico')
