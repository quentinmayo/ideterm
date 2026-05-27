import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings, PersistedState, Project, SavedCommand, Tool } from '@shared/types'

const STORE_VERSION = 1

function defaultSettings(): AppSettings {
  return {
    theme: 'dark',
    defaultShell: '',
    terminalFontSize: 13,
    terminalDockVisible: true
  }
}

function defaultState(): PersistedState {
  return {
    version: STORE_VERSION,
    projects: [],
    tools: [],
    savedCommands: [],
    settings: defaultSettings()
  }
}

/**
 * Single-file JSON persistence stored in the OS user-data directory.
 * Writes are atomic (temp file + rename) so a crash mid-write can't corrupt state.
 */
class Store {
  private state: PersistedState = defaultState()
  private loaded = false

  private get file(): string {
    return join(app.getPath('userData'), 'ideterm.json')
  }

  async load(): Promise<PersistedState> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<PersistedState>
      this.state = {
        ...defaultState(),
        ...parsed,
        settings: { ...defaultSettings(), ...(parsed.settings ?? {}) }
      }
    } catch {
      // Missing or unreadable file -> start from defaults.
      this.state = defaultState()
    }
    this.loaded = true
    return this.state
  }

  getState(): PersistedState {
    return this.state
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

  async saveProject(project: Project): Promise<Project[]> {
    const i = this.state.projects.findIndex((p) => p.id === project.id)
    if (i >= 0) this.state.projects[i] = project
    else this.state.projects.push(project)
    await this.persist()
    return this.state.projects
  }

  async removeProject(id: string): Promise<Project[]> {
    this.state.projects = this.state.projects.filter((p) => p.id !== id)
    await this.persist()
    return this.state.projects
  }

  /** Persist user-defined (custom) tools only; detected tools are computed at runtime. */
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
