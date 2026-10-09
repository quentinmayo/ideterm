import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import type { WebContents } from 'electron'
import type { CreateTerminalOptions, TerminalSession } from '@shared/types'
import { defaultShell } from './tools'

const require = createRequire(import.meta.url)

// node-pty is a native module. Load it defensively so a missing platform
// binary degrades to a clear message instead of crashing the whole app.
type IPty = {
  pid: number
  cols: number
  rows: number
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}
type NodePty = { spawn(file: string, args: string[] | string, opts: Record<string, unknown>): IPty }

let nodePty: NodePty | null = null
let ptyLoadError: string | null = null
try {
  nodePty = require('@lydell/node-pty') as NodePty
} catch (err) {
  ptyLoadError = err instanceof Error ? err.message : String(err)
}

export function isPtyAvailable(): boolean {
  return nodePty !== null
}
export function ptyUnavailableReason(): string | null {
  return ptyLoadError
}

interface Entry {
  session: TerminalSession
  pty: IPty
  options: CreateTerminalOptions
}

class PtyManager {
  private sessions = new Map<string, Entry>()
  private sender: WebContents | null = null

  /** The renderer webContents that receives pty data/exit events. */
  setSender(wc: WebContents): void {
    this.sender = wc
  }

  private emit(channel: string, payload: unknown): void {
    if (this.sender && !this.sender.isDestroyed()) this.sender.send(channel, payload)
  }

  list(): TerminalSession[] {
    return [...this.sessions.values()].map((e) => e.session)
  }

  create(opts: CreateTerminalOptions): TerminalSession {
    if (!nodePty) {
      throw new Error(`Embedded terminals are unavailable: ${ptyLoadError ?? 'node-pty failed to load'}`)
    }
    const id = randomUUID()
    const shell = opts.shell || defaultShell()
    const title = opts.title || basename(shell) || 'terminal'
    const cwd = opts.cwd || homedir()
    const pty = nodePty.spawn(shell, opts.shellArgs ?? [], {
      name: 'xterm-color',
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      cwd,
      env: { ...process.env, ...opts.env }
    })
    const session: TerminalSession = {
      id,
      title,
      cwd,
      shell,
      toolId: opts.toolId,
      pid: pty.pid,
      alive: true,
      createdAt: Date.now()
    }
    const entry: Entry = { session, pty, options: opts }
    this.sessions.set(id, entry)
    this.wire(entry)
    this.startCommand(entry)
    return session
  }

  private startCommand(entry: Entry): void {
    const pty = entry.pty
    if (entry.options.initialCommand) setTimeout(() => {
      if (this.sessions.get(entry.session.id)?.pty === pty && entry.session.alive) {
        pty.write(`${entry.options.initialCommand}\r`)
      }
    }, 400)
  }

  private wire(entry: Entry): void {
    const { id } = entry.session
    const pty = entry.pty
    entry.pty.onData((data) => { if (this.sessions.get(id)?.pty === pty) this.emit('pty:data', { id, data }) })
    entry.pty.onExit(({ exitCode }) => {
      const e = this.sessions.get(id)
      if (!e || e.pty !== pty) return
      e.session.alive = false
      this.emit('pty:exit', { id, exitCode })
    })
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const e = this.sessions.get(id)
    if (e && cols > 0 && rows > 0) e.pty.resize(cols, rows)
  }

  kill(id: string): void {
    const e = this.sessions.get(id)
    if (!e) return
    try {
      e.pty.kill()
    } catch {
      /* already gone */
    }
    this.sessions.delete(id)
  }

  /** Kill and respawn a session under the same id (same cwd/shell). */
  restart(id: string): TerminalSession | null {
    if (!nodePty) return null
    const e = this.sessions.get(id)
    if (!e) return null
    try {
      e.pty.kill()
    } catch {
      /* ignore */
    }
    const pty = nodePty.spawn(e.session.shell, e.options.shellArgs ?? [], {
      name: 'xterm-color',
      cols: e.pty.cols || 80,
      rows: e.pty.rows || 24,
      cwd: e.session.cwd,
      env: { ...process.env, ...e.options.env }
    })
    e.pty = pty
    e.session.pid = pty.pid
    e.session.alive = true
    this.wire(e)
    this.emit('pty:restart', { id })
    this.startCommand(e)
    return e.session
  }

  rename(id: string, title: string): TerminalSession | null {
    const e = this.sessions.get(id)
    if (!e) return null
    e.session.title = title
    return e.session
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }
}

export const ptyManager = new PtyManager()
