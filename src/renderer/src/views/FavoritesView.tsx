import { useState } from 'react'
import type { FavCommand } from '@shared/types'
import { useAppState } from '../state/AppState'
import { useLauncher } from '../util/launch'
import { FavCommandWizard } from '../components/FavCommandWizard'

function baseName(p?: string): string {
  return p ? (p.split(/[\\/]/).filter(Boolean).pop() ?? p) : ''
}
function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function FavoritesView(): JSX.Element {
  const { favCommands, recentLaunches, tools, saveFav, removeFav, clearRecents } = useAppState()
  const { runFav, runRecent } = useLauncher()
  const [editing, setEditing] = useState<FavCommand | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <div className="view-inner">
      <div className="page-head">
        <div>
          <h1>Favorites</h1>
          <div className="sub">One-click commands — start a Claude instance, a dev server, a terminal anywhere.</div>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          ＋ New favorite
        </button>
      </div>

      {favCommands.length === 0 ? (
        <div className="card muted">
          No favorites yet. Click “New favorite” — the wizard can start from a tool you already have.
        </div>
      ) : (
        <div className="grid">
          {favCommands.map((f) => (
            <div key={f.id} className="card fav-card" onClick={() => void runFav(f)} title="Click to run">
              <div className="row">
                <span style={{ fontSize: 20 }}>{f.icon ?? '⭐'}</span>
                <strong style={{ flex: 1 }}>{f.label}</strong>
                <span className="badge">{f.target === 'external' ? 'external' : 'embedded'}</span>
                <button
                  className="icon-btn"
                  title="Edit"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditing(f)
                  }}
                >
                  ✏️
                </button>
                <button
                  className="icon-btn"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeFav(f.id)
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="mono faint" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                {f.command}
              </div>
              <div className="faint" style={{ fontSize: 11 }}>
                📂 {baseName(f.cwd)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="page-head" style={{ marginTop: 26 }}>
        <div>
          <h1 style={{ fontSize: 15 }}>Recently triggered</h1>
          <div className="sub">Tools and commands you ran recently — click to run again.</div>
        </div>
        {recentLaunches.length > 0 && (
          <button className="btn" onClick={() => void clearRecents()}>
            Clear
          </button>
        )}
      </div>
      {recentLaunches.length === 0 ? (
        <div className="card muted">Nothing yet. Launch a tool from a folder and it’ll show up here.</div>
      ) : (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {recentLaunches.map((r) => (
            <button
              key={r.id}
              className="btn"
              title={`${r.command ?? ''} ${r.cwd ? `· ${r.cwd}` : ''} · ${timeAgo(r.at)}`}
              onClick={() => void runRecent(r)}
            >
              <span>{r.icon ?? (r.kind === 'fav' ? '⭐' : '🧩')}</span>
              {r.label}
              {r.cwd && <span className="faint"> · {baseName(r.cwd)}</span>}
            </button>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <FavCommandWizard
          fav={editing}
          tools={tools}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={saveFav}
        />
      )}
    </div>
  )
}
