import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

const pending = new Map<string, Promise<void>>()

/** Serialize writes per destination, capturing content before entering the queue. */
export function atomicWrite(path: string, content: string): Promise<void> {
  const target = resolve(path)
  const previous = pending.get(target) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      const temporary = `${target}.${randomUUID()}.tmp`
      try {
        await fs.writeFile(temporary, content, { encoding: 'utf-8', mode: 0o600, flag: 'wx' })
        await fs.rename(temporary, target)
      } finally {
        await fs.rm(temporary, { force: true })
      }
    })
  pending.set(target, next)
  const cleanup = (): void => {
    if (pending.get(target) === next) pending.delete(target)
  }
  void next.then(cleanup, cleanup)
  return next
}
