import { useState } from 'react'
import { useAppState } from '../state/AppState'
import { useTerminals } from '../state/Terminals'

export function SessionsView(): JSX.Element {
  const { savedCommands, removeCommand } = useAppState()
  const terminals = useTerminals()
  const sessions = Object.values(terminals.sessions)
  const [filter, setFilter] = useState('')

  const shown = sessions.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="view-inner">
      <div className="page-head">
        <div>
          <h1>Sessions</h1>
          <div className="sub">Every embedded terminal, across all dock tabs and floating panels.</div>
        </div>
        <button className="btn primary" onClick={() => void terminals.newTerminal()}>
          ＋ New terminal
        </button>
      </div>

      {sessions.length > 3 && (
        <input
          type="text"
          placeholder="Filter sessions…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ marginBottom: 12 }}
        />
      )}

      {sessions.length === 0 ? (
        <div className="empty">
          <div className="big">▦</div>
          <div>No terminal sessions. Open one from a folder or click “New terminal”.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((s) => (
            <div key={s.id} className="card row">
              <span className={`badge ${s.alive ? 'green' : 'red'}`}>{s.alive ? 'live' : 'exited'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{s.title}</strong>
                <div className="path mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {s.cwd || '~'} {s.pid ? `· pid ${s.pid}` : ''}
                </div>
              </div>
              <button className="btn sm" onClick={() => terminals.focusSession(s.id)}>
                Focus
              </button>
              <button className="btn sm" onClick={() => void terminals.restartSession(s.id)}>
                Restart
              </button>
              <button className="btn sm danger" onClick={() => terminals.closeSession(s.id)}>
                Kill
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="page-head" style={{ marginTop: 28 }}>
        <div>
          <h1 style={{ fontSize: 15 }}>Saved commands</h1>
          <div className="sub">Run these in a new terminal, or from a folder’s right-click menu.</div>
        </div>
      </div>
      {savedCommands.length === 0 ? (
        <div className="card muted">No saved commands yet. Build one with the SSH builder, for example.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {savedCommands.map((c) => (
            <div key={c.id} className="card row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{c.label}</strong>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', wordBreak: 'break-all' }}>
                  {c.command}
                </div>
              </div>
              <button
                className="btn sm"
                onClick={() => void terminals.newTerminal({ initialCommand: c.command, title: c.label })}
              >
                Run
              </button>
              <button className="btn sm danger" onClick={() => void removeCommand(c.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
