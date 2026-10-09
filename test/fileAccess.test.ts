import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { allowedPath, assertNotRoot } from '../src/main/services/fileAccess'
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})
describe('filesystem boundaries', () => {
  it('rejects existing and new paths through an escaping directory link', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ideterm-links-'))
    dirs.push(dir)
    const root = join(dir, 'project'),
      outside = join(dir, 'outside')
    await fs.mkdir(root)
    await fs.mkdir(outside)
    await fs.writeFile(join(outside, 'secret.txt'), 'secret')
    await fs.symlink(outside, join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(allowedPath(join(root, 'link', 'secret.txt'), [root])).rejects.toThrow('Symbolic link')
    await expect(allowedPath(join(root, 'link', 'new', 'file.txt'), [root])).rejects.toThrow('Symbolic link')
    expect(await allowedPath(join(root, 'new', 'file.txt'), [root])).toBe(join(root, 'new', 'file.txt'))
    await expect(assertNotRoot(root, [root])).rejects.toThrow('project root')
  })
  it('allows a project whose root itself is a symlink', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ideterm-root-'))
    dirs.push(dir)
    const real = join(dir, 'real'),
      link = join(dir, 'link')
    await fs.mkdir(real)
    await fs.symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir')
    expect(await allowedPath(join(link, 'new.txt'), [link])).toBe(join(link, 'new.txt'))
  })
})
