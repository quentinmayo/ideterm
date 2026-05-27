/**
 * Pure semantic-version comparison (no Node/Electron imports) so it is unit-testable.
 * Tolerant of a leading "v" and missing components (treated as 0).
 */
function parts(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
}

/** -1 if a<b, 0 if equal, 1 if a>b (by major.minor.patch). */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a)
  const pb = parts(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

/** True when `latest` is a strictly newer version than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}
