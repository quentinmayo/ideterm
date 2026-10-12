import { existsSync } from 'node:fs'
import type { SshBuildResult, SshConfig } from '@shared/types'

function quote(value: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    // Backslash is the path separator on Windows and double quotes cannot
    // appear in a path, so drop any quotes and wrap when there is whitespace.
    const cleaned = value.replace(/"/g, '')
    return /\s/.test(cleaned) ? `"${cleaned}"` : cleaned
  }
  if (!/[\s"\\$`]/.test(value)) return value
  // Escape every character that is special inside POSIX double quotes,
  // backslash included, so the value cannot break out of the quotes.
  const escaped = value.replace(/[\\"$`]/g, (c) => `\\${c}`)
  return `"${escaped}"`
}

/**
 * Assemble an `ssh` command string from a config and surface validation warnings.
 * Pure string building — does not connect anywhere.
 */
export function buildSshCommand(
  config: SshConfig,
  platform: NodeJS.Platform = process.platform
): SshBuildResult {
  const warnings: string[] = []
  const host = (config.host ?? '').trim()
  const user = (config.user ?? '').trim()

  const parts: string[] = ['ssh']

  if (config.port && config.port !== 22) parts.push('-p', String(config.port))
  if (config.identityFile?.trim()) {
    const key = config.identityFile.trim()
    parts.push('-i', quote(key, platform))
    if (!existsSync(key)) warnings.push(`Identity file not found at: ${key}`)
  }
  if (config.forwardAgent) parts.push('-A')
  if (config.extraFlags?.trim()) parts.push(config.extraFlags.trim())

  if (!host) {
    warnings.push('Host is required.')
  } else if (/\s/.test(host)) {
    warnings.push('Host should not contain spaces.')
  }
  if (!user) warnings.push('No user specified — ssh will use your local username.')

  const target = host ? (user ? `${user}@${host}` : host) : '<host>'
  parts.push(target)

  if (config.remoteCommand?.trim()) parts.push(config.remoteCommand.trim())

  return { command: parts.join(' '), warnings }
}
