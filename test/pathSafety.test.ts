import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isInside, isPathInsideRoots, normalizePath } from '../src/main/services/pathSafety'

describe('isInside', () => {
  it('treats a path as inside itself', () => {
    const p = resolve('/projects/app')
    expect(isInside(p, p)).toBe(true)
  })
  it('detects descendants', () => {
    expect(isInside(resolve('/projects/app/src/x.ts'), resolve('/projects/app'))).toBe(true)
  })
  it('rejects ancestors and siblings', () => {
    expect(isInside(resolve('/projects'), resolve('/projects/app'))).toBe(false)
    expect(isInside(resolve('/projects/other'), resolve('/projects/app'))).toBe(false)
  })
})

describe('isPathInsideRoots', () => {
  const roots = [resolve('/projects/app'), resolve('/work/infra')]

  it('allows paths inside any root', () => {
    expect(isPathInsideRoots(resolve('/projects/app/src/main.ts'), roots)).toBe(true)
    expect(isPathInsideRoots(resolve('/work/infra/terraform'), roots)).toBe(true)
  })
  it('blocks paths outside every root', () => {
    expect(isPathInsideRoots(resolve('/etc/passwd'), roots)).toBe(false)
    expect(isPathInsideRoots(resolve('/projects/secret'), roots)).toBe(false)
  })
  it('blocks parent-traversal escapes', () => {
    expect(isPathInsideRoots(resolve('/projects/app/../secret'), roots)).toBe(false)
  })
  it('is case-insensitive when isWin=true', () => {
    expect(isPathInsideRoots('/Projects/APP/src', ['/projects/app'], true)).toBe(true)
  })
})

describe('normalizePath', () => {
  it('lowercases on Windows mode', () => {
    expect(normalizePath('/Foo/Bar', true)).toBe(normalizePath('/foo/bar', true))
  })
  it('preserves case off Windows mode', () => {
    expect(normalizePath('/Foo', false)).not.toBe(normalizePath('/foo', false))
  })
})
