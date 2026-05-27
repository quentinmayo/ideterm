import { useTerminals, type FloatingTerm } from '../state/Terminals'
import { TerminalView } from './TerminalView'

export function FloatingLayer(): JSX.Element | null {
  const t = useTerminals()
  if (t.floating.length === 0) return null
  return (
    <div className="floating-layer">
      {t.floating.map((f) => (
        <FloatingPanel key={f.id} f={f} />
      ))}
    </div>
  )
}

function FloatingPanel({ f }: { f: FloatingTerm }): JSX.Element {
  const t = useTerminals()
  const session = t.sessions[f.sessionId]

  const startDrag = (e: React.MouseEvent): void => {
    e.preventDefault()
    const offX = e.clientX - f.x
    const offY = e.clientY - f.y
    const onMove = (ev: MouseEvent): void => {
      t.setFloatingRect(f.id, {
        x: Math.max(0, ev.clientX - offX),
        y: Math.max(0, ev.clientY - offY)
      })
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = f.w
    const startH = f.h
    const onMove = (ev: MouseEvent): void => {
      t.setFloatingRect(f.id, {
        w: Math.max(280, startW + (ev.clientX - startX)),
        h: Math.max(180, startH + (ev.clientY - startY))
      })
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const stop = (e: React.MouseEvent): void => e.stopPropagation()

  return (
    <div className="floating-panel" style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
      <div className="term-pane-head floating-head" onMouseDown={startDrag}>
        <span className="term-pane-title">
          {session?.title ?? 'terminal'} · floating{session && !session.alive ? ' · exited' : ''}
        </span>
        <button className="icon-btn" title="Dock back" onMouseDown={stop} onClick={() => t.dockFloating(f.sessionId)}>
          ▭
        </button>
        <button
          className="icon-btn"
          title="Restart"
          onMouseDown={stop}
          onClick={() => void t.restartSession(f.sessionId)}
        >
          ⟳
        </button>
        <button className="icon-btn" title="Close" onMouseDown={stop} onClick={() => t.closeSession(f.sessionId)}>
          ✕
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TerminalView sessionId={f.sessionId} />
      </div>
      <div className="floating-resize" onMouseDown={startResize} />
    </div>
  )
}
