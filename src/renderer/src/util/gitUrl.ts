/** Convert a git remote URL (scp-like, ssh, or https) into a browsable web URL. Pure. */
export function gitRemoteToWebUrl(remote: string | null | undefined): string | null {
  if (!remote) return null
  const url = remote.trim()
  // scp-like: git@github.com:owner/repo(.git)
  const scp = url.match(/^[\w.+-]+@([\w.-]+):(.+?)(?:\.git)?\/?$/)
  if (scp) return `https://${scp[1]}/${scp[2]}`
  // ssh://git@host/owner/repo(.git) or http(s)://host/owner/repo(.git)
  const normalized = url.replace(/^ssh:\/\/(?:[\w.+-]+@)?/, 'https://').replace(/\.git\/?$/, '')
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized
  return null
}

/** "owner/repo" extracted from a web URL, for a compact status-bar label. */
export function repoShortName(webUrl: string | null): string | null {
  if (!webUrl) return null
  const m = webUrl.match(/[:/]([\w.-]+\/[\w.-]+)$/)
  return m ? m[1] : null
}
