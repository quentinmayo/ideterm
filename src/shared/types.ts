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

export interface AppSettings {
  theme: 'dark' | 'light'
  /** Default shell executable for new terminals (e.g. powershell.exe, pwsh, bash). */
  defaultShell: string
  /** Font size for embedded terminals. */
  terminalFontSize: number
  /** Whether the bottom terminal dock is visible. */
  terminalDockVisible: boolean
}

export interface PersistedState {
  version: number
  projects: Project[]
  tools: Tool[]
  savedCommands: SavedCommand[]
  settings: AppSettings
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
