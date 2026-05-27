import { app } from 'electron'
import type { UpdateCheckResult } from '@shared/types'
import { isNewerVersion } from './version'

const REPO = 'quentinmayo/ideterm'

interface GithubRelease {
  tag_name?: string
  html_url?: string
  published_at?: string
  body?: string
}

/**
 * Lightweight update check: ask the GitHub Releases API for the latest release
 * and compare its tag to the running app version. Never throws.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const releasesUrl = `https://github.com/${REPO}/releases`
  const base: UpdateCheckResult = {
    currentVersion,
    latestVersion: null,
    hasUpdate: false,
    url: releasesUrl,
    publishedAt: null,
    notes: null
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ideterm-update-check' }
    })
    if (res.status === 404) return { ...base, error: 'No releases published yet.' }
    if (!res.ok) return { ...base, error: `GitHub API error ${res.status}` }
    const data = (await res.json()) as GithubRelease
    const latestVersion = (data.tag_name ?? '').replace(/^v/i, '') || null
    return {
      currentVersion,
      latestVersion,
      hasUpdate: latestVersion ? isNewerVersion(latestVersion, currentVersion) : false,
      url: data.html_url ?? releasesUrl,
      publishedAt: data.published_at ?? null,
      notes: data.body ?? null
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) }
  }
}
