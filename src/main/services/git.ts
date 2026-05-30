import { existsSync } from 'node:fs'
import { simpleGit, type SimpleGit } from 'simple-git'
import type { ActionResult, GitFileChange, GitStatus } from '@shared/types'

function git(path: string): SimpleGit {
  return simpleGit({ baseDir: path, maxConcurrentProcesses: 4 })
}

function ok(message: string): ActionResult {
  return { ok: true, message }
}
function fail(err: unknown): ActionResult {
  return { ok: false, message: err instanceof Error ? err.message : String(err) }
}

const notRepo = (path: string): GitStatus => ({
  path,
  isRepo: false,
  staged: 0,
  modified: 0,
  untracked: 0,
  conflicted: 0,
  dirty: false
})

/** Summary status for a folder card. Never throws — errors land in `error`. */
export async function getStatus(path: string): Promise<GitStatus> {
  if (!existsSync(path)) return { ...notRepo(path), error: 'Folder not found' }
  const g = git(path)
  try {
    if (!(await g.checkIsRepo())) return notRepo(path)
    const s = await g.status()
    let lastCommit: GitStatus['lastCommit']
    try {
      const log = await g.log({ maxCount: 1 })
      if (log.latest) {
        lastCommit = {
          hash: log.latest.hash.slice(0, 8),
          message: log.latest.message,
          author: log.latest.author_name,
          date: log.latest.date
        }
      }
    } catch {
      // Repo with no commits yet — leave lastCommit undefined.
    }
    return {
      path,
      isRepo: true,
      branch: s.current ?? undefined,
      tracking: s.tracking,
      ahead: s.ahead,
      behind: s.behind,
      staged: s.staged.length,
      modified: s.modified.length,
      untracked: s.not_added.length,
      conflicted: s.conflicted.length,
      dirty: !s.isClean(),
      lastCommit
    }
  } catch (err) {
    return { ...notRepo(path), error: err instanceof Error ? err.message : String(err) }
  }
}

/** Per-file changes for the inline Git panel. */
export async function getChanges(path: string): Promise<GitFileChange[]> {
  const g = git(path)
  if (!(await g.checkIsRepo())) return []
  const s = await g.status()
  return s.files.map((f) => ({
    path: f.path,
    index: f.index,
    workingDir: f.working_dir,
    staged: f.index !== ' ' && f.index !== '?',
    untracked: f.index === '?' && f.working_dir === '?'
  }))
}

export async function stage(path: string, files: string[]): Promise<ActionResult> {
  try {
    await git(path).add(files.length ? files : ['-A'])
    return ok('Staged')
  } catch (err) {
    return fail(err)
  }
}

export async function unstage(path: string, files: string[]): Promise<ActionResult> {
  try {
    await git(path).raw(['reset', '-q', 'HEAD', '--', ...files])
    return ok('Unstaged')
  } catch (err) {
    return fail(err)
  }
}

export async function commit(path: string, message: string): Promise<ActionResult> {
  if (!message.trim()) return { ok: false, message: 'Commit message is empty' }
  try {
    const res = await git(path).commit(message)
    return ok(`Committed ${res.commit} (${res.summary.changes} changed)`)
  } catch (err) {
    return fail(err)
  }
}

export async function pull(path: string): Promise<ActionResult> {
  try {
    const res = await git(path).pull()
    return ok(`Pulled: ${res.summary.changes} changes, +${res.summary.insertions}/-${res.summary.deletions}`)
  } catch (err) {
    return fail(err)
  }
}

export async function push(path: string): Promise<ActionResult> {
  try {
    await git(path).push()
    return ok('Pushed')
  } catch (err) {
    return fail(err)
  }
}

export async function fetch(path: string): Promise<ActionResult> {
  try {
    await git(path).fetch()
    return ok('Fetched')
  } catch (err) {
    return fail(err)
  }
}

/** Unified diff of a file versus HEAD (covers staged + unstaged changes). */
export async function diff(path: string, file: string): Promise<string> {
  const g = git(path)
  try {
    const out = await g.raw(['diff', 'HEAD', '--', file])
    if (out.trim()) return out
    const cached = await g.raw(['diff', '--cached', '--', file])
    return cached.trim() ? cached : '(no textual diff — new, binary, or untracked file)'
  } catch (err) {
    return `Error producing diff: ${err instanceof Error ? err.message : String(err)}`
  }
}

export async function branches(path: string): Promise<string[]> {
  try {
    const res = await git(path).branchLocal()
    return res.all
  } catch {
    return []
  }
}

/** The origin remote URL (fetch), or the first remote, or null. */
export async function getRemote(path: string): Promise<string | null> {
  try {
    const g = git(path)
    if (!(await g.checkIsRepo())) return null
    const remotes = await g.getRemotes(true)
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0]
    return origin?.refs?.fetch || origin?.refs?.push || null
  } catch {
    return null
  }
}
