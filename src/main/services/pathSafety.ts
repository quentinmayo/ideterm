import { isAbsolute, relative, resolve } from 'node:path'

/**
 * Pure path-containment helpers used to sandbox file operations to project
 * roots. No Node side effects beyond path math, so they are unit-testable.
 */

/** Normalize a path for comparison (case-insensitive on Windows). */
export function normalizePath(p: string, isWin: boolean = process.platform === 'win32'): string {
  const r = resolve(p)
  return isWin ? r.toLowerCase() : r
}

/** True if `child` is `parent` or sits inside it (no `..` escape). */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** True if a target path lies within any of the given allowed roots. */
export function isPathInsideRoots(
  target: string,
  roots: string[],
  isWin: boolean = process.platform === 'win32'
): boolean {
  const t = normalizePath(target, isWin)
  return roots.map((r) => normalizePath(r, isWin)).some((r) => isInside(t, r))
}
