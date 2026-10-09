import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicWrite } from '../src/main/services/atomicWrite'
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})
describe('atomic persistence', () => {
  it('retains the newest of concurrent saves and leaves no temp files', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ideterm-writes-'))
    dirs.push(dir)
    const path = join(dir, 'session.json')
    await Promise.all(
      Array.from({ length: 50 }, (_, version) =>
        atomicWrite(path, JSON.stringify({ version, text: 'x'.repeat(10000) }))
      )
    )
    expect(JSON.parse(await fs.readFile(path, 'utf8')).version).toBe(49)
    expect(await fs.readdir(dir)).toEqual(['session.json'])
  })
  it('allows a retry after a failed save', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'ideterm-retry-'))
    dirs.push(dir)
    const path = join(dir, 'missing', 'session.json')
    await expect(atomicWrite(path, 'first')).rejects.toThrow()
    await fs.mkdir(join(dir, 'missing'))
    await atomicWrite(path, 'retry')
    expect(await fs.readFile(path, 'utf8')).toBe('retry')
  })
})
