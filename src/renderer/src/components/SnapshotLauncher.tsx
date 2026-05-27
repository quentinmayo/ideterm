import { useSession } from '../state/Session'

function timeAgo(ms: number | null): string {
  if (!ms) return ''
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function SnapshotLauncher(): JSX.Element {
  const session = useSession()
  const st = session.sessionState

  return (
    <div className="app" style={{ flexDirection: 'column' }}>
      <div className="view" style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 640, maxWidth: '92%', padding: '48px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 46 }}>🍯</div>
            <h1 style={{ margin: '8px 0 2px', fontSize: 24 }}>Mayo&apos;s IdeTerm</h1>
            <div className="muted">Open a workspace to get started.</div>
          </div>

          {st?.wasAbruptShutdown && st.lastOpened && (
            <div className="warn-banner">
              ⚠️ IdeTerm didn&apos;t close cleanly last time.
              <button
                className="btn primary sm"
                style={{ marginLeft: 10 }}
                onClick={() => void session.openPath(st.lastOpened as string)}
              >
                Restore previous session
              </button>
            </div>
          )}

          <div className="row" style={{ gap: 10, marginBottom: 18 }}>
            <button className="btn primary" style={{ flex: 1 }} onClick={() => void session.newTemporary()}>
              ⚡ New temporary session
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={() => void session.newOnDisk()}>
              💾 New session on disk…
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={() => void session.openDialog()}>
              📂 Open existing…
            </button>
          </div>

          <div className="git-section-title">
            <span>Recent sessions</span>
            {st?.lastOpened && (
              <button className="btn sm ghost" onClick={() => void session.openPath(st.lastOpened as string)}>
                Open most recent
              </button>
            )}
          </div>
          <div className="card" style={{ padding: 6 }}>
            {!st || st.recent.length === 0 ? (
              <div className="muted" style={{ padding: 10, fontSize: 12 }}>
                No recent sessions yet. Create one above.
              </div>
            ) : (
              st.recent.map((r) => (
                <div
                  key={r.path}
                  className="project-list-item"
                  style={{ opacity: r.exists ? 1 : 0.5 }}
                  onClick={() => r.exists && void session.openPath(r.path)}
                  title={r.path}
                >
                  <span style={{ fontSize: 16 }}>{r.exists ? '🗂' : '⚠️'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.name}
                    </div>
                    <div className="mono faint" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.exists ? r.path : `${r.path} (missing)`}
                    </div>
                  </div>
                  <span className="faint" style={{ fontSize: 11 }}>{timeAgo(r.updatedAt)}</span>
                </div>
              ))
            )}
          </div>

          <label className="row" style={{ gap: 8, marginTop: 16, cursor: 'pointer', justifyContent: 'center' }}>
            <input
              type="checkbox"
              checked={st?.restoreMode === 'last'}
              onChange={(e) => void session.setRestoreMode(e.target.checked ? 'last' : 'ask')}
              style={{ width: 'auto' }}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Always open the most recent session on startup
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}
