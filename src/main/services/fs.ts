import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import type { FileEntry } from '@shared/types'
import { allowedPath, assertNotRoot } from './fileAccess'
import { getActiveRoots } from './session'

const MAX_READ_BYTES = 5 * 1024 * 1024 // 5 MB editor guard

/** Folder paths of the active snapshot's projects are the allowed roots. */
function roots(): string[] {
  return getActiveRoots()
}

/** Reject any path outside the user's configured project folders. */
function assertAllowed(target: string): Promise<string> {
  return allowedPath(target, roots())
}

export async function list(dir: string): Promise<FileEntry[]> {
  const safe = await assertAllowed(dir)
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
  const safe = await assertAllowed(file)
  const stat = await fs.stat(safe)
  if (stat.size > MAX_READ_BYTES) {
    throw new Error(`File is too large to edit (${Math.round(stat.size / 1024)} KB)`)
  }
  return fs.readFile(safe, 'utf-8')
}

export async function write(file: string, content: string): Promise<void> {
  const safe = await assertAllowed(file)
  await fs.writeFile(safe, content, 'utf-8')
}

export async function create(target: string, kind: 'file' | 'directory'): Promise<string> {
  const safe = await assertAllowed(target)
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
  const safe = await assertAllowed(target)
  await assertNotRoot(safe, roots())
  await fs.rm(safe, { recursive: true, force: false })
}

export async function rename(target: string, newName: string): Promise<string> {
  if (!newName || newName === '.' || newName === '..' || /[\\/]/.test(newName)) throw new Error('Name cannot contain path separators')
  const safe = await assertAllowed(target)
  const dest = await assertAllowed(join(resolve(safe, '..'), newName))
  await assertNotRoot(safe, roots())
  await assertMissing(dest)
  await fs.rename(safe, dest)
  return dest
}

export async function move(src: string, destDir: string): Promise<string> {
  const safeSrc = await assertAllowed(src)
  const safeDestDir = await assertAllowed(destDir)
  const name = safeSrc.split(/[\\/]/).pop() as string
  const dest = await assertAllowed(join(safeDestDir, name))
  await assertNotRoot(safeSrc, roots())
  await assertMissing(dest)
  await fs.rename(safeSrc, dest)
  return dest
}

async function assertMissing(path: string): Promise<void> {
  try { await fs.lstat(path) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  throw new Error('Destination already exists')
}
