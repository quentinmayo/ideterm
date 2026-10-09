import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import type { ActionResult, LaunchResult, Tool } from '@shared/types'
import { defaultShell, listTools } from './tools'
import { ptyManager } from './pty'
import { buildCommandLine, effectiveTool, resolveLaunchMode, placeFolder, quoteArg, shellDialect } from './launchCommand'

/** Launch a detached external process (its own window) — IDEs, GUI terminals. */
async function spawnDetached(file: string, args: string[], cwd?: string, env?: Record<string, string>, windowsVerbatimArguments = false): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(file, args, { cwd, env: { ...process.env, ...env }, detached: true, windowsVerbatimArguments, stdio: 'ignore', windowsHide: false })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
}

async function launchExternal(tool: Tool, folderPath?: string, env?: Record<string, string>): Promise<LaunchResult> {
  try {
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(tool.path)) {
      await spawnDetached('cmd.exe', ['/d', '/s', '/c', `"${buildCommandLine(tool, folderPath, 'cmd')}"`], folderPath, env, true)
    } else {
      await spawnDetached(tool.path, placeFolder(tool, folderPath), folderPath, env)
    }
    return { kind: 'external', ok: true, message: `Launched ${tool.name}` }
  } catch (err) {
    return { kind: 'external', ok: false, message: `Failed to launch ${tool.name}: ${String(err)}` }
  }
}

export async function launchTool(
  toolId: string,
  folderPath?: string,
  modeId?: string,
  env?: Record<string, string>
): Promise<LaunchResult> {
  const tools = await listTools()
  const base = tools.find((t) => t.id === toolId)
  if (!base) return { kind: 'external', ok: false, message: `Tool not found: ${toolId}` }
  if (folderPath && !existsSync(folderPath)) {
    return { kind: 'external', ok: false, message: `Folder not found: ${folderPath}` }
  }

  // Apply the selected mode (args + optional type/launch overrides) for this launch.
  if (modeId && !base.modes?.some((mode) => mode.id === modeId)) return { kind: 'external', ok: false, message: 'Tool mode no longer exists' }
  const tool = effectiveTool(base, modeId)
  const mode = resolveLaunchMode(tool)
  const cwd = folderPath && existsSync(folderPath) ? folderPath : homedir()
  const label = folderPath ? `${tool.name} · ${basename(folderPath)}` : tool.name

  if (mode === 'external') return launchExternal(tool, folderPath, env)

  try {
    if (mode === 'shell') {
      const session = ptyManager.create({
        cwd,
        shell: tool.path,
        shellArgs: tool.args,
        title: label,
        toolId: tool.id,
        env
      })
      return { kind: 'terminal', ok: true, message: `Opened ${tool.name}`, session }
    }
    // mode === 'command': run the default shell, then type the tool's command.
    const initialCommand = buildCommandLine(tool, folderPath, shellDialect(defaultShell()))
    const session = ptyManager.create({
      cwd,
      shell: defaultShell(),
      title: label,
      initialCommand,
      toolId: tool.id,
      env
    })
    return { kind: 'terminal', ok: true, message: `Running ${tool.name}`, session }
  } catch (err) {
    return { kind: 'terminal', ok: false, message: String(err instanceof Error ? err.message : err) }
  }
}

/** Open an external OS terminal window at cwd running the given command (best-effort per platform). */
export async function launchExternalCommand(command: string, cwd?: string): Promise<ActionResult> {
  const dir = cwd && existsSync(cwd) ? cwd : homedir()
  try {
    if (process.platform === 'win32') {
      await spawnDetached('cmd.exe', ['/c', 'start', "Mayo's IdeTerm", 'cmd', '/k', command], dir)
    } else if (process.platform === 'darwin') {
      const script = `tell application "Terminal" to do script ${JSON.stringify(`cd -- ${quoteArg(dir)} && ${command}`)}`
      // osascript reports syntax/permission errors asynchronously through exit status.
      await new Promise<void>((resolve, reject) => {
        const child = spawn('osascript', ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] })
        let stderr = ''
        child.stderr.on('data', (data) => { stderr += String(data) })
        child.once('error', reject)
        child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr || 'Terminal launch failed')))
      })
    } else {
      const candidates: [string, string[]][] = [
        ['x-terminal-emulator', ['-e', 'bash', '-lc', `${command}; exec bash`]],
        ['gnome-terminal', [`--working-directory=${dir}`, '--', 'bash', '-lc', `${command}; exec bash`]],
        ['konsole', ['--workdir', dir, '-e', 'bash', '-lc', `${command}; exec bash`]],
        ['xterm', ['-e', 'bash', '-lc', `${command}; exec bash`]]
      ]
      let launched = false
      for (const [bin, args] of candidates) {
        try { await spawnDetached(bin, args, dir); launched = true; break }
        catch { /* Try the next installed emulator. */ }
      }
      if (!launched) return { ok: false, message: 'No supported terminal emulator found' }
    }
    return { ok: true, message: 'Launched in external terminal' }
  } catch (err) {
    return { ok: false, message: `Failed to launch external terminal: ${String(err)}` }
  }
}

/** Open an embedded terminal at cwd and run an arbitrary command string. */
export function launchCommand(command: string, cwd?: string, title?: string, env?: Record<string, string>): LaunchResult {
  const dir = cwd && existsSync(cwd) ? cwd : homedir()
  try {
    const session = ptyManager.create({
      cwd: dir,
      shell: defaultShell(),
      title: title || command.slice(0, 24),
      initialCommand: command,
      env
    })
    return { kind: 'terminal', ok: true, message: 'Command started', session }
  } catch (err) {
    return { kind: 'terminal', ok: false, message: String(err instanceof Error ? err.message : err) }
  }
}
