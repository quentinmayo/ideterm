import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction
} from 'react'
import type { Project, SessionSnapshot, SessionState, SnapshotView } from '@shared/types'
import { useToast } from '../components/Toast'
import { useTerminals } from './Terminals'

interface FilesTarget {
  path: string
  name: string
}

export interface OpenDoc { text: string; dirty: boolean }

interface SessionValue {
  workspaceId: string
  docs: Record<string, OpenDoc>
  setDocs: Dispatch<SetStateAction<Record<string, OpenDoc>>>
  loadDoc: (path: string) => Promise<void>
  active: boolean
  name: string
  path: string | null
  isTemporary: boolean
  dirty: boolean
  sessionState: SessionState | null
  // workspace data (lives in the snapshot)
  projects: Project[]
  activeView: SnapshotView
  selectedProjectId: string | null
  filesTarget: FilesTarget | null
  openFiles: FilesTarget[]
  // mutations
  saveProject: (p: Project) => void
  removeProject: (id: string) => void
  setActiveView: (v: SnapshotView) => void
  setSelectedProjectId: (id: string | null) => void
  setFilesTarget: (t: FilesTarget | null) => void
  addOpenFile: (file: FilesTarget) => void
  removeOpenFile: (path: string) => void
  // lifecycle
  newTemporary: (seedProjects?: Project[]) => Promise<void>
  newOnDisk: () => Promise<void>
  openPath: (path: string) => Promise<void>
  openDialog: () => Promise<void>
  save: () => Promise<void>
  saveAs: () => Promise<void>
  setRestoreMode: (mode: 'ask' | 'last') => Promise<void>
  refreshState: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function blankSnapshot(name: string): SessionSnapshot {
  const now = Date.now()
  return {
    version: 1,
    name,
    createdAt: now,
    updatedAt: now,
    projects: [],
    ui: {
      activeView: 'projects',
      selectedProjectId: null,
      filesTarget: null,
      openFiles: [],
      terminals: [],
      floating: [],
      dockVisible: true,
      dockHeight: 300
    }
  }
}

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const toast = useToast()
  const terminals = useTerminals()

  const [active, setActive] = useState(false)
  const [workspaceId, setWorkspaceId] = useState('')
  const [name, setName] = useState('')
  const [path, setPath] = useState<string | null>(null)
  const [isTemporary, setIsTemporary] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [sessionState, setSessionState] = useState<SessionState | null>(null)
  const createdAtRef = useRef<number>(Date.now())

  const [projects, setProjects] = useState<Project[]>([])
  const [activeView, setActiveViewState] = useState<SnapshotView>('projects')
  const [selectedProjectId, setSelectedProjectIdState] = useState<string | null>(null)
  const [filesTarget, setFilesTargetState] = useState<FilesTarget | null>(null)
  const [openFiles, setOpenFiles] = useState<FilesTarget[]>([])
  const [docs, updateDocs] = useState<Record<string, OpenDoc>>({})
  const docsRef = useRef(docs)
  const epoch = useRef(0)
  const setDocs = useCallback<Dispatch<SetStateAction<Record<string, OpenDoc>>>>((update) => {
    docsRef.current = typeof update === 'function' ? update(docsRef.current) : update
    updateDocs(docsRef.current)
  }, [])
  const loadDoc = useCallback(async (filePath: string) => {
    const generation = epoch.current
    try {
      const text = await window.api.fs.read(filePath)
      if (generation === epoch.current && !docsRef.current[filePath]) {
        setDocs((d) => ({ ...d, [filePath]: { text, dirty: false } }))
      }
    } catch (error) { toast(String(error), 'error') }
  }, [setDocs, toast])

  const markDirty = useCallback(() => setDirty(true), [])

  // Keep the main process's file-sandbox roots in sync with the active projects.
  useEffect(() => {
    if (active) void window.api.session.setRoots(projects)
  }, [projects, active])

  const refreshState = useCallback(async () => {
    setSessionState(await window.api.session.state())
  }, [])

  const collect = useCallback((): SessionSnapshot => {
    const term = terminals.serialize()
    return {
      version: 1,
      name,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
      projects,
      ui: {
        activeView,
        selectedProjectId,
        filesTarget,
        openFiles,
        editorDrafts: Object.fromEntries(Object.entries(docsRef.current).filter(([, doc]) => doc.dirty).map(([file, doc]) => [file, doc.text])),
        terminals: term.groups,
        floating: term.floating,
        dockVisible: term.dockVisible,
        dockHeight: term.dockHeight
      }
    }
  }, [terminals, name, projects, activeView, selectedProjectId, filesTarget, openFiles])

  const applySnapshot = useCallback(
    async (snap: SessionSnapshot, snapPath: string, temp: boolean) => {
      epoch.current++
      setWorkspaceId(crypto.randomUUID())
      setDocs(Object.fromEntries(Object.entries(snap.ui.editorDrafts ?? {}).map(([file, text]) => [file, { text, dirty: true }])))
      createdAtRef.current = snap.createdAt
      setName(snap.name)
      setProjects(snap.projects ?? [])
      setActiveViewState(snap.ui.activeView)
      setSelectedProjectIdState(snap.ui.selectedProjectId)
      setFilesTargetState(snap.ui.filesTarget)
      setOpenFiles(snap.ui.openFiles ?? [])
      setPath(snapPath)
      setIsTemporary(temp)
      setActive(true)
      setDirty(false)
      await window.api.session.setRoots(snap.projects ?? [])
      terminals.reset()
      await terminals.restore({
        groups: snap.ui.terminals ?? [],
        floating: snap.ui.floating ?? [],
        dockVisible: snap.ui.dockVisible,
        dockHeight: snap.ui.dockHeight
      })
    },
    [terminals, setDocs]
  )

  const newTemporary = useCallback(
    async (seedProjects?: Project[]) => {
      if (active && path) {
        const destination = isTemporary ? await window.api.session.saveDialog('workspace.ideterm-session.json') : path
        if (!destination) return
        await window.api.session.write(collect(), destination)
      }
      const tempPath = await window.api.session.tempPath()
      const snap = blankSnapshot('Temporary session')
      if (seedProjects) snap.projects = seedProjects
      await applySnapshot(snap, tempPath, true)
      await window.api.session.write(snap, tempPath)
      void refreshState()
    },
    [active, path, isTemporary, collect, applySnapshot, refreshState]
  )

  const newOnDisk = useCallback(async () => {
    const chosen = await window.api.session.saveDialog('workspace.ideterm-session.json')
    if (!chosen) return
    if (active && path) await window.api.session.write(collect(), path)
    const snap = blankSnapshot(baseName(chosen))
    await applySnapshot(snap, chosen, false)
    await window.api.session.write(snap, chosen)
    void refreshState()
  }, [active, path, collect, applySnapshot, refreshState])

  const openPath = useCallback(
    async (target: string) => {
      if (active && path) await window.api.session.write(collect(), path)
      const snap = await window.api.session.read(target)
      const temp = sessionState?.tempPath === target
      await applySnapshot(snap, target, temp)
      void refreshState()
    },
    [active, path, collect, applySnapshot, refreshState, sessionState]
  )

  const openDialog = useCallback(async () => {
    const chosen = await window.api.session.openDialog()
    if (chosen) await openPath(chosen)
  }, [openPath])

  const save = useCallback(async () => {
    if (!path) return
    await window.api.session.write(collect(), path)
    setDirty(false)
    toast(`Saved session "${name || 'session'}"`, 'success')
    void refreshState()
  }, [path, collect, name, refreshState, toast])

  const saveAs = useCallback(async () => {
    const chosen = await window.api.session.saveDialog(`${name || 'workspace'}.ideterm-session.json`)
    if (!chosen) return
    const newName = baseName(chosen)
    await window.api.session.write({ ...collect(), name: newName }, chosen)
    setPath(chosen)
    setIsTemporary(false)
    setName(newName)
    setDirty(false)
    toast(`Saved session as "${newName}"`, 'success')
    void refreshState()
  }, [name, collect, refreshState, toast])

  const setRestoreMode = useCallback(
    async (mode: 'ask' | 'last') => {
      await window.api.session.setRestoreMode(mode)
      await refreshState()
    },
    [refreshState]
  )

  // Workspace mutations (in-memory; persisted by autosave / save).
  const saveProject = useCallback(
    (p: Project) => {
      setProjects((prev) => {
        const i = prev.findIndex((x) => x.id === p.id)
        return i >= 0 ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p]
      })
      markDirty()
    },
    [markDirty]
  )
  const removeProject = useCallback(
    (id: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== id))
      markDirty()
    },
    [markDirty]
  )
  const setActiveView = useCallback((v: SnapshotView) => {
    setActiveViewState(v)
  }, [])
  const setSelectedProjectId = useCallback(
    (id: string | null) => {
      setSelectedProjectIdState(id)
      markDirty()
    },
    [markDirty]
  )
  const setFilesTarget = useCallback(
    (t: FilesTarget | null) => {
      setFilesTargetState(t)
      markDirty()
    },
    [markDirty]
  )
  const addOpenFile = useCallback(
    (file: FilesTarget) => {
      setOpenFiles((prev) => (prev.some((f) => f.path === file.path) ? prev : [...prev, file]))
      markDirty()
    },
    [markDirty]
  )
  const removeOpenFile = useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => prev.filter((f) => f.path !== filePath))
      markDirty()
    },
    [markDirty]
  )

  // Refs so the once-mounted IPC listeners always see the latest actions/state.
  const latest = useRef({ active, path, collect, newTemporary, newOnDisk, openDialog, openPath, save, saveAs })
  latest.current = { active, path, collect, newTemporary, newOnDisk, openDialog, openPath, save, saveAs }

  const started = useRef(false)
  // Startup: load snapshot state; auto-open most recent if configured.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const st = await window.api.session.state()
      setSessionState(st)
      if (st.restoreMode === 'last' && st.lastOpened) {
        try {
          await latest.current.openPath(st.lastOpened)
        } catch {
          /* fall back to the launcher */
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist recovery drafts shortly after edits; do not overwrite source files.
  useEffect(() => {
    const timer = setTimeout(() => {
      const a = latest.current
      if (a.active && a.path) void window.api.session.write(a.collect(), a.path).catch((error) => toast(`Recovery save failed: ${String(error)}`, 'error'))
    }, 1000)
    return () => clearTimeout(timer)
  }, [docs, projects, toast])

  // Autosave every minute + respond to native menu and close-flush.
  useEffect(() => {
    const timer = setInterval(() => {
      const a = latest.current
      if (a.active && a.path) void window.api.session.write(a.collect(), a.path).catch((error) => toast(`Autosave failed: ${String(error)}`, 'error'))
    }, 60_000)

    const offMenu = window.api.session.onMenu((action, arg) => {
      const a = latest.current
      const report = (promise: Promise<void>): void => { void promise.catch((error) => toast(String(error), 'error')) }
      if (action === 'new-temp') report(a.newTemporary())
      else if (action === 'new-disk') report(a.newOnDisk())
      else if (action === 'open') report(a.openDialog())
      else if (action === 'save') report(a.save())
      else if (action === 'save-as') report(a.saveAs())
      else if (action === 'open-path' && arg) report(a.openPath(arg))
    })

    const offFlush = window.api.session.onFlush(() => {
      const a = latest.current
      void (async () => {
        try {
          if (a.active && a.path) await window.api.session.write(a.collect(), a.path)
          window.api.session.flushDone(true)
        } catch (error) {
          toast(`Could not save session: ${String(error)}`, 'error')
          window.api.session.flushDone(false)
        }
      })()
    })

    return () => {
      clearInterval(timer)
      offMenu()
      offFlush()
    }
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      workspaceId, docs, setDocs, loadDoc,
      active,
      name,
      path,
      isTemporary,
      dirty,
      sessionState,
      projects,
      activeView,
      selectedProjectId,
      filesTarget,
      openFiles,
      saveProject,
      removeProject,
      setActiveView,
      setSelectedProjectId,
      setFilesTarget,
      addOpenFile,
      removeOpenFile,
      newTemporary,
      newOnDisk,
      openPath,
      openDialog,
      save,
      saveAs,
      setRestoreMode,
      refreshState
    }),
    [
      workspaceId, docs, setDocs, loadDoc,
      active,
      name,
      path,
      isTemporary,
      dirty,
      sessionState,
      projects,
      activeView,
      selectedProjectId,
      filesTarget,
      openFiles,
      saveProject,
      removeProject,
      setActiveView,
      setSelectedProjectId,
      setFilesTarget,
      addOpenFile,
      removeOpenFile,
      newTemporary,
      newOnDisk,
      openPath,
      openDialog,
      save,
      saveAs,
      setRestoreMode,
      refreshState
    ]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
