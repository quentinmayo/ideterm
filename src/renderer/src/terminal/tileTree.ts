import type { SerializedTile } from '@shared/types'

/**
 * Pure operations on the terminal tiling tree. A leaf hosts one session;
 * a split arranges children in a row or column. No React — unit-testable.
 */
export type TileNode =
  | { kind: 'leaf'; id: string; sessionId: string }
  | { kind: 'split'; id: string; dir: 'row' | 'col'; children: TileNode[] }

export function newLeaf(sessionId: string): TileNode {
  return { kind: 'leaf', id: crypto.randomUUID(), sessionId }
}

/** Replace the leaf for `target` with a split containing it and a new session. */
export function splitLeaf(
  node: TileNode,
  target: string,
  newSession: string,
  dir: 'row' | 'col'
): TileNode {
  if (node.kind === 'leaf') {
    if (node.sessionId !== target) return node
    return { kind: 'split', id: crypto.randomUUID(), dir, children: [node, newLeaf(newSession)] }
  }
  return { ...node, children: node.children.map((c) => splitLeaf(c, target, newSession, dir)) }
}

/** Remove a session's leaf, collapsing splits that drop to a single child. */
export function removeLeaf(node: TileNode, sessionId: string): TileNode | null {
  if (node.kind === 'leaf') return node.sessionId === sessionId ? null : node
  const kids = node.children
    .map((c) => removeLeaf(c, sessionId))
    .filter((c): c is TileNode => c !== null)
  if (kids.length === 0) return null
  if (kids.length === 1) return kids[0]
  return { ...node, children: kids }
}

export function firstSession(node: TileNode): string | null {
  if (node.kind === 'leaf') return node.sessionId
  for (const c of node.children) {
    const s = firstSession(c)
    if (s) return s
  }
  return null
}

export function hasSession(node: TileNode, sessionId: string): boolean {
  if (node.kind === 'leaf') return node.sessionId === sessionId
  return node.children.some((c) => hasSession(c, sessionId))
}

/** How to re-spawn a terminal leaf when restoring a snapshot. */
export interface LeafDescriptor {
  cwd: string
  shell: string
  title: string
  toolId?: string
}

/** Convert a live tile tree into a serializable one, resolving each leaf's descriptor. */
export function serializeTree(
  node: TileNode,
  resolve: (sessionId: string) => LeafDescriptor
): SerializedTile {
  if (node.kind === 'leaf') return { kind: 'leaf', ...resolve(node.sessionId) }
  return { kind: 'split', dir: node.dir, children: node.children.map((c) => serializeTree(c, resolve)) }
}

/** Leaf descriptors in depth-first order (matches buildTree's traversal). */
export function collectLeaves(node: SerializedTile): LeafDescriptor[] {
  if (node.kind === 'leaf') {
    const { kind: _k, ...desc } = node
    return [desc]
  }
  return node.children.flatMap(collectLeaves)
}

/** Rebuild a live tile tree, calling nextSessionId() per leaf in the same DFS order. */
export function buildTree(node: SerializedTile, nextSessionId: () => string): TileNode {
  if (node.kind === 'leaf') return { kind: 'leaf', id: crypto.randomUUID(), sessionId: nextSessionId() }
  return {
    kind: 'split',
    id: crypto.randomUUID(),
    dir: node.dir,
    children: node.children.map((c) => buildTree(c, nextSessionId))
  }
}
