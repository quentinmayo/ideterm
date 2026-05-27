import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

export interface CachedTerm {
  term: Terminal
  fit: FitAddon
  element: HTMLDivElement
  opened: boolean
  dispose: () => void
}

const cache = new Map<string, CachedTerm>()

const theme = {
  background: '#0a0b0e',
  foreground: '#e6e9ef',
  cursor: '#6ea8fe',
  selectionBackground: '#2a3550',
  black: '#1b1e26',
  red: '#f06d6d',
  green: '#4ec9a8',
  yellow: '#e2c08d',
  blue: '#6ea8fe',
  magenta: '#b58cff',
  cyan: '#56c8d8',
  white: '#e6e9ef'
}

/**
 * Get (or lazily create) the persistent xterm instance for a session. Keeping it
 * out of React preserves scrollback across tab switches, layout changes, and float/dock.
 */
export function getTerminal(sessionId: string, fontSize: number): CachedTerm {
  const existing = cache.get(sessionId)
  if (existing) {
    existing.term.options.fontSize = fontSize
    return existing
  }

  const element = document.createElement('div')
  element.style.width = '100%'
  element.style.height = '100%'

  const term = new Terminal({
    fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
    fontSize,
    cursorBlink: true,
    scrollback: 8000,
    allowProposedApi: true,
    theme
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(
    new WebLinksAddon((_e, uri) => {
      void window.api.fs.openExternal(uri)
    })
  )

  // Forward keystrokes to the pty.
  const dataSub = term.onData((data) => window.api.pty.write(sessionId, data))
  // Pump pty output (filtered to this session) into the terminal.
  const offData = window.api.pty.onData(({ id, data }) => {
    if (id === sessionId) term.write(data)
  })
  const offRestart = window.api.pty.onRestart(({ id }) => {
    if (id === sessionId) {
      term.reset()
      term.write('\x1b[2J\x1b[H')
    }
  })

  const cached: CachedTerm = {
    term,
    fit,
    element,
    opened: false,
    dispose: () => {
      dataSub.dispose()
      offData()
      offRestart()
      term.dispose()
      element.remove()
      cache.delete(sessionId)
    }
  }
  cache.set(sessionId, cached)
  return cached
}

export function disposeTerminal(sessionId: string): void {
  cache.get(sessionId)?.dispose()
}
