import { useCallback, useEffect, useState } from 'react'
import type { GitStatus, ProjectFolder } from '@shared/types'
import { useAppState } from '../state/AppState'
import { useTerminals } from '../state/Terminals'
import { useToast } from './Toast'
import { ContextMenu, type MenuItem } from './ContextMenu'

interface FolderCardProps {
  folder: ProjectFolder
  onOpenGit: () => void
  onOpenFiles: () => void
  onAddSubfolders: () => void
  onRemove: () => void
}

export function FolderCard({
  folder,
  onOpenGit,
  onOpenFiles,
  onAddSubfolders,
  onRemove
}: FolderCardProps): JSX.Element {
  const { tools, savedCommands } = useAppState()
  const terminals = useTerminals()
  const toast = useToast()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const refresh = useCallback(async () => {
    setStatus(await window.api.git.status(folder.path))
  }, [folder.path])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const launch = async (toolId: string): Promise<void> => {
    const res = await window.api.launch.tool(toolId, folder.path)
    if (!res.ok) toast(res.message, 'error')
    else if (res.kind === 'terminal' && res.session) terminals.adoptSession(res.session)
  }

  const runCommand = async (command: string): Promise<void> => {
    const res = await window.api.launch.command(command, folder.path)
    if (res.ok && res.kind === 'terminal' && res.session) terminals.adoptSession(res.session)
    else if (!res.ok) toast(res.message, 'error')
  }

  const copy = (text: string, label: string): void => {
    void navigator.clipboard.writeText(text)
    toast(`${label} copied`, 'success')
  }

  const items = (): MenuItem[] => {
    const ides = tools.filter((t) => t.type === 'ide')
    const runnable = tools.filter((t) => t.type === 'terminal' || t.type === 'ai-agent' || t.type === 'custom')
    const list: MenuItem[] = [{ header: 'Open' }]
    for (const t of ides) list.push({ icon: t.icon, label: `Open in ${t.name}`, onClick: () => void launch(t.id) })
    list.push({
      icon: '🖥',
      label: 'Open terminal here',
      onClick: () => void terminals.newTerminal({ cwd: folder.path, title: folder.name })
    })
    for (const t of runnable)
      list.push({ icon: t.icon, label: `Run ${t.name}`, onClick: () => void launch(t.id) })
    if (savedCommands.length) {
      list.push({ separator: true }, { header: 'Saved commands' })
      for (const c of savedCommands)
        list.push({ icon: '▶', label: c.label, onClick: () => void runCommand(c.command) })
    }
    list.push(
      { separator: true },
      { header: 'Git' },
      { icon: '⎇', label: 'View Git status', onClick: onOpenGit },
      {
        icon: '↓',
        label: 'Pull',
        onClick: () => void window.api.git.pull(folder.path).then((r) => toast(r.message, r.ok ? 'success' : 'error'))
      },
      { icon: '📋', label: 'Copy branch name', disabled: !status?.branch, onClick: () => copy(status?.branch ?? '', 'Branch') },
      { separator: true },
      { icon: '🗂', label: 'Open in file tree', onClick: onOpenFiles },
      { icon: '📋', label: 'Copy path', onClick: () => copy(folder.path, 'Path') },
      { icon: '📂', label: 'Reveal in OS explorer', onClick: () => void window.api.fs.reveal(folder.path) },
      { separator: true },
      { icon: '🧱', label: 'Break into subfolders…', onClick: onAddSubfolders },
      { icon: '🗑', label: 'Remove from project', danger: true, onClick: onRemove }
    )
    return list
  }

  const gitBadges = (): JSX.Element => {
    if (!status) return <span className="badge">…</span>
    if (status.error) return <span className="badge red">git error</span>
    if (!status.isRepo) return <span className="badge">not a repo</span>
    return (
      <>
        <span className="badge accent">⎇ {status.branch ?? 'detached'}</span>
        {status.dirty ? (
          <span className="badge yellow">● dirty</span>
        ) : (
          <span className="badge green">✓ clean</span>
        )}
        {status.staged > 0 && <span className="badge green">+{status.staged}</span>}
        {status.modified > 0 && <span className="badge yellow">~{status.modified}</span>}
        {status.untracked > 0 && <span className="badge">?{status.untracked}</span>}
        {!!status.ahead && <span className="badge">↑{status.ahead}</span>}
        {!!status.behind && <span className="badge">↓{status.behind}</span>}
      </>
    )
  }

  return (
    <div
      className="folder-card"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <div className="row">
        <strong style={{ flex: 1 }}>{folder.name}</strong>
        <button className="icon-btn" title="Refresh git" onClick={() => void refresh()}>
          ↻
        </button>
        <button
          className="icon-btn"
          title="Actions"
          onClick={(e) => setMenu({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().bottom })}
        >
          ⋯
        </button>
      </div>
      <div className="path">{folder.path}</div>
      <div className="git-row">{gitBadges()}</div>
      {status?.lastCommit && (
        <div className="commit">
          <span className="mono faint">{status.lastCommit.hash}</span> {status.lastCommit.message}
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items()} onClose={() => setMenu(null)} />}
    </div>
  )
}
