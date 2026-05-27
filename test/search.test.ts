import { describe, expect, it } from 'vitest'
import { buildMatcher, findInText } from '../src/main/services/search'

describe('buildMatcher', () => {
  it('treats the query literally by default (escapes regex chars)', () => {
    expect(buildMatcher('a.b').test('a.b')).toBe(true)
    expect(buildMatcher('a.b').test('axb')).toBe(false)
  })
  it('is case-insensitive by default and case-sensitive when asked', () => {
    expect(buildMatcher('Foo').test('foo')).toBe(true)
    expect(buildMatcher('Foo', { caseSensitive: true }).test('foo')).toBe(false)
  })
  it('honors regex mode', () => {
    expect(buildMatcher('a.b', { regex: true }).test('axb')).toBe(true)
    expect(buildMatcher('\\d+', { regex: true }).test('item 42')).toBe(true)
  })
})

describe('findInText', () => {
  it('returns 1-based line numbers for matching lines only', () => {
    const text = 'alpha\nbeta TODO\ngamma\nTODO again'
    const matches = findInText(text, buildMatcher('TODO'))
    expect(matches.map((m) => m.line)).toEqual([2, 4])
    expect(matches[0].text).toBe('beta TODO')
  })
  it('returns nothing when there is no match', () => {
    expect(findInText('nothing here', buildMatcher('zzz'))).toHaveLength(0)
  })
})
