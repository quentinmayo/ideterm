import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import type { LaunchResult, Tool } from '@shared/types'
import { defaultShell, listTools } from './tools'
import { ptyManager } from './pty'
import { buildCommandLine, resolveLaunchMode } from './launchCommand'

/** Launch a detached external process (its own window) — IDEs, GUI terminals. */
function launchExternal(tool: Tool, folderPath?: string): LaunchResult {
  const commandLine = buildCommandLine(tool, folderPath)
  try {
    // shell:true so Windows .cmd/.bat shims (e.g. code.cmd) launch correctly.
    const child = spawn(commandLine, {
      cwd: folderPath && existsSync(folderPath) ? folderPath : undefined,
      shell: true,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
    return { kind: 'external', ok: true, message: `Launched ${tool.name}` }
  } catch (err) {
    return { kind: 'external', ok: false, message: `Failed to launch ${tool.name}: ${String(err)}` }
  }
}

export async function launchTool(toolId: string, folderPath?: string): Promise<LaunchResult> {
  const tools = await listTools()
  const tool = tools.find((t) => t.id === toolId)
  if (!tool) return { kind: 'external', ok: false, message: `Tool not found: ${toolId}` }
  if (folderPath && !existsSync(folderPath)) {
    return { kind: 'external', ok: false, message: `Folder not found: ${folderPath}` }
  }

  const mode = resolveLaunchMode(tool)
  const cwd = folderPath && existsSync(folderPath) ? folderPath : homedir()
  const label = folderPath ? `${tool.name} · ${basename(folderPath)}` : tool.name

  if (mode === 'external') return launchExternal(tool, folderPath)

  try {
    if (mode === 'shell') {
      const session = ptyManager.create({
        cwd,
        shell: tool.path,
        shellArgs: tool.args,
        title: label,
        toolId: tool.id
      })
      return { kind: 'terminal', ok: true, message: `Opened ${tool.name}`, session }
    }
    // mode === 'command': run the default shell, then type the tool's command.
    const initialCommand = buildCommandLine(tool, folderPath)
    const session = ptyManager.create({
      cwd,
      shell: defaultShell(),
      title: label,
      initialCommand,
      toolId: tool.id
    })
    return { kind: 'terminal', ok: true, message: `Running ${tool.name}`, session }
  } catch (err) {
    return { kind: 'terminal', ok: false, message: String(err instanceof Error ? err.message : err) }
  }
}

/** Open an embedded terminal at cwd and run an arbitrary command string. */
export function launchCommand(command: string, cwd?: string, title?: string): LaunchResult {
  const dir = cwd && existsSync(cwd) ? cwd : homedir()
  try {
    const session = ptyManager.create({
      cwd: dir,
      shell: defaultShell(),
      title: title || command.slice(0, 24),
      initialCommand: command
    })
    return { kind: 'terminal', ok: true, message: 'Command started', session }
  } catch (err) {
    return { kind: 'terminal', ok: false, message: String(err instanceof Error ? err.message : err) }
  }
}
