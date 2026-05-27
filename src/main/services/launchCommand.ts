import type { Tool } from '@shared/types'

/**
 * Pure helpers for turning a Tool + target folder into a command line.
 * Kept free of Node/Electron imports so they are trivially unit-testable.
 */

/** Quote an argument for a shell command line if it contains spaces or quotes. */
export function quoteArg(arg: string): string {
  if (arg === '') return '""'
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
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
export function buildCommandLine(tool: Tool, folderPath?: string): string {
  return [tool.path, ...placeFolder(tool, folderPath)].map(quoteArg).join(' ')
}
