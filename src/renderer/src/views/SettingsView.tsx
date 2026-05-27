import { useEffect, useState } from 'react'
import type { UpdateCheckResult } from '@shared/types'
import { useAppState } from '../state/AppState'

export function SettingsView(): JSX.Element {
  const { settings, updateSettings, tools } = useAppState()
  const shells = tools.filter((t) => t.launchMode === 'shell')
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null)

  useEffect(() => {
    void window.api.app.version().then(setVersion)
  }, [])

  const check = async (): Promise<void> => {
    setChecking(true)
    try {
      setUpdate(await window.api.updates.check())
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="view-inner">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Preferences are saved to your user profile and persist across restarts.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <div style={{ flex: 1 }}>
            <strong>Updates</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              You&apos;re running <span className="mono">v{version || '…'}</span>.
            </div>
          </div>
          <button className="btn" disabled={checking} onClick={() => void check()}>
            {checking ? 'Checking…' : '↻ Check for updates'}
          </button>
        </div>

        {update && (
          <div style={{ marginTop: 12 }}>
            {update.hasUpdate ? (
              <div className="warn-banner" style={{ marginBottom: 0 }}>
                🎉 Version <b>v{update.latestVersion}</b> is available (you have v{update.currentVersion}).
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn primary"
                    onClick={() => update.url && void window.api.app.openExternal(update.url)}
                  >
                    ⬇ Download
                  </button>
                </div>
              </div>
            ) : update.error ? (
              <div className="muted" style={{ fontSize: 12 }}>
                {update.error}{' '}
                {update.url && (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      if (update.url) void window.api.app.openExternal(update.url)
                    }}
                    style={{ color: 'var(--accent)' }}
                  >
                    View releases
                  </a>
                )}
              </div>
            ) : (
              <div className="badge green">✓ You&apos;re on the latest version</div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="field">
          <label>Default shell for new terminals</label>
          <input
            type="text"
            value={settings.defaultShell}
            onChange={(e) => void updateSettings({ defaultShell: e.target.value })}
            placeholder="Leave blank to use the OS default"
            list="shell-suggestions"
          />
          <datalist id="shell-suggestions">
            {shells.map((s) => (
              <option key={s.id} value={s.path} />
            ))}
          </datalist>
          <span className="faint" style={{ fontSize: 11 }}>
            Detected shells: {shells.map((s) => s.name).join(', ') || 'none'}
          </span>
        </div>

        <div className="field">
          <label>Terminal font size: {settings.terminalFontSize}px</label>
          <input
            type="range"
            min={10}
            max={22}
            value={settings.terminalFontSize}
            onChange={(e) => void updateSettings({ terminalFontSize: Number(e.target.value) })}
            style={{ width: 240 }}
          />
        </div>
      </div>

      <div className="card">
        <div className="row">
          <div style={{ flex: 1 }}>
            <strong>About</strong>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Mayo&apos;s IdeTerm — one control center for your IDEs, terminals, repos, and coding agents.
            </div>
          </div>
          <span className="kbd">Ctrl + `</span>
          <span className="muted" style={{ fontSize: 12 }}>
            toggle terminal dock
          </span>
        </div>
      </div>
    </div>
  )
}
