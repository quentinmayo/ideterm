import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { simpleGit, type SimpleGit } from 'simple-git'
import type { ActionResult, GitFileChange, GitPathState, GithubRepoSummary, GitStatus } from '@shared/types'

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

function runGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (err += String(d)))
    child.on('error', (e) => reject(e))
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error((err || out || `gh exited with code ${code}`).trim()))
    })
  })
}

function mapGithubRepo(r: Record<string, unknown>): GithubRepoSummary {
  const ownerObj = (r.owner ?? {}) as { login?: string }
  const defaultBranchObj = (r.defaultBranchRef ?? {}) as { name?: string }
  return {
    fullName: String(r.nameWithOwner ?? ''),
    name: String(r.name ?? ''),
    owner: String(ownerObj.login ?? ''),
    description: (r.description ?? undefined) as string | undefined,
    private: Boolean(r.isPrivate),
    url: String(r.url ?? ''),
    sshUrl: (r.sshUrl ?? undefined) as string | undefined,
    defaultBranch: (defaultBranchObj.name ?? undefined) as string | undefined,
    updatedAt: (r.updatedAt ?? undefined) as string | undefined
  }
}

/** GitHub repos visible to the authenticated gh user. */
export async function githubList(limit = 100): Promise<GithubRepoSummary[]> {
  try {
    const json = await runGh([
      'repo',
      'list',
      '--limit',
      String(Math.max(1, Math.min(limit, 500))),
      '--json',
      'name,nameWithOwner,description,isPrivate,url,sshUrl,defaultBranchRef,updatedAt,owner'
    ])
    return (JSON.parse(json) as Record<string, unknown>[]).map(mapGithubRepo).filter((r) => !!r.fullName)
  } catch {
    return []
  }
}

/** Search GitHub repos (includes org/private repos the user can access). */
export async function githubSearch(query: string, limit = 50): Promise<GithubRepoSummary[]> {
  if (!query.trim()) return githubList(limit)
  try {
    const json = await runGh([
      'search',
      'repos',
      query,
      '--limit',
      String(Math.max(1, Math.min(limit, 200))),
      '--json',
      'name,nameWithOwner,description,isPrivate,url,sshUrl,defaultBranchRef,updatedAt,owner'
    ])
    return (JSON.parse(json) as Record<string, unknown>[]).map(mapGithubRepo).filter((r) => !!r.fullName)
  } catch {
    return []
  }
}

/** Inspect whether a target path exists and if it's already a git repo. */
export async function inspectPath(path: string): Promise<GitPathState> {
  const exists = existsSync(path)
  if (!exists) return { path, exists: false, isGitRepo: false }
  try {
    const g = git(path)
    if (!(await g.checkIsRepo())) return { path, exists: true, isGitRepo: false }
    const b = await g.branchLocal()
    return {
      path,
      exists: true,
      isGitRepo: true,
      branch: b.current ?? null,
      remote: await getRemote(path)
    }
  } catch {
    return { path, exists: true, isGitRepo: false }
  }
}

/** Clone via gh for owner/repo inputs; falls back to git clone for URLs. */
export async function githubClone(repo: string, destinationPath: string): Promise<ActionResult> {
  if (!repo.trim()) return { ok: false, message: 'Repository is required' }
  if (!destinationPath.trim()) return { ok: false, message: 'Destination path is required' }
  if (existsSync(destinationPath)) return { ok: false, message: 'Destination already exists' }
  try {
    if (repo.includes('://') || repo.startsWith('git@')) {
      await simpleGit().clone(repo.trim(), destinationPath)
    } else {
      await runGh(['repo', 'clone', repo.trim(), destinationPath, '--'])
    }
    return { ok: true, message: `Cloned into ${destinationPath}` }
  } catch (err) {
    return fail(err)
  }
}

/** Create and checkout a new local branch off main (or origin/main fallback). */
export async function createBranchFromMain(path: string, branchName: string): Promise<ActionResult> {
  if (!branchName.trim()) return { ok: false, message: 'Branch name is required' }
  try {
    const g = git(path)
    if (!(await g.checkIsRepo())) return { ok: false, message: 'Target path is not a git repository' }
    try {
      await g.fetch('origin')
    } catch {
      /* continue with local refs */
    }
    const local = await g.branchLocal()
    if (local.all.includes(branchName)) return { ok: false, message: `Branch "${branchName}" already exists` }
    if (local.all.includes('main')) {
      await g.checkout('main')
      try {
        await g.pull('origin', 'main')
      } catch {
        /* offline/no origin is okay */
      }
    } else {
      // Create local main from origin/main if possible.
      try {
        await g.checkout(['-b', 'main', 'origin/main'])
      } catch {
        // Fall back to current HEAD when origin/main is unavailable.
      }
    }
    await g.checkoutLocalBranch(branchName)
    return { ok: true, message: `Created and switched to ${branchName}` }
  } catch (err) {
    return fail(err)
  }
}
