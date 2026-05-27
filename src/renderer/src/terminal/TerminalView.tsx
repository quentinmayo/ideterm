import { useEffect, useRef } from 'react'
import { getTerminal } from './termCache'
import { useAppState } from '../state/AppState'
import { useTerminals } from '../state/Terminals'

/** Hosts the persistent xterm element for a session and keeps it fitted to its container. */
export function TerminalView({ sessionId }: { sessionId: string }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const { settings } = useAppState()
  const { setActiveSession } = useTerminals()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const c = getTerminal(sessionId, settings.terminalFontSize)
    host.appendChild(c.element)
    if (!c.opened) {
      c.term.open(c.element)
      c.opened = true
    }
    const doFit = (): void => {
      try {
        c.fit.fit()
        window.api.pty.resize(sessionId, c.term.cols, c.term.rows)
      } catch {
        /* element not measurable yet */
      }
    }
    const ro = new ResizeObserver(doFit)
    ro.observe(host)
    const raf = requestAnimationFrame(doFit)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
      if (host.contains(c.element)) host.removeChild(c.element)
    }
  }, [sessionId, settings.terminalFontSize])

  return <div className="term-host" ref={hostRef} onMouseDown={() => setActiveSession(sessionId)} />
}
