import { existsSync } from 'node:fs'
import type { SshBuildResult, SshConfig } from '@shared/types'

function quote(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

/**
 * Assemble an `ssh` command string from a config and surface validation warnings.
 * Pure string building — does not connect anywhere.
 */
export function buildSshCommand(config: SshConfig): SshBuildResult {
  const warnings: string[] = []
  const host = (config.host ?? '').trim()
  const user = (config.user ?? '').trim()

  const parts: string[] = ['ssh']

  if (config.port && config.port !== 22) parts.push('-p', String(config.port))
  if (config.identityFile?.trim()) {
    const key = config.identityFile.trim()
    parts.push('-i', quote(key))
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
