import { useCallback } from 'react'
import type { FavCommand, LaunchResult, RecentLaunch } from '@shared/types'
import { useAppState } from '../state/AppState'
import { useSession } from '../state/Session'
import { useTerminals } from '../state/Terminals'
import { useToast } from '../components/Toast'

/**
 * Central launcher used everywhere tools/favorites are triggered. Adopts embedded
 * terminal sessions, surfaces results, and records "recent launches" for the
 * one-click buddies on the Favorites panel and welcome screen.
 */
export function useLauncher(): {
  launchTool: (toolId: string, cwd?: string, modeId?: string) => Promise<void>
  runFav: (fav: FavCommand) => Promise<void>
  runRecent: (recent: RecentLaunch) => Promise<void>
} {
  const { tools, addRecent } = useAppState()
  const session = useSession()
  const terminals = useTerminals()
  const toast = useToast()

  const handle = useCallback(
    (res: LaunchResult): void => {
      if (!res.ok) toast(res.message, 'error')
      else if (res.kind === 'terminal' && res.session) terminals.adoptSession(res.session)
      else toast(res.message, 'success')
    },
    [terminals, toast]
  )

  const runFavLike = useCallback(
    async (command: string, cwd: string, label: string, target: 'embedded' | 'external'): Promise<void> => {
      if (target === 'external') {
        const res = await window.api.launch.externalCommand(command, cwd)
        toast(res.ok ? `Launched ${label}` : res.message, res.ok ? 'success' : 'error')
        return
      }
      if (!session.active) await session.newTemporary()
      handle(await window.api.launch.command(command, cwd, label))
    },
    [session, handle, toast]
  )

  const launchTool = useCallback(
    async (toolId: string, cwd?: string, modeId?: string): Promise<void> => {
      const res = await window.api.launch.tool(toolId, cwd, modeId)
      handle(res)
      if (!res.ok) return
      const tool = tools.find((t) => t.id === toolId)
      const mode = modeId ? tool?.modes?.find((m) => m.id === modeId) : undefined
      await addRecent({
        id: crypto.randomUUID(),
        kind: 'tool',
        toolId,
        modeId,
        label: tool ? (mode ? `${tool.name} · ${mode.label}` : tool.name) : toolId,
        icon: tool?.icon,
        cwd,
        at: Date.now()
      })
    },
    [tools, addRecent, handle]
  )

  const runFav = useCallback(
    async (fav: FavCommand): Promise<void> => {
      await runFavLike(fav.command, fav.cwd, fav.label, fav.target)
      await addRecent({
        id: crypto.randomUUID(),
        kind: 'fav',
        label: fav.label,
        icon: fav.icon,
        cwd: fav.cwd,
        command: fav.command,
        target: fav.target,
        at: Date.now()
      })
    },
    [runFavLike, addRecent]
  )

  const runRecent = useCallback(
    async (recent: RecentLaunch): Promise<void> => {
      if (recent.kind === 'tool' && recent.toolId) {
        await launchTool(recent.toolId, recent.cwd, recent.modeId)
      } else if (recent.kind === 'fav' && recent.command) {
        await runFavLike(recent.command, recent.cwd ?? '', recent.label, recent.target ?? 'embedded')
        await addRecent({ ...recent, id: crypto.randomUUID(), at: Date.now() })
      }
    },
    [launchTool, runFavLike, addRecent]
  )

  return { launchTool, runFav, runRecent }
}
