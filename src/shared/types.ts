/**
 * Shared types used across the main, preload, and renderer processes.
 * Keep this file free of any Node or DOM specific imports.
 */

export type ToolType = 'ide' | 'terminal' | 'ai-agent' | 'custom'

export interface Tool {
  id: string
  name: string
  type: ToolType
  /** Absolute path to the executable (or a command resolvable on PATH). */
  path: string
  /** Default arguments applied on every launch, e.g. ["--dangerously-skip-permissions"]. */
  args: string[]
  /** Emoji or short label shown in the UI. */
  icon?: string
  /** True for auto-detected tools; false/undefined for user-defined ones. */
  builtin?: boolean
  /**
   * Where the target folder path is inserted relative to args.
   * "append"  -> exe <args...> <folder>
   * "prepend" -> exe <folder> <args...>
   * "none"    -> exe <args...>            (folder used only as cwd)
   */
  folderArgPosition?: 'append' | 'prepend' | 'none'
  /**
   * How the tool is started:
   * "external" -> detached OS process with its own window (IDEs, GUI terminals).
   * "shell"    -> this executable IS the shell run inside an embedded terminal.
   * "command"  -> run the default shell in an embedded terminal, then type this command.
   * Defaults are inferred from `type` when omitted.
   */
  launchMode?: 'external' | 'shell' | 'command'
  /**
   * Optional named launch presets. When present, the UI lets you pick a mode;
   * each mode's args replace the tool's default `args` for that launch.
   */
  modes?: ToolMode[]
}

/**
 * A named launch configuration for a tool. Lets one tool be multi-purpose:
 * each mode can override the type and launch config, not just the args.
 * e.g. "Open (IDE)" vs "Diff (run `code --diff` in a terminal)".
 */
export interface ToolMode {
  id: string
  label: string
  args: string[]
  /** Override the tool's type for this mode (a tool can be multi-type). */
  type?: ToolType
  launchMode?: 'external' | 'shell' | 'command'
  folderArgPosition?: 'append' | 'prepend' | 'none'
}

export interface ProjectFolder {
  id: string
  /** Absolute filesystem path to the working directory. */
  path: string
  /** Display name; defaults to the folder's basename. */
  name: string
}

export interface Project {
  id: string
  name: string
  color?: string
  /** Emoji shown next to the project name. */
  icon?: string
  folders: ProjectFolder[]
  createdAt: number
}

export interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
}

export interface GitStatus {
  path: string
  isRepo: boolean
  branch?: string
  ahead?: number
  behind?: number
  tracking?: string | null
  staged: number
  modified: number
  untracked: number
  conflicted: number
  dirty: boolean
  lastCommit?: GitCommit
  error?: string
}

/** A node in the file tree. */
export interface FileEntry {
  name: string
  path: string
  kind: 'file' | 'directory'
  size: number
}

export interface SearchOptions {
  regex?: boolean
  caseSensitive?: boolean
}

export interface SearchMatch {
  line: number
  text: string
}

export interface SearchFileResult {
  path: string
  /** Path relative to the searched directory. */
  relative: string
  matches: SearchMatch[]
}

export interface ReplaceResult {
  filesChanged: number
  replacements: number
}

/** One changed path in a working tree, as shown in the inline Git panel. */
export interface GitFileChange {
  path: string
  /** Index (staged) status char: M/A/D/R/C/U or space. */
  index: string
  /** Working-tree status char: M/D/?/space. */
  workingDir: string
  staged: boolean
  untracked: boolean
}

export interface SavedCommand {
  id: string
  label: string
  command: string
}

/**
 * A one-click favorite: a command run at a specific path, either inside an
 * embedded terminal or in an external terminal window. Shown on the welcome
 * screen and the Favorites panel.
 */
export interface FavCommand {
  id: string
  label: string
  icon?: string
  /** Working directory the command runs in. */
  cwd: string
  /** The literal command to run. */
  command: string
  /** Where it runs: an embedded terminal pane, or an external terminal window. */
  target: 'embedded' | 'external'
}

export interface AppSettings {
  theme: 'dark' | 'light'
  /** Default shell executable for new terminals (e.g. powershell.exe, pwsh, bash). */
  defaultShell: string
  /** Font size for embedded terminals. */
  terminalFontSize: number
  /** Whether the bottom terminal dock is visible. */
  terminalDockVisible: boolean
}

/** Where session snapshots live and how startup behaves (global, app-wide). */
export interface SnapshotsConfig {
  /** Default directory new on-disk snapshots are created in. */
  dir: string
  /** Most-recent-first list of snapshot file paths. */
  recent: string[]
  /** Path of the last-open snapshot (the working one). */
  lastOpened: string | null
  /** Startup behavior: show the launcher, or auto-open the most recent. */
  restoreMode: 'ask' | 'last'
  /** False while the app is running; set true on graceful quit (abrupt-close detection). */
  cleanShutdown: boolean
}

/** A record of a tool/fav we triggered, for the one-click "recent" buddies. */
export interface RecentLaunch {
  id: string
  label: string
  icon?: string
  cwd?: string
  at: number
  kind: 'tool' | 'fav'
  /** For kind 'tool'. */
  toolId?: string
  modeId?: string
  /** For kind 'fav' (also lets it re-run even if the favorite was deleted). */
  command?: string
  target?: 'embedded' | 'external'
}

export interface PersistedState {
  version: number
  tools: Tool[]
  savedCommands: SavedCommand[]
  favCommands: FavCommand[]
  recentLaunches: RecentLaunch[]
  settings: AppSettings
  snapshots: SnapshotsConfig
}

export type SnapshotView = 'projects' | 'favorites' | 'tools' | 'sessions' | 'files' | 'settings'

/** A tile in a serialized terminal layout — leaves describe how to re-spawn the pty. */
export type SerializedTile =
  | { kind: 'leaf'; cwd: string; shell: string; title: string; toolId?: string }
  | { kind: 'split'; dir: 'row' | 'col'; children: SerializedTile[] }

export interface SerializedGroup {
  name: string
  tree: SerializedTile
}

export interface SerializedFloating {
  cwd: string
  shell: string
  title: string
  x: number
  y: number
  w: number
  h: number
}

/** The open, serializable UI state captured in a snapshot. */
export interface SessionUiState {
  activeView: SnapshotView
  selectedProjectId: string | null
  filesTarget: { path: string; name: string } | null
  openFiles: { path: string; name: string }[]
  terminals: SerializedGroup[]
  floating: SerializedFloating[]
  dockVisible: boolean
  dockHeight: number
}

/** A full workspace snapshot persisted to a file on disk. */
export interface SessionSnapshot {
  version: number
  name: string
  createdAt: number
  updatedAt: number
  projects: Project[]
  ui: SessionUiState
}

/** Metadata about a snapshot file for the launcher's recent list. */
export interface SnapshotMeta {
  path: string
  name: string
  updatedAt: number | null
  exists: boolean
}

/** Snapshot subsystem state surfaced to the renderer at startup. */
export interface SessionState {
  dir: string
  lastOpened: string | null
  restoreMode: 'ask' | 'last'
  recent: SnapshotMeta[]
  wasAbruptShutdown: boolean
  tempPath: string
}

/** Runtime descriptor for a live pty-backed terminal session. */
export interface TerminalSession {
  id: string
  title: string
  cwd: string
  shell: string
  /** Tool that spawned this session, if any. */
  toolId?: string
  pid?: number
  alive: boolean
  createdAt: number
}

export interface CreateTerminalOptions {
  cwd: string
  shell?: string
  /** Arguments passed to the shell executable itself (e.g. ["-d", "Ubuntu"] for wsl). */
  shellArgs?: string[]
  title?: string
  /** A command typed into the pty immediately after spawn (with trailing newline). */
  initialCommand?: string
  toolId?: string
  cols?: number
  rows?: number
}

/** Result of asking the main process to launch a tool against a folder. */
export type LaunchResult =
  | { kind: 'external'; ok: boolean; message: string }
  | { kind: 'terminal'; ok: boolean; message: string; session?: TerminalSession }

export interface ActionResult {
  ok: boolean
  message: string
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  /** Release page (or releases list) to open for download. */
  url: string | null
  publishedAt: string | null
  notes: string | null
  /** Set when the check could not complete (offline, no releases yet, rate limited). */
  error?: string
}

export interface SshConfig {
  host: string
  user?: string
  port?: number
  identityFile?: string
  forwardAgent?: boolean
  extraFlags?: string
  remoteCommand?: string
}

export interface SshBuildResult {
  command: string
  warnings: string[]
}
