import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { AppSettings, FavCommand, RecentLaunch, SavedCommand, Tool } from '@shared/types'
import { useToast } from '../components/Toast'

interface AppStateValue {
  ready: boolean
  tools: Tool[]
  savedCommands: SavedCommand[]
  favCommands: FavCommand[]
  recentLaunches: RecentLaunch[]
  settings: AppSettings
  reloadTools: () => Promise<void>
  saveTool: (t: Tool) => Promise<void>
  removeTool: (id: string) => Promise<void>
  saveCommand: (c: SavedCommand) => Promise<void>
  removeCommand: (id: string) => Promise<void>
  saveFav: (f: FavCommand) => Promise<void>
  removeFav: (id: string) => Promise<void>
  addRecent: (entry: RecentLaunch) => Promise<void>
  clearRecents: () => Promise<void>
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
  const [tools, setTools] = useState<Tool[]>([])
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([])
  const [favCommands, setFavCommands] = useState<FavCommand[]>([])
  const [recentLaunches, setRecentLaunches] = useState<RecentLaunch[]>([])
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings)

  const reloadTools = useCallback(async () => {
    setTools(await window.api.tools.list())
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const state = await window.api.store.getState()
        setSavedCommands(state.savedCommands)
        setFavCommands(state.favCommands)
        setRecentLaunches(state.recentLaunches)
        setSettings(state.settings)
        setTools(await window.api.tools.list())
      } catch (err) {
        toast(`Failed to load: ${String(err)}`, 'error')
      } finally {
        setReady(true)
      }
    })()
  }, [toast])

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

  const saveFav = useCallback(async (f: FavCommand) => {
    setFavCommands(await window.api.favs.save(f))
  }, [])
  const removeFav = useCallback(async (id: string) => {
    setFavCommands(await window.api.favs.remove(id))
  }, [])

  const addRecent = useCallback(async (entry: RecentLaunch) => {
    setRecentLaunches(await window.api.recents.add(entry))
  }, [])
  const clearRecents = useCallback(async () => {
    setRecentLaunches(await window.api.recents.clear())
  }, [])

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    setSettings(await window.api.store.setSettings(partial))
  }, [])

  const value = useMemo<AppStateValue>(
    () => ({
      ready,
      tools,
      savedCommands,
      favCommands,
      recentLaunches,
      settings,
      reloadTools,
      saveTool,
      removeTool,
      saveCommand,
      removeCommand,
      saveFav,
      removeFav,
      addRecent,
      clearRecents,
      updateSettings
    }),
    [
      ready,
      tools,
      savedCommands,
      favCommands,
      recentLaunches,
      settings,
      reloadTools,
      saveTool,
      removeTool,
      saveCommand,
      removeCommand,
      saveFav,
      removeFav,
      addRecent,
      clearRecents,
      updateSettings
    ]
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
