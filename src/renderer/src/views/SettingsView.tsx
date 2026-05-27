import { useAppState } from '../state/AppState'

export function SettingsView(): JSX.Element {
  const { settings, updateSettings, tools } = useAppState()
  const shells = tools.filter((t) => t.launchMode === 'shell')

  return (
    <div className="view-inner">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Preferences are saved to your user profile and persist across restarts.</div>
        </div>
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
