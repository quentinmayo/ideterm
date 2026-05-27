import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Tool, ToolType } from '@shared/types'
import { store } from '../store'

const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

/** Resolve a bare command name to an absolute path via the OS resolver (where/which). */
function findOnPath(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const finder = isWin ? 'where' : 'which'
    execFile(finder, [command], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null)
      const first = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
      resolve(first ?? null)
    })
  })
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) if (p && existsSync(p)) return p
  return null
}

/** The user's interactive shell — the default for new embedded terminals. */
export function defaultShell(): string {
  const configured = store.getState().settings.defaultShell
  if (configured) return configured
  if (isWin) return process.env.ComSpec || 'powershell.exe'
  return process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')
}

interface ToolProbe {
  key: string
  name: string
  type: ToolType
  icon: string
  launchMode: 'external' | 'shell' | 'command'
  /** Where the target folder goes in the launch command. */
  folderArgPosition: 'append' | 'prepend' | 'none'
  defaultArgs?: string[]
  /** Bare commands to look up on PATH, in priority order. */
  commands?: string[]
  /** Absolute paths to probe if PATH lookup fails. */
  files?: string[]
}

const local = (...segs: string[]): string => join(homedir(), ...segs)

function probes(): ToolProbe[] {
  const common: ToolProbe[] = [
    {
      key: 'vscode',
      name: 'VS Code',
      type: 'ide',
      icon: '🟦',
      launchMode: 'external',
      folderArgPosition: 'append',
      commands: ['code'],
      files: isWin
        ? [
            local('AppData', 'Local', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
            'C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd'
          ]
        : isMac
          ? ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code']
          : ['/usr/bin/code', '/snap/bin/code', '/usr/local/bin/code']
    },
    {
      key: 'cursor',
      name: 'Cursor',
      type: 'ide',
      icon: '🟧',
      launchMode: 'external',
      folderArgPosition: 'append',
      commands: ['cursor'],
      files: isWin
        ? [local('AppData', 'Local', 'Programs', 'cursor', 'resources', 'app', 'bin', 'cursor.cmd')]
        : isMac
          ? ['/Applications/Cursor.app/Contents/Resources/app/bin/cursor']
          : ['/usr/bin/cursor', '/usr/local/bin/cursor']
    },
    {
      key: 'claude',
      name: 'Claude Code',
      type: 'ai-agent',
      icon: '🤖',
      launchMode: 'command',
      folderArgPosition: 'none',
      defaultArgs: [],
      commands: ['claude']
    },
    {
      key: 'warp',
      name: 'Warp',
      type: 'terminal',
      icon: '🌀',
      launchMode: 'external',
      folderArgPosition: 'none',
      commands: ['warp', 'warp-terminal'],
      files: isMac ? ['/Applications/Warp.app/Contents/MacOS/stable'] : []
    }
  ]

  if (isWin) {
    return [
      ...common,
      {
        key: 'wt',
        name: 'Windows Terminal',
        type: 'terminal',
        icon: '⬛',
        launchMode: 'external',
        folderArgPosition: 'none',
        commands: ['wt']
      },
      {
        key: 'pwsh',
        name: 'PowerShell 7',
        type: 'terminal',
        icon: '🟦',
        launchMode: 'shell',
        folderArgPosition: 'none',
        commands: ['pwsh']
      },
      {
        key: 'powershell',
        name: 'Windows PowerShell',
        type: 'terminal',
        icon: '💙',
        launchMode: 'shell',
        folderArgPosition: 'none',
        commands: ['powershell']
      },
      {
        key: 'gitbash',
        name: 'Git Bash',
        type: 'terminal',
        icon: '🐚',
        launchMode: 'shell',
        folderArgPosition: 'none',
        files: [
          'C:\\Program Files\\Git\\bin\\bash.exe',
          'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
          local('AppData', 'Local', 'Programs', 'Git', 'bin', 'bash.exe')
        ]
      },
      {
        key: 'wsl',
        name: 'WSL',
        type: 'terminal',
        icon: '🐧',
        launchMode: 'shell',
        folderArgPosition: 'none',
        commands: ['wsl']
      }
    ]
  }

  // macOS + Linux: detect common shells/terminals.
  const unix: ToolProbe[] = [
    ...common,
    {
      key: 'shell',
      name: isMac ? 'Terminal (shell)' : 'Shell',
      type: 'terminal',
      icon: '🐚',
      launchMode: 'shell',
      folderArgPosition: 'none',
      files: [process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash')]
    }
  ]
  if (!isMac) {
    unix.push(
      {
        key: 'gnome-terminal',
        name: 'GNOME Terminal',
        type: 'terminal',
        icon: '⬛',
        launchMode: 'external',
        folderArgPosition: 'none',
        commands: ['gnome-terminal']
      },
      {
        key: 'konsole',
        name: 'Konsole',
        type: 'terminal',
        icon: '⬛',
        launchMode: 'external',
        folderArgPosition: 'none',
        commands: ['konsole']
      }
    )
  }
  return unix
}

async function resolveProbe(p: ToolProbe): Promise<Tool | null> {
  let path: string | null = null
  for (const cmd of p.commands ?? []) {
    path = await findOnPath(cmd)
    if (path) break
  }
  if (!path) path = firstExisting(p.files ?? [])
  if (!path) return null
  return {
    id: `builtin:${p.key}`,
    name: p.name,
    type: p.type,
    path,
    args: p.defaultArgs ?? [],
    icon: p.icon,
    builtin: true,
    folderArgPosition: p.folderArgPosition,
    launchMode: p.launchMode
  }
}

/** Auto-detect installed tools for the current OS. */
export async function detectTools(): Promise<Tool[]> {
  const results = await Promise.all(probes().map(resolveProbe))
  return results.filter((t): t is Tool => t !== null)
}

/**
 * The merged tool list the renderer sees: detected tools, with any persisted
 * user overrides (same id) taking precedence, plus purely custom tools.
 */
export async function listTools(): Promise<Tool[]> {
  const detected = await detectTools()
  const custom = store.getCustomTools()
  const byId = new Map<string, Tool>()
  for (const t of detected) byId.set(t.id, t)
  for (const t of custom) byId.set(t.id, t) // user override / custom wins
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}
