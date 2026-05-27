import { describe, expect, it } from 'vitest'
import { firstSession, hasSession, newLeaf, removeLeaf, splitLeaf, type TileNode } from '../src/renderer/src/terminal/tileTree'

describe('tileTree', () => {
  it('creates a leaf for a session', () => {
    const leaf = newLeaf('s1')
    expect(leaf.kind).toBe('leaf')
    if (leaf.kind === 'leaf') expect(leaf.sessionId).toBe('s1')
  })

  it('splits a leaf into a two-child split', () => {
    const tree = splitLeaf(newLeaf('s1'), 's1', 's2', 'row')
    expect(tree.kind).toBe('split')
    if (tree.kind === 'split') {
      expect(tree.dir).toBe('row')
      expect(tree.children.map((c) => (c.kind === 'leaf' ? c.sessionId : '?'))).toEqual(['s1', 's2'])
    }
  })

  it('splits a nested target leaf', () => {
    const tree = splitLeaf(newLeaf('s1'), 's1', 's2', 'row')
    const nested = splitLeaf(tree, 's2', 's3', 'col')
    expect(hasSession(nested, 's3')).toBe(true)
    expect(firstSession(nested)).toBe('s1')
  })

  it('leaves the tree unchanged when the target is absent', () => {
    const tree = newLeaf('s1')
    expect(splitLeaf(tree, 'nope', 's2', 'row')).toBe(tree)
  })

  it('collapses a split to a single leaf when one child is removed', () => {
    const tree = splitLeaf(newLeaf('s1'), 's1', 's2', 'row')
    const after = removeLeaf(tree, 's2')
    expect(after?.kind).toBe('leaf')
    if (after?.kind === 'leaf') expect(after.sessionId).toBe('s1')
  })

  it('returns null when the last leaf is removed', () => {
    expect(removeLeaf(newLeaf('s1'), 's1')).toBeNull()
  })

  it('reports session membership', () => {
    const tree: TileNode = splitLeaf(newLeaf('a'), 'a', 'b', 'col')
    expect(hasSession(tree, 'b')).toBe(true)
    expect(hasSession(tree, 'zzz')).toBe(false)
  })

  it('finds the leftmost session', () => {
    let tree = splitLeaf(newLeaf('a'), 'a', 'b', 'row')
    tree = splitLeaf(tree, 'b', 'c', 'col')
    expect(firstSession(tree)).toBe('a')
  })
})
