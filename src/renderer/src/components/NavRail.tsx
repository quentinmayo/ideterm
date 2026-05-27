export type ViewKey = 'projects' | 'tools' | 'sessions' | 'files' | 'settings'

const ITEMS: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'projects', label: 'Projects', icon: '📁' },
  { key: 'tools', label: 'Tools', icon: '🧰' },
  { key: 'sessions', label: 'Terminals', icon: '▦' },
  { key: 'files', label: 'Files', icon: '🗂' },
  { key: 'settings', label: 'Settings', icon: '⚙' }
]

interface NavRailProps {
  view: ViewKey
  setView: (v: ViewKey) => void
}

export function NavRail({ view, setView }: NavRailProps): JSX.Element {
  return (
    <nav className="nav-rail">
      <div className="nav-logo" title="Mayo's IdeTerm">
        🍯
      </div>
      {ITEMS.map((item) => (
        <button
          key={item.key}
          className={`nav-item ${view === item.key ? 'active' : ''}`}
          onClick={() => setView(item.key)}
        >
          <span style={{ fontSize: 18 }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
      <div className="nav-spacer" />
    </nav>
  )
}
