import { describe, expect, it } from 'vitest'
import { compareVersions, isNewerVersion } from '../src/main/services/version'

describe('compareVersions', () => {
  it('orders by major, minor, then patch', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1)
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareVersions('0.1.0', '0.1.1')).toBe(-1)
  })
  it('ignores a leading v and pre-release suffix', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(0)
  })
  it('treats missing components as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1', '1.0.1')).toBe(-1)
  })
})

describe('isNewerVersion', () => {
  it('is true only when latest exceeds current', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false)
    expect(isNewerVersion('v1.0.0', '0.9.9')).toBe(true)
  })
})
