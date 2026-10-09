import type { Tool } from '@shared/types'

/**
 * Pure helpers for turning a Tool + target folder into a command line.
 * Kept free of Node/Electron imports so they are trivially unit-testable.
 */

export type ShellDialect = 'posix' | 'powershell' | 'cmd'
export function shellDialect(shell: string): ShellDialect {
  const name = shell.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (/^(pwsh|powershell)(\.exe)?$/.test(name)) return 'powershell'
  if (/^cmd(\.exe)?$/.test(name)) return 'cmd'
  return 'posix'
}

/** Quote literal arguments for the shell actually receiving them. */
export function quoteArg(arg: string, dialect: ShellDialect = 'posix'): string {
  if (dialect === 'cmd') {
    // cmd expands these even inside quotes. Refuse rather than reinterpret literals.
    if (/["%!^\r\n]/.test(arg)) throw new Error('This argument cannot be safely passed through cmd.exe')
    return `"${arg}"`
  }
  if (dialect === 'powershell') return "'" + arg.replace(/'/g, "''") + "'"
  if (/^[a-zA-Z0-9_./:=+,-]+$/.test(arg)) return arg
  return "'" + arg.replace(/'/g, "'\\''") + "'"
}

/** Place the folder path relative to the tool's default args. */
export function placeFolder(tool: Tool, folderPath: string | undefined): string[] {
  const folder = folderPath ? [folderPath] : []
  switch (tool.folderArgPosition ?? 'append') {
    case 'prepend':
      return [...folder, ...tool.args]
    case 'none':
      return [...tool.args]
    case 'append':
    default:
      return [...tool.args, ...folder]
  }
}

/** Resolve how a tool launches, inferring from type when not explicitly set. */
export function resolveLaunchMode(tool: Tool): 'external' | 'shell' | 'command' {
  if (tool.launchMode) return tool.launchMode
  switch (tool.type) {
    case 'ide':
      return 'external'
    case 'terminal':
      return 'shell'
    default:
      return 'command'
  }
}

/** The full, shell-quoted command line for launching a tool against a folder. */
export function buildCommandLine(tool: Tool, folderPath?: string, dialect: ShellDialect = 'posix'): string {
  return (dialect === 'powershell' ? '& ' : '') + [tool.path, ...placeFolder(tool, folderPath)].map((arg) => quoteArg(arg, dialect)).join(' ')
}

/**
 * The effective tool for a launch: a selected mode overrides args and, when set,
 * the type / launch mode / folder-arg position. Lets one tool be multi-type.
 */
export function effectiveTool(tool: Tool, modeId?: string): Tool {
  if (!modeId || !tool.modes) return tool
  const mode = tool.modes.find((m) => m.id === modeId)
  if (!mode) return tool
  return {
    ...tool,
    args: mode.args ?? tool.args,
    type: mode.type ?? tool.type,
    launchMode: mode.launchMode ?? tool.launchMode,
    folderArgPosition: mode.folderArgPosition ?? tool.folderArgPosition
  }
}
