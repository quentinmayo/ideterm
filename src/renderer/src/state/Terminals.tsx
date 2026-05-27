import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type {
  CreateTerminalOptions,
  SerializedFloating,
  SerializedGroup,
  TerminalSession
} from '@shared/types'
import { useToast } from '../components/Toast'
import { disposeTerminal } from '../terminal/termCache'
import {
  buildTree,
  collectLeaves,
  firstSession,
  hasSession,
  newLeaf,
  removeLeaf,
  serializeTree,
  splitLeaf,
  type LeafDescriptor,
  type TileNode
} from '../terminal/tileTree'

export type { TileNode }

export interface SerializedTerminals {
  groups: SerializedGroup[]
  floating: SerializedFloating[]
  dockVisible: boolean
  dockHeight: number
}

export interface TerminalGroup {
  id: string
  name: string
  tree: TileNode
}

export interface FloatingTerm {
  id: string
  sessionId: string
  x: number
  y: number
  w: number
  h: number
}

interface TerminalsValue {
  groups: TerminalGroup[]
  floating: FloatingTerm[]
  sessions: Record<string, TerminalSession>
  activeGroupId: string | null
  activeSessionId: string | null
  dockVisible: boolean
  dockHeight: number
  newTerminal: (opts?: Partial<CreateTerminalOptions>) => Promise<void>
  adoptSession: (session: TerminalSession) => void
  splitActive: (dir: 'row' | 'col') => Promise<void>
  closeSession: (sessionId: string) => void
  restartSession: (sessionId: string) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  floatSession: (sessionId: string) => void
  dockFloating: (sessionId: string) => void
  setActiveGroup: (groupId: string) => void
  setActiveSession: (sessionId: string) => void
  focusSession: (sessionId: string) => void
  serialize: () => SerializedTerminals
  restore: (data: SerializedTerminals) => Promise<void>
  reset: () => void
  setFloatingRect: (id: string, rect: Partial<Pick<FloatingTerm, 'x' | 'y' | 'w' | 'h'>>) => void
  setDockVisible: (v: boolean) => void
  setDockHeight: (h: number) => void
}

const TerminalsContext = createContext<TerminalsValue | null>(null)

export function useTerminals(): TerminalsValue {
  const ctx = useContext(TerminalsContext)
  if (!ctx) throw new Error('useTerminals must be used within TerminalsProvider')
  return ctx
}

export function TerminalsProvider({ children }: { children: ReactNode }): JSX.Element {
  const toast = useToast()
  const [groups, setGroups] = useState<TerminalGroup[]>([])
  const [floating, setFloating] = useState<FloatingTerm[]>([])
  const [sessions, setSessions] = useState<Record<string, TerminalSession>>({})
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [dockVisible, setDockVisible] = useState(true)
  const [dockHeight, setDockHeight] = useState(300)

  // Mark a session dead when its pty exits.
  useEffect(() => {
    const offExit = window.api.pty.onExit(({ id }) => {
      setSessions((s) => (s[id] ? { ...s, [id]: { ...s[id], alive: false } } : s))
    })
    return offExit
  }, [])

  const registerSession = useCallback((session: TerminalSession) => {
    setSessions((s) => ({ ...s, [session.id]: session }))
  }, [])

  const adoptSession = useCallback(
    (session: TerminalSession) => {
      registerSession(session)
      const group: TerminalGroup = {
        id: crypto.randomUUID(),
        name: session.title,
        tree: newLeaf(session.id)
      }
      setGroups((g) => [...g, group])
      setActiveGroupId(group.id)
      setActiveSessionId(session.id)
      setDockVisible(true)
    },
    [registerSession]
  )

  const newTerminal = useCallback(
    async (opts?: Partial<CreateTerminalOptions>) => {
      try {
        const session = await window.api.pty.create({ cwd: opts?.cwd ?? '', ...opts })
        adoptSession(session)
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error')
      }
    },
    [adoptSession, toast]
  )

  const splitActive = useCallback(
    async (dir: 'row' | 'col') => {
      if (!activeGroupId || !activeSessionId) {
        await newTerminal()
        return
      }
      const base = sessions[activeSessionId]
      try {
        const session = await window.api.pty.create({ cwd: base?.cwd ?? '' })
        registerSession(session)
        setGroups((gs) =>
          gs.map((g) =>
            g.id === activeGroupId
              ? { ...g, tree: splitLeaf(g.tree, activeSessionId, session.id, dir) }
              : g
          )
        )
        setActiveSessionId(session.id)
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error')
      }
    },
    [activeGroupId, activeSessionId, sessions, newTerminal, registerSession, toast]
  )

  const closeSession = useCallback(
    (sessionId: string) => {
      void window.api.pty.kill(sessionId)
      disposeTerminal(sessionId)
      setFloating((f) => f.filter((x) => x.sessionId !== sessionId))
      setGroups((gs) => {
        const next: TerminalGroup[] = []
        for (const g of gs) {
          if (!hasSession(g.tree, sessionId)) {
            next.push(g)
            continue
          }
          const tree = removeLeaf(g.tree, sessionId)
          if (tree) next.push({ ...g, tree })
        }
        return next
      })
      setSessions((s) => {
        const { [sessionId]: _drop, ...rest } = s
        return rest
      })
      setActiveSessionId((cur) => (cur === sessionId ? null : cur))
    },
    []
  )

  // Keep active group/session pointing at something that still exists.
  useEffect(() => {
    if (groups.length === 0) {
      if (activeGroupId !== null) setActiveGroupId(null)
      return
    }
    const activeGroup = groups.find((g) => g.id === activeGroupId)
    if (!activeGroup) {
      setActiveGroupId(groups[groups.length - 1].id)
      return
    }
    if (!activeSessionId || !hasSession(activeGroup.tree, activeSessionId)) {
      const next = firstSession(activeGroup.tree)
      if (next && next !== activeSessionId) setActiveSessionId(next)
    }
  }, [groups, activeGroupId, activeSessionId])

  const restartSession = useCallback(
    async (sessionId: string) => {
      const session = await window.api.pty.restart(sessionId)
      if (session) registerSession({ ...session, alive: true })
    },
    [registerSession]
  )

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const session = await window.api.pty.rename(sessionId, title)
    if (session) {
      setSessions((s) => ({ ...s, [sessionId]: { ...s[sessionId], title } }))
      setGroups((gs) =>
        gs.map((g) => (firstSession(g.tree) === sessionId ? { ...g, name: title } : g))
      )
    }
  }, [])

  const floatSession = useCallback((sessionId: string) => {
    setGroups((gs) => {
      const next: TerminalGroup[] = []
      for (const g of gs) {
        if (!hasSession(g.tree, sessionId)) {
          next.push(g)
          continue
        }
        const tree = removeLeaf(g.tree, sessionId)
        if (tree) next.push({ ...g, tree })
      }
      return next
    })
    setFloating((f) => [
      ...f,
      { id: crypto.randomUUID(), sessionId, x: 120 + f.length * 28, y: 120 + f.length * 28, w: 560, h: 360 }
    ])
  }, [])

  const dockFloating = useCallback(
    (sessionId: string) => {
      const session = sessions[sessionId]
      setFloating((f) => f.filter((x) => x.sessionId !== sessionId))
      if (!session) return
      const group: TerminalGroup = {
        id: crypto.randomUUID(),
        name: session.title,
        tree: newLeaf(sessionId)
      }
      setGroups((g) => [...g, group])
      setActiveGroupId(group.id)
      setActiveSessionId(sessionId)
      setDockVisible(true)
    },
    [sessions]
  )

  const serialize = useCallback((): SerializedTerminals => {
    const resolve = (id: string): LeafDescriptor => {
      const s = sessions[id]
      return { cwd: s?.cwd ?? '', shell: s?.shell ?? '', title: s?.title ?? 'terminal', toolId: s?.toolId }
    }
    return {
      groups: groups.map((g) => ({ name: g.name, tree: serializeTree(g.tree, resolve) })),
      floating: floating.map((f) => ({ ...resolve(f.sessionId), x: f.x, y: f.y, w: f.w, h: f.h })),
      dockVisible,
      dockHeight
    }
  }, [groups, floating, sessions, dockVisible, dockHeight])

  const reset = useCallback(() => {
    setSessions((prev) => {
      for (const id of Object.keys(prev)) {
        void window.api.pty.kill(id)
        disposeTerminal(id)
      }
      return {}
    })
    setGroups([])
    setFloating([])
    setActiveGroupId(null)
    setActiveSessionId(null)
  }, [])

  const restore = useCallback(
    async (data: SerializedTerminals) => {
      const nextSessions: Record<string, TerminalSession> = {}
      const nextGroups: TerminalGroup[] = []
      try {
        for (const g of data.groups) {
          const descs = collectLeaves(g.tree)
          const ids: string[] = []
          for (const d of descs) {
            const s = await window.api.pty.create({
              cwd: d.cwd,
              shell: d.shell,
              title: d.title,
              toolId: d.toolId
            })
            nextSessions[s.id] = s
            ids.push(s.id)
          }
          let i = 0
          nextGroups.push({ id: crypto.randomUUID(), name: g.name, tree: buildTree(g.tree, () => ids[i++]) })
        }
        const nextFloating: FloatingTerm[] = []
        for (const f of data.floating) {
          const s = await window.api.pty.create({ cwd: f.cwd, shell: f.shell, title: f.title })
          nextSessions[s.id] = s
          nextFloating.push({ id: crypto.randomUUID(), sessionId: s.id, x: f.x, y: f.y, w: f.w, h: f.h })
        }
        setSessions(nextSessions)
        setGroups(nextGroups)
        setFloating(nextFloating)
        setActiveGroupId(nextGroups[0]?.id ?? null)
        setActiveSessionId(nextGroups[0] ? firstSession(nextGroups[0].tree) : null)
        setDockVisible(data.dockVisible)
        setDockHeight(data.dockHeight)
      } catch (err) {
        toast(`Couldn't restore terminals: ${err instanceof Error ? err.message : String(err)}`, 'error')
      }
    },
    [toast]
  )

  const focusSession = useCallback(
    (sessionId: string) => {
      const group = groups.find((g) => hasSession(g.tree, sessionId))
      if (group) {
        setActiveGroupId(group.id)
        setActiveSessionId(sessionId)
        setDockVisible(true)
      }
    },
    [groups]
  )

  const setActiveGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId)
    setGroups((gs) => {
      const g = gs.find((x) => x.id === groupId)
      if (g) setActiveSessionId(firstSession(g.tree))
      return gs
    })
  }, [])

  const setFloatingRect = useCallback(
    (id: string, rect: Partial<Pick<FloatingTerm, 'x' | 'y' | 'w' | 'h'>>) => {
      setFloating((f) => f.map((x) => (x.id === id ? { ...x, ...rect } : x)))
    },
    []
  )

  const value = useMemo<TerminalsValue>(
    () => ({
      groups,
      floating,
      sessions,
      activeGroupId,
      activeSessionId,
      dockVisible,
      dockHeight,
      newTerminal,
      adoptSession,
      splitActive,
      closeSession,
      restartSession,
      renameSession,
      floatSession,
      dockFloating,
      setActiveGroup,
      setActiveSession: setActiveSessionId,
      focusSession,
      serialize,
      restore,
      reset,
      setFloatingRect,
      setDockVisible,
      setDockHeight
    }),
    [
      groups,
      floating,
      sessions,
      activeGroupId,
      activeSessionId,
      dockVisible,
      dockHeight,
      newTerminal,
      adoptSession,
      splitActive,
      closeSession,
      restartSession,
      renameSession,
      floatSession,
      dockFloating,
      setActiveGroup,
      focusSession,
      serialize,
      restore,
      reset,
      setFloatingRect
    ]
  )

  return <TerminalsContext.Provider value={value}>{children}</TerminalsContext.Provider>
}
