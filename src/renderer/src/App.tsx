import { useEffect, useState } from 'react'
import { NavRail, type ViewKey } from './components/NavRail'
import { useAppState } from './state/AppState'
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
  const terminals = useTerminals()
  const [view, setView] = useState<ViewKey>('projects')
  const [filesTarget, setFilesTarget] = useState<FilesTarget | null>(null)

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

  const openFiles = (target: FilesTarget): void => {
    setFilesTarget(target)
    setView('files')
  }

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

  return (
    <div className="app">
      <NavRail view={view} setView={setView} />
      <div className="main">
        <div className="view">
          {view === 'projects' && <ProjectsView onOpenFiles={openFiles} />}
          {view === 'tools' && <ToolsView />}
          {view === 'sessions' && <SessionsView />}
          {view === 'files' && <FilesView target={filesTarget} onPickTarget={setFilesTarget} />}
          {view === 'settings' && <SettingsView />}
        </div>
        <TerminalDock />
      </div>
      <FloatingLayer />
    </div>
  )
}
