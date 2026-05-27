import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  AppSettings,
  PersistedState,
  Project,
  SavedCommand,
  SnapshotsConfig,
  Tool
} from '@shared/types'

const STORE_VERSION = 2
const RECENT_LIMIT = 20

function defaultSettings(): AppSettings {
  return {
    theme: 'dark',
    defaultShell: '',
    terminalFontSize: 13,
    terminalDockVisible: true
  }
}

function defaultSnapshots(): SnapshotsConfig {
  return { dir: '', recent: [], lastOpened: null, restoreMode: 'ask', cleanShutdown: true }
}

function defaultState(): PersistedState {
  return {
    version: STORE_VERSION,
    tools: [],
    savedCommands: [],
    settings: defaultSettings(),
    snapshots: defaultSnapshots()
  }
}

/**
 * Single-file JSON persistence (global, app-wide) in the OS user-data dir.
 * Holds tools, saved commands, settings, and the snapshots registry — but NOT
 * projects or open state, which now live in per-snapshot files. Writes are atomic.
 */
class Store {
  private state: PersistedState = defaultState()
  private loaded = false
  private abruptShutdown = false
  /** Projects from a pre-v2 global file, migrated into the first snapshot. */
  private legacyProjects: Project[] | null = null

  private get file(): string {
    return join(app.getPath('userData'), 'ideterm.json')
  }

  async load(): Promise<PersistedState> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PersistedState> & { projects?: Project[] }
      this.state = {
        ...defaultState(),
        ...parsed,
        settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
        snapshots: { ...defaultSnapshots(), ...(parsed.snapshots ?? {}) }
      }
      // Pre-v2 files carried projects globally; hand them to snapshot migration.
      if ((parsed.version ?? 1) < 2 && Array.isArray(parsed.projects) && parsed.projects.length) {
        this.legacyProjects = parsed.projects
      }
      this.abruptShutdown = (parsed.snapshots?.cleanShutdown ?? true) === false
    } catch {
      this.state = defaultState()
    }
    this.state.version = STORE_VERSION
    if (!this.state.snapshots.dir) {
      this.state.snapshots.dir = join(app.getPath('userData'), 'snapshots')
    }
    // Mark "running"; a graceful quit flips this back to true.
    this.state.snapshots.cleanShutdown = false
    this.loaded = true
    await this.persist()
    return this.state
  }

  getState(): PersistedState {
    return this.state
  }

  wasAbruptShutdown(): boolean {
    return this.abruptShutdown
  }

  getLegacyProjects(): Project[] | null {
    return this.legacyProjects
  }
  clearLegacyProjects(): void {
    this.legacyProjects = null
  }

  private async persist(): Promise<void> {
    if (!this.loaded) return
    const tmp = `${this.file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf-8')
    await fs.rename(tmp, this.file)
  }

  async setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    this.state.settings = { ...this.state.settings, ...partial }
    await this.persist()
    return this.state.settings
  }

  // --- snapshots registry ---
  getSnapshots(): SnapshotsConfig {
    return this.state.snapshots
  }

  async setSnapshotDir(dir: string): Promise<void> {
    this.state.snapshots.dir = dir
    await this.persist()
  }

  async setRestoreMode(mode: 'ask' | 'last'): Promise<void> {
    this.state.snapshots.restoreMode = mode
    await this.persist()
  }

  async addRecent(path: string): Promise<void> {
    const recent = [path, ...this.state.snapshots.recent.filter((p) => p !== path)].slice(0, RECENT_LIMIT)
    this.state.snapshots.recent = recent
    this.state.snapshots.lastOpened = path
    await this.persist()
  }

  async setLastOpened(path: string | null): Promise<void> {
    this.state.snapshots.lastOpened = path
    await this.persist()
  }

  async setCleanShutdown(value: boolean): Promise<void> {
    this.state.snapshots.cleanShutdown = value
    await this.persist()
  }

  // --- tools ---
  async saveTool(tool: Tool): Promise<Tool[]> {
    const i = this.state.tools.findIndex((t) => t.id === tool.id)
    if (i >= 0) this.state.tools[i] = tool
    else this.state.tools.push(tool)
    await this.persist()
    return this.state.tools
  }

  async removeTool(id: string): Promise<Tool[]> {
    this.state.tools = this.state.tools.filter((t) => t.id !== id)
    await this.persist()
    return this.state.tools
  }

  getCustomTools(): Tool[] {
    return this.state.tools
  }

  // --- saved commands ---
  async saveCommand(cmd: SavedCommand): Promise<SavedCommand[]> {
    const i = this.state.savedCommands.findIndex((c) => c.id === cmd.id)
    if (i >= 0) this.state.savedCommands[i] = cmd
    else this.state.savedCommands.push(cmd)
    await this.persist()
    return this.state.savedCommands
  }

  async removeCommand(id: string): Promise<SavedCommand[]> {
    this.state.savedCommands = this.state.savedCommands.filter((c) => c.id !== id)
    await this.persist()
    return this.state.savedCommands
  }
}

export const store = new Store()
