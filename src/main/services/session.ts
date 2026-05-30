import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Project, SessionSnapshot, SessionState, SnapshotMeta } from '@shared/types'
import { store } from '../store'

const SNAPSHOT_VERSION = 1

/** Folder roots of the currently-active snapshot, used to sandbox file ops in fs.ts. */
let activeRoots: string[] = []

export function getActiveRoots(): string[] {
  return activeRoots
}
export function setActiveProjects(projects: Project[]): void {
  activeRoots = projects.flatMap((p) => p.folders.map((f) => f.path))
}

export function snapshotDir(): string {
  return store.getSnapshots().dir
}
export function tempPath(): string {
  return join(snapshotDir(), '.temporary.ideterm-session.json')
}

function defaultUi(): SessionSnapshot['ui'] {
  return {
    activeView: 'projects',
    selectedProjectId: null,
    filesTarget: null,
    openFiles: [],
    terminals: [],
    floating: [],
    dockVisible: true,
    dockHeight: 300
  }
}

export function newSnapshot(name: string): SessionSnapshot {
  const now = Date.now()
  return { version: SNAPSHOT_VERSION, name, createdAt: now, updatedAt: now, projects: [], ui: defaultUi() }
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(snapshotDir(), { recursive: true })
}

export async function readSnapshot(path: string): Promise<SessionSnapshot> {
  const raw = await fs.readFile(path, 'utf-8')
  const parsed = JSON.parse(raw) as SessionSnapshot
  setActiveProjects(parsed.projects ?? [])
  // Opening an on-disk snapshot should immediately affect startup/recents menus.
  if (path === tempPath()) await store.setLastOpened(path)
  else await store.addRecent(path)
  return parsed
}

export async function writeSnapshot(path: string, snapshot: SessionSnapshot): Promise<SessionSnapshot> {
  await ensureDir()
  snapshot.updatedAt = Date.now()
  const tmp = `${path}.tmp`
  await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf-8')
  await fs.rename(tmp, path)
  setActiveProjects(snapshot.projects ?? [])
  // Don't clutter the recent list with the temporary working file.
  if (path === tempPath()) await store.setLastOpened(path)
  else await store.addRecent(path)
  return snapshot
}

export async function listRecent(): Promise<SnapshotMeta[]> {
  const out: SnapshotMeta[] = []
  for (const path of store.getSnapshots().recent) {
    try {
      const stat = await fs.stat(path)
      let name = path.split(/[\\/]/).pop() ?? path
      try {
        name = (JSON.parse(await fs.readFile(path, 'utf-8')) as SessionSnapshot).name || name
      } catch {
        /* keep filename */
      }
      out.push({ path, name, updatedAt: stat.mtimeMs, exists: true })
    } catch {
      out.push({ path, name: path.split(/[\\/]/).pop() ?? path, updatedAt: null, exists: false })
    }
  }
  return out
}

export async function getSessionState(): Promise<SessionState> {
  const cfg = store.getSnapshots()
  return {
    dir: cfg.dir,
    lastOpened: cfg.lastOpened,
    restoreMode: cfg.restoreMode,
    recent: await listRecent(),
    wasAbruptShutdown: store.wasAbruptShutdown(),
    tempPath: tempPath()
  }
}

/**
 * Run once at startup: ensure the snapshot dir exists, and migrate any projects
 * from a pre-v2 global file into the temporary snapshot so nothing is lost.
 */
export async function initSession(): Promise<void> {
  await ensureDir()
  const legacy = store.getLegacyProjects()
  if (legacy && legacy.length) {
    const snap = newSnapshot('Migrated workspace')
    snap.projects = legacy
    await writeSnapshot(tempPath(), snap)
    store.clearLegacyProjects()
  }
}
