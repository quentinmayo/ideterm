import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { isPathInsideRoots } from './pathSafety'

/** Resolve existing ancestors too, so new files cannot escape through a linked directory. */
async function canonical(path: string): Promise<string> {
  try {
    return await fs.realpath(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // A dangling link must not be treated as an ordinary missing file.
    try {
      if ((await fs.lstat(path)).isSymbolicLink()) throw new Error('Dangling symbolic link')
    } catch (statError) {
      if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError
    }
    const parent = dirname(path)
    if (parent === path) throw error
    return join(await canonical(parent), basename(path))
  }
}

export async function allowedPath(target: string, roots: string[]): Promise<string> {
  const lexical = resolve(target)
  if (!isPathInsideRoots(lexical, roots)) throw new Error('Path is outside any project folder')
  const real = await canonical(lexical)
  const realRoots = await Promise.all(roots.map((root) => canonical(resolve(root))))
  if (!isPathInsideRoots(real, realRoots)) throw new Error('Symbolic link leaves the project folders')
  // Preserve the lexical path so listing a linked project root returns usable paths,
  // and deleting a link removes the link rather than its target.
  return lexical
}

export async function assertNotRoot(target: string, roots: string[]): Promise<void> {
  const real = await canonical(resolve(target))
  for (const root of roots) {
    if (real === (await canonical(resolve(root)))) throw new Error('Cannot remove or move a project root')
  }
}
