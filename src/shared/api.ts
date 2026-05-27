import type {
  ActionResult,
  AppSettings,
  CreateTerminalOptions,
  FileEntry,
  GitFileChange,
  GitStatus,
  LaunchResult,
  PersistedState,
  Project,
  SavedCommand,
  SshBuildResult,
  SshConfig,
  TerminalSession,
  Tool,
  UpdateCheckResult
} from './types'

/** The full surface exposed to the renderer as `window.api`. */
export interface IdeTermApi {
  store: {
    getState(): Promise<PersistedState>
    setSettings(partial: Partial<AppSettings>): Promise<AppSettings>
  }
  tools: {
    list(): Promise<Tool[]>
    detect(): Promise<Tool[]>
    save(tool: Tool): Promise<Tool[]>
    remove(id: string): Promise<Tool[]>
  }
  projects: {
    save(project: Project): Promise<Project[]>
    remove(id: string): Promise<Project[]>
  }
  dialog: {
    pickFolder(): Promise<string | null>
    pickExecutable(): Promise<string | null>
  }
  git: {
    status(path: string): Promise<GitStatus>
    changes(path: string): Promise<GitFileChange[]>
    stage(path: string, files: string[]): Promise<ActionResult>
    unstage(path: string, files: string[]): Promise<ActionResult>
    commit(path: string, message: string): Promise<ActionResult>
    pull(path: string): Promise<ActionResult>
    push(path: string): Promise<ActionResult>
    fetch(path: string): Promise<ActionResult>
    diff(path: string, file: string): Promise<string>
    branches(path: string): Promise<string[]>
  }
  launch: {
    tool(toolId: string, folderPath?: string): Promise<LaunchResult>
    command(command: string, cwd?: string, title?: string): Promise<LaunchResult>
  }
  pty: {
    create(opts: CreateTerminalOptions): Promise<TerminalSession>
    list(): Promise<TerminalSession[]>
    restart(id: string): Promise<TerminalSession | null>
    rename(id: string, title: string): Promise<TerminalSession | null>
    kill(id: string): Promise<void>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    onData(cb: (e: { id: string; data: string }) => void): () => void
    onExit(cb: (e: { id: string; exitCode: number }) => void): () => void
    onRestart(cb: (e: { id: string }) => void): () => void
  }
  commands: {
    save(cmd: SavedCommand): Promise<SavedCommand[]>
    remove(id: string): Promise<SavedCommand[]>
  }
  fs: {
    list(dir: string): Promise<FileEntry[]>
    read(file: string): Promise<string>
    write(file: string, content: string): Promise<void>
    create(target: string, kind: 'file' | 'directory'): Promise<string>
    delete(target: string): Promise<void>
    rename(target: string, newName: string): Promise<string>
    move(src: string, destDir: string): Promise<string>
    reveal(target: string): Promise<void>
    openExternal(target: string): Promise<string>
  }
  ssh: {
    build(config: SshConfig): Promise<SshBuildResult>
  }
  app: {
    version(): Promise<string>
    openExternal(url: string): Promise<void>
  }
  updates: {
    check(): Promise<UpdateCheckResult>
  }
}
