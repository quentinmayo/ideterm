import { useEffect, useState } from 'react'
import type { GitStatus } from '@shared/types'
import { useSession } from '../state/Session'
import { useTerminals } from '../state/Terminals'
import { useStatus, useToast } from './Toast'
import { gitRemoteToWebUrl, repoShortName } from '../util/gitUrl'

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function StatusBar(): JSX.Element {
  const session = useSession()
  const terminals = useTerminals()
  const status = useStatus()
  const toast = useToast()

  const [git, setGit] = useState<GitStatus | null>(null)
  const [repo, setRepo] = useState<{ web: string; name: string } | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.app.version().then(setVersion)
  }, [])

  // The most contextually relevant folder: the open file tree, else the selected project's first folder.
  const folder =
    session.filesTarget?.path ??
    session.projects.find((p) => p.id === session.selectedProjectId)?.folders[0]?.path ??
    null

  useEffect(() => {
    if (!folder) {
      setGit(null)
      setRepo(null)
      return
    }
    let cancelled = false
    void (async () => {
      const s = await window.api.git.status(folder)
      if (cancelled) return
      setGit(s.isRepo ? s : null)
      const web = gitRemoteToWebUrl(await window.api.git.remote(folder))
      if (!cancelled) setRepo(web ? { web, name: repoShortName(web) ?? web } : null)
    })()
    return () => {
      cancelled = true
    }
  }, [folder, status]) // re-check after actions (commits, pulls) update the status log

  const sessionCount = Object.keys(terminals.sessions).length

  return (
    <div className="status-bar">
      <span className="sb-item" title={session.path ?? undefined}>
        🍯 {session.name || 'no session'}
        {session.isTemporary ? ' (temp)' : ''}
        {session.dirty && <span className="sb-dot" title="Unsaved changes" />}
      </span>

      <span className={`sb-msg ${status?.kind ?? ''}`}>
        {status ? `${clockTime(status.time)}  ${status.text}` : 'Ready'}
      </span>

      <span className="sb-spacer" />

      {git?.branch && (
        <span
          className="sb-item sb-click"
          title="Copy branch name"
          onClick={() => {
            void navigator.clipboard.writeText(git.branch as string)
            toast(`Branch "${git.branch}" copied`, 'success')
          }}
        >
          ⎇ {git.branch}
          {git.dirty ? <span className="sb-warn"> ●</span> : ' ✓'}
          {git.staged ? ` +${git.staged}` : ''}
          {git.modified ? ` ~${git.modified}` : ''}
          {git.untracked ? ` ?${git.untracked}` : ''}
          {git.ahead ? ` ↑${git.ahead}` : ''}
          {git.behind ? ` ↓${git.behind}` : ''}
        </span>
      )}

      {repo && (
        <span
          className="sb-item sb-click"
          title={`Open ${repo.web}`}
          onClick={() => void window.api.app.openExternal(repo.web)}
        >
          ⭧ {repo.name}
        </span>
      )}

      <span
        className="sb-item sb-click"
        title="Toggle terminal dock (Ctrl+`)"
        onClick={() => terminals.setDockVisible(!terminals.dockVisible)}
      >
        ▦ {sessionCount}
      </span>

      <span
        className="sb-item sb-click"
        title="View releases"
        onClick={() => void window.api.app.openExternal('https://github.com/quentinmayo/ideterm/releases')}
      >
        v{version}
      </span>
    </div>
  )
}
