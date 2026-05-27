import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import type { FileEntry } from '@shared/types'
import { isPathInsideRoots } from './pathSafety'
import { getActiveRoots } from './session'

const MAX_READ_BYTES = 5 * 1024 * 1024 // 5 MB editor guard

/** Folder paths of the active snapshot's projects are the allowed roots. */
function roots(): string[] {
  return getActiveRoots()
}

/** Reject any path outside the user's configured project folders. */
function assertAllowed(target: string): string {
  const resolved = resolve(target)
  if (!isPathInsideRoots(resolved, roots())) {
    throw new Error('Path is outside any project folder')
  }
  return resolved
}

export async function list(dir: string): Promise<FileEntry[]> {
  const safe = assertAllowed(dir)
  const dirents = await fs.readdir(safe, { withFileTypes: true })
  const entries = await Promise.all(
    dirents.map(async (d): Promise<FileEntry> => {
      const full = join(safe, d.name)
      let size = 0
      if (d.isFile()) {
        try {
          size = (await fs.stat(full)).size
        } catch {
          /* ignore */
        }
      }
      return { name: d.name, path: full, kind: d.isDirectory() ? 'directory' : 'file', size }
    })
  )
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export async function read(file: string): Promise<string> {
  const safe = assertAllowed(file)
  const stat = await fs.stat(safe)
  if (stat.size > MAX_READ_BYTES) {
    throw new Error(`File is too large to edit (${Math.round(stat.size / 1024)} KB)`)
  }
  return fs.readFile(safe, 'utf-8')
}

export async function write(file: string, content: string): Promise<void> {
  const safe = assertAllowed(file)
  await fs.writeFile(safe, content, 'utf-8')
}

export async function create(target: string, kind: 'file' | 'directory'): Promise<string> {
  const safe = assertAllowed(target)
  if (kind === 'directory') {
    await fs.mkdir(safe, { recursive: true })
  } else {
    await fs.mkdir(resolve(safe, '..'), { recursive: true })
    // 'wx' fails if the file already exists.
    const handle = await fs.open(safe, 'wx')
    await handle.close()
  }
  return safe
}

export async function remove(target: string): Promise<void> {
  const safe = assertAllowed(target)
  await fs.rm(safe, { recursive: true, force: false })
}

export async function rename(target: string, newName: string): Promise<string> {
  if (/[\\/]/.test(newName)) throw new Error('Name cannot contain path separators')
  const safe = assertAllowed(target)
  const dest = assertAllowed(join(resolve(safe, '..'), newName))
  await fs.rename(safe, dest)
  return dest
}

export async function move(src: string, destDir: string): Promise<string> {
  const safeSrc = assertAllowed(src)
  const safeDestDir = assertAllowed(destDir)
  const name = safeSrc.split(/[\\/]/).pop() as string
  const dest = join(safeDestDir, name)
  await fs.rename(safeSrc, dest)
  return dest
}
