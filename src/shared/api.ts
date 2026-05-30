import type {
  ActionResult,
  AppSettings,
  CreateTerminalOptions,
  FavCommand,
  RecentLaunch,
  FileEntry,
  GitFileChange,
  GitPathState,
  GitStatus,
  GithubRepoSummary,
  LaunchResult,
  PersistedState,
  Project,
  ReplaceResult,
  SavedCommand,
  SearchFileResult,
  SearchOptions,
  SessionSnapshot,
  SessionState,
  SnapshotMeta,
  SshBuildResult,
  SshConfig,
  TerminalSession,
  Tool,
  UpdateCheckResult
} from './types'

export type MenuAction = 'new-temp' | 'new-disk' | 'open' | 'save' | 'save-as' | 'open-path'

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
  session: {
    state(): Promise<SessionState>
    read(path: string): Promise<SessionSnapshot>
    write(snapshot: SessionSnapshot, path: string): Promise<SessionSnapshot>
    tempPath(): Promise<string>
    recent(): Promise<SnapshotMeta[]>
    setRoots(projects: Project[]): Promise<void>
    setRestoreMode(mode: 'ask' | 'last'): Promise<void>
    setDir(dir: string): Promise<void>
    saveDialog(defaultName: string): Promise<string | null>
    openDialog(): Promise<string | null>
    /** Subscribe to native File-menu actions; returns an unsubscribe fn. */
    onMenu(cb: (action: MenuAction, arg?: string) => void): () => void
    /** Main asks the renderer to persist before the window closes. */
    onFlush(cb: () => void): () => void
    flushDone(): void
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
    remote(path: string): Promise<string | null>
    githubList(limit?: number): Promise<GithubRepoSummary[]>
    githubSearch(query: string, limit?: number): Promise<GithubRepoSummary[]>
    githubClone(repo: string, destinationPath: string): Promise<ActionResult>
    inspectPath(path: string): Promise<GitPathState>
    createBranchFromMain(path: string, branchName: string): Promise<ActionResult>
  }
  launch: {
    tool(toolId: string, folderPath?: string, modeId?: string): Promise<LaunchResult>
    command(command: string, cwd?: string, title?: string): Promise<LaunchResult>
    externalCommand(command: string, cwd?: string): Promise<ActionResult>
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
  favs: {
    save(fav: FavCommand): Promise<FavCommand[]>
    remove(id: string): Promise<FavCommand[]>
  }
  recents: {
    add(entry: RecentLaunch): Promise<RecentLaunch[]>
    clear(): Promise<RecentLaunch[]>
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
    search(dir: string, query: string, opts: SearchOptions): Promise<SearchFileResult[]>
    replace(dir: string, query: string, replacement: string, opts: SearchOptions): Promise<ReplaceResult>
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
