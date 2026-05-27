import { promises as fs } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { ReplaceResult, SearchFileResult, SearchMatch, SearchOptions } from '@shared/types'
import { isPathInsideRoots } from './pathSafety'
import { getActiveRoots } from './session'

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'release', '.vite', '.cache'])
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_RESULTS = 500
const MAX_MATCHES_PER_FILE = 50

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Build the search regex: literal (escaped) unless `regex`, case-insensitive unless `caseSensitive`. */
export function buildMatcher(query: string, opts: SearchOptions = {}): RegExp {
  const src = opts.regex ? query : escapeRegExp(query)
  return new RegExp(src, opts.caseSensitive ? 'g' : 'gi')
}

/** Lines of `text` that match, with 1-based line numbers. Pure. */
export function findInText(text: string, matcher: RegExp): SearchMatch[] {
  const out: SearchMatch[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    matcher.lastIndex = 0
    if (matcher.test(lines[i])) out.push({ line: i + 1, text: lines[i].slice(0, 400) })
  }
  return out
}

function assertAllowed(dir: string): string {
  const root = resolve(dir)
  if (!isPathInsideRoots(root, getActiveRoots())) {
    throw new Error('Path is outside any project folder')
  }
  return root
}

function isProbablyBinary(buf: Buffer): boolean {
  return buf.includes(0)
}

export async function searchDir(
  dir: string,
  query: string,
  opts: SearchOptions = {}
): Promise<SearchFileResult[]> {
  const root = assertAllowed(dir)
  if (!query.trim()) return []
  const matcher = buildMatcher(query, opts)
  const results: SearchFileResult[] = []

  async function walk(d: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return
    const entries = await fs.readdir(d, { withFileTypes: true })
    for (const e of entries) {
      if (results.length >= MAX_RESULTS) break
      const full = join(d, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(full)
        continue
      }
      if (!e.isFile()) continue
      try {
        const stat = await fs.stat(full)
        if (stat.size > MAX_FILE_BYTES) continue
        const buf = await fs.readFile(full)
        if (isProbablyBinary(buf)) continue
        const matches = findInText(buf.toString('utf-8'), matcher)
        if (matches.length) {
          results.push({ path: full, relative: relative(root, full), matches: matches.slice(0, MAX_MATCHES_PER_FILE) })
        }
      } catch {
        /* unreadable file — skip */
      }
    }
  }

  await walk(root)
  return results
}

export async function replaceInDir(
  dir: string,
  query: string,
  replacement: string,
  opts: SearchOptions = {}
): Promise<ReplaceResult> {
  const root = assertAllowed(dir)
  if (!query.trim()) return { filesChanged: 0, replacements: 0 }
  // For literal search, treat the replacement literally too (escape $ groups).
  const repl = opts.regex ? replacement : replacement.replace(/\$/g, '$$$$')
  let filesChanged = 0
  let replacements = 0

  async function walk(d: string): Promise<void> {
    const entries = await fs.readdir(d, { withFileTypes: true })
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(full)
        continue
      }
      if (!e.isFile()) continue
      try {
        const stat = await fs.stat(full)
        if (stat.size > MAX_FILE_BYTES) continue
        const buf = await fs.readFile(full)
        if (isProbablyBinary(buf)) continue
        const text = buf.toString('utf-8')
        // Count separately so the string replacement keeps regex group refs ($1) working.
        const count = (text.match(buildMatcher(query, opts)) ?? []).length
        if (count > 0) {
          await fs.writeFile(full, text.replace(buildMatcher(query, opts), repl), 'utf-8')
          filesChanged++
          replacements += count
        }
      } catch {
        /* skip */
      }
    }
  }

  await walk(root)
  return { filesChanged, replacements }
}
