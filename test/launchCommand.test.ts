import { describe, expect, it } from 'vitest'
import type { Tool, ToolType } from '@shared/types'
import { buildCommandLine, placeFolder, quoteArg, resolveLaunchMode } from '../src/main/services/launchCommand'

function tool(partial: Partial<Tool> & { type: ToolType }): Tool {
  return {
    id: 'id',
    name: 'T',
    path: 'tool',
    args: [],
    folderArgPosition: 'append',
    ...partial
  }
}

describe('quoteArg', () => {
  it('leaves simple args untouched', () => {
    expect(quoteArg('--flag')).toBe('--flag')
  })
  it('quotes args with spaces', () => {
    expect(quoteArg('C:\\Program Files\\x')).toBe('"C:\\Program Files\\x"')
  })
  it('escapes inner quotes and handles empty', () => {
    expect(quoteArg('a"b')).toBe('"a\\"b"')
    expect(quoteArg('')).toBe('""')
  })
})

describe('placeFolder', () => {
  const args = ['--foo']
  it('appends the folder after args by default', () => {
    expect(placeFolder(tool({ type: 'ide', args, folderArgPosition: 'append' }), '/repo')).toEqual(['--foo', '/repo'])
  })
  it('prepends the folder before args', () => {
    expect(placeFolder(tool({ type: 'ide', args, folderArgPosition: 'prepend' }), '/repo')).toEqual(['/repo', '--foo'])
  })
  it('omits the folder when position is none', () => {
    expect(placeFolder(tool({ type: 'ai-agent', args, folderArgPosition: 'none' }), '/repo')).toEqual(['--foo'])
  })
  it('drops the folder slot when no folder is given', () => {
    expect(placeFolder(tool({ type: 'ide', args, folderArgPosition: 'append' }), undefined)).toEqual(['--foo'])
  })
})

describe('resolveLaunchMode', () => {
  it('infers from type when unset', () => {
    expect(resolveLaunchMode(tool({ type: 'ide' }))).toBe('external')
    expect(resolveLaunchMode(tool({ type: 'terminal' }))).toBe('shell')
    expect(resolveLaunchMode(tool({ type: 'ai-agent' }))).toBe('command')
    expect(resolveLaunchMode(tool({ type: 'custom' }))).toBe('command')
  })
  it('respects an explicit launch mode', () => {
    expect(resolveLaunchMode(tool({ type: 'ide', launchMode: 'command' }))).toBe('command')
  })
})

describe('buildCommandLine', () => {
  it('builds an IDE open command with the folder appended', () => {
    const code = tool({ type: 'ide', path: 'code', args: [], folderArgPosition: 'append' })
    expect(buildCommandLine(code, '/repo')).toBe('code /repo')
  })
  it('builds a Claude command with flags and no folder arg', () => {
    const claude = tool({
      type: 'ai-agent',
      path: 'claude',
      args: ['--dangerously-skip-permissions'],
      folderArgPosition: 'none'
    })
    expect(buildCommandLine(claude, '/repo')).toBe('claude --dangerously-skip-permissions')
  })
  it('quotes spaced executable paths and folders', () => {
    const t = tool({ type: 'ide', path: 'C:\\Apps\\My IDE\\ide.exe', args: [], folderArgPosition: 'append' })
    expect(buildCommandLine(t, 'D:\\my repo')).toBe('"C:\\Apps\\My IDE\\ide.exe" "D:\\my repo"')
  })
})
