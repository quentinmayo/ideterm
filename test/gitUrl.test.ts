import { describe, expect, it } from 'vitest'
import { gitRemoteToWebUrl, repoShortName } from '../src/renderer/src/util/gitUrl'

describe('gitRemoteToWebUrl', () => {
  it('converts scp-like git@ URLs', () => {
    expect(gitRemoteToWebUrl('git@github.com:quentinmayo/ideterm.git')).toBe(
      'https://github.com/quentinmayo/ideterm'
    )
  })
  it('strips .git from https URLs', () => {
    expect(gitRemoteToWebUrl('https://github.com/quentinmayo/ideterm.git')).toBe(
      'https://github.com/quentinmayo/ideterm'
    )
    expect(gitRemoteToWebUrl('https://github.com/quentinmayo/ideterm')).toBe(
      'https://github.com/quentinmayo/ideterm'
    )
  })
  it('normalizes ssh:// URLs', () => {
    expect(gitRemoteToWebUrl('ssh://git@github.com/owner/repo.git')).toBe('https://github.com/owner/repo')
  })
  it('returns null for empty or unknown forms', () => {
    expect(gitRemoteToWebUrl('')).toBeNull()
    expect(gitRemoteToWebUrl(null)).toBeNull()
    expect(gitRemoteToWebUrl('/local/path')).toBeNull()
  })
})

describe('repoShortName', () => {
  it('extracts owner/repo', () => {
    expect(repoShortName('https://github.com/quentinmayo/ideterm')).toBe('quentinmayo/ideterm')
  })
  it('returns null when there is no url', () => {
    expect(repoShortName(null)).toBeNull()
  })
})
