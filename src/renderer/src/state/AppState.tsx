import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { AppSettings, Project, SavedCommand, Tool } from '@shared/types'
import { useToast } from '../components/Toast'

interface AppStateValue {
  ready: boolean
  projects: Project[]
  tools: Tool[]
  savedCommands: SavedCommand[]
  settings: AppSettings
  reloadTools: () => Promise<void>
  saveProject: (p: Project) => Promise<void>
  removeProject: (id: string) => Promise<void>
  saveTool: (t: Tool) => Promise<void>
  removeTool: (id: string) => Promise<void>
  saveCommand: (c: SavedCommand) => Promise<void>
  removeCommand: (id: string) => Promise<void>
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}

const fallbackSettings: AppSettings = {
  theme: 'dark',
  defaultShell: '',
  terminalFontSize: 13,
  terminalDockVisible: true
}

export function AppStateProvider({ children }: { children: ReactNode }): JSX.Element {
  const toast = useToast()
  const [ready, setReady] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([])
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings)

  const reloadTools = useCallback(async () => {
    setTools(await window.api.tools.list())
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const state = await window.api.store.getState()
        setProjects(state.projects)
        setSavedCommands(state.savedCommands)
        setSettings(state.settings)
        setTools(await window.api.tools.list())
      } catch (err) {
        toast(`Failed to load: ${String(err)}`, 'error')
      } finally {
        setReady(true)
      }
    })()
  }, [toast])

  const saveProject = useCallback(async (p: Project) => {
    setProjects(await window.api.projects.save(p))
  }, [])
  const removeProject = useCallback(async (id: string) => {
    setProjects(await window.api.projects.remove(id))
  }, [])

  const saveTool = useCallback(
    async (t: Tool) => {
      await window.api.tools.save(t)
      await reloadTools()
    },
    [reloadTools]
  )
  const removeTool = useCallback(
    async (id: string) => {
      await window.api.tools.remove(id)
      await reloadTools()
    },
    [reloadTools]
  )

  const saveCommand = useCallback(async (c: SavedCommand) => {
    setSavedCommands(await window.api.commands.save(c))
  }, [])
  const removeCommand = useCallback(async (id: string) => {
    setSavedCommands(await window.api.commands.remove(id))
  }, [])

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    setSettings(await window.api.store.setSettings(partial))
  }, [])

  const value = useMemo<AppStateValue>(
    () => ({
      ready,
      projects,
      tools,
      savedCommands,
      settings,
      reloadTools,
      saveProject,
      removeProject,
      saveTool,
      removeTool,
      saveCommand,
      removeCommand,
      updateSettings
    }),
    [
      ready,
      projects,
      tools,
      savedCommands,
      settings,
      reloadTools,
      saveProject,
      removeProject,
      saveTool,
      removeTool,
      saveCommand,
      removeCommand,
      updateSettings
    ]
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
