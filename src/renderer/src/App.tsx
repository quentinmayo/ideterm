import { useEffect } from 'react'
import { NavRail } from './components/NavRail'
import { SnapshotLauncher } from './components/SnapshotLauncher'
import { useAppState } from './state/AppState'
import { useSession } from './state/Session'
import { useTerminals } from './state/Terminals'
import { TerminalDock } from './terminal/TerminalDock'
import { FloatingLayer } from './terminal/FloatingPanel'
import { ProjectsView } from './views/ProjectsView'
import { ToolsView } from './views/ToolsView'
import { SessionsView } from './views/SessionsView'
import { FilesView } from './views/FilesView'
import { SettingsView } from './views/SettingsView'

export interface FilesTarget {
  path: string
  name: string
}

export default function App(): JSX.Element {
  const { ready } = useAppState()
  const session = useSession()
  const terminals = useTerminals()

  // Ctrl/Cmd+` toggles the terminal dock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        terminals.setDockVisible(!terminals.dockVisible)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [terminals])

  if (!ready) {
    return (
      <div className="app">
        <div className="empty" style={{ width: '100%' }}>
          <div className="big">🍯</div>
          <div>Loading Mayo&apos;s IdeTerm…</div>
        </div>
      </div>
    )
  }

  if (!session.active) return <SnapshotLauncher />

  const view = session.activeView
  const openFiles = (target: FilesTarget): void => {
    session.setFilesTarget(target)
    session.setActiveView('files')
  }

  return (
    <div className="app">
      <NavRail view={view} setView={session.setActiveView} />
      <div className="main">
        <div className="view">
          {view === 'projects' && <ProjectsView onOpenFiles={openFiles} />}
          {view === 'tools' && <ToolsView />}
          {view === 'sessions' && <SessionsView />}
          {view === 'files' && <FilesView />}
          {view === 'settings' && <SettingsView />}
        </div>
        <TerminalDock />
      </div>
      <FloatingLayer />
    </div>
  )
}
