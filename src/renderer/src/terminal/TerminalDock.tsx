import { useTerminals } from '../state/Terminals'
import { TileLayout } from './TileLayout'

export function TerminalDock(): JSX.Element | null {
  const t = useTerminals()
  if (!t.dockVisible) return null

  const activeGroup = t.groups.find((g) => g.id === t.activeGroupId) ?? t.groups[0]

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startY = e.clientY
    const startH = t.dockHeight
    const onMove = (ev: MouseEvent): void => {
      const delta = startY - ev.clientY
      const next = Math.min(Math.max(startH + delta, 120), window.innerHeight - 140)
      t.setDockHeight(next)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="terminal-dock" style={{ height: t.dockHeight }}>
      <div className="dock-resizer" onMouseDown={startResize} />
      <div className="dock-bar">
        {t.groups.map((g) => (
          <button
            key={g.id}
            className={`btn sm ${g.id === t.activeGroupId ? 'primary' : 'ghost'}`}
            onClick={() => t.setActiveGroup(g.id)}
            title={g.name}
          >
            {g.name.length > 22 ? `${g.name.slice(0, 22)}…` : g.name}
          </button>
        ))}
        <button className="icon-btn" title="New terminal" onClick={() => void t.newTerminal()}>
          ＋
        </button>
        <div className="spacer" />
        <button
          className="icon-btn"
          title="Split right"
          disabled={!t.activeSessionId}
          onClick={() => void t.splitActive('row')}
        >
          ▥
        </button>
        <button
          className="icon-btn"
          title="Split down"
          disabled={!t.activeSessionId}
          onClick={() => void t.splitActive('col')}
        >
          ▤
        </button>
        <button className="icon-btn" title="Hide panel (Ctrl+`)" onClick={() => t.setDockVisible(false)}>
          ⌄
        </button>
      </div>
      <div className="tile-area">
        {activeGroup ? (
          <TileLayout node={activeGroup.tree} />
        ) : (
          <div className="empty" style={{ height: '100%' }}>
            <div>No terminals open</div>
            <button className="btn primary" onClick={() => void t.newTerminal()}>
              ＋ New terminal
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
