import { useCallback, useEffect, useState } from 'react'
import type { GitFileChange, GitStatus, Tool } from '@shared/types'
import { Modal } from './Modal'
import { useToast } from './Toast'

interface GitPanelProps {
  folderPath: string
  folderName: string
  ideTools: Tool[]
  onClose: () => void
}

function DiffText({ text }: { text: string }): JSX.Element {
  return (
    <div className="diff-view">
      {text.split('\n').map((line, i) => {
        let cls = ''
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-add'
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-del'
        else if (line.startsWith('@@') || line.startsWith('diff ')) cls = 'diff-meta'
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </div>
  )
}

export function GitPanel({ folderPath, folderName, ideTools, onClose }: GitPanelProps): JSX.Element {
  const toast = useToast()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [changes, setChanges] = useState<GitFileChange[]>([])
  const [message, setMessage] = useState('')
  const [diffFile, setDiffFile] = useState<string | null>(null)
  const [diffText, setDiffText] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([
      window.api.git.status(folderPath),
      window.api.git.changes(folderPath)
    ])
    setStatus(s)
    setChanges(c)
  }, [folderPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const act = async (fn: () => Promise<{ ok: boolean; message: string }>): Promise<void> => {
    setBusy(true)
    try {
      const res = await fn()
      toast(res.message, res.ok ? 'success' : 'error')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const showDiff = async (file: string): Promise<void> => {
    setDiffFile(file)
    setDiffText('Loading…')
    setDiffText(await window.api.git.diff(folderPath, file))
  }

  const staged = changes.filter((c) => c.staged)
  const unstaged = changes.filter((c) => !c.staged && !c.untracked)
  const untracked = changes.filter((c) => c.untracked)

  const fileRow = (c: GitFileChange, stagedSection: boolean): JSX.Element => (
    <div key={c.path} className="git-file" onClick={() => void showDiff(c.path)}>
      <span
        className="git-status-char"
        style={{ color: c.untracked ? 'var(--text-faint)' : stagedSection ? 'var(--green)' : 'var(--yellow)' }}
      >
        {stagedSection ? c.index : c.untracked ? '?' : c.workingDir}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }} className="mono">
        {c.path}
      </span>
      <button
        className="btn sm ghost"
        onClick={(e) => {
          e.stopPropagation()
          void act(() =>
            stagedSection
              ? window.api.git.unstage(folderPath, [c.path])
              : window.api.git.stage(folderPath, [c.path])
          )
        }}
      >
        {stagedSection ? '−' : '+'}
      </button>
    </div>
  )

  return (
    <Modal
      title={`Git · ${folderName}`}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn" disabled={busy} onClick={() => void act(() => window.api.git.fetch(folderPath))}>
            Fetch
          </button>
          <button className="btn" disabled={busy} onClick={() => void act(() => window.api.git.pull(folderPath))}>
            ↓ Pull
          </button>
          <button className="btn" disabled={busy} onClick={() => void act(() => window.api.git.push(folderPath))}>
            ↑ Push
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {!status?.isRepo ? (
        <div className="muted">{status?.error ?? 'This folder is not a Git repository.'}</div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <span className="badge accent">⎇ {status.branch ?? 'detached'}</span>
            {typeof status.ahead === 'number' && status.ahead > 0 && (
              <span className="badge">↑ {status.ahead}</span>
            )}
            {typeof status.behind === 'number' && status.behind > 0 && (
              <span className="badge">↓ {status.behind}</span>
            )}
            <button
              className="btn sm"
              onClick={() => {
                void navigator.clipboard.writeText(status.branch ?? '')
                toast('Branch copied', 'success')
              }}
            >
              Copy branch
            </button>
            {ideTools[0] && (
              <button
                className="btn sm"
                title={`Open in ${ideTools[0].name} to view diff`}
                onClick={() => void window.api.launch.tool(ideTools[0].id, folderPath)}
              >
                Open in {ideTools[0].name}
              </button>
            )}
            <div className="spacer" />
            <button className="btn sm" onClick={() => void refresh()}>
              ↻ Refresh
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="git-section-title">
                <span>Staged ({staged.length})</span>
                {staged.length > 0 && (
                  <button
                    className="btn sm ghost"
                    onClick={() => void act(() => window.api.git.unstage(folderPath, staged.map((c) => c.path)))}
                  >
                    Unstage all
                  </button>
                )}
              </div>
              {staged.map((c) => fileRow(c, true))}

              <div className="git-section-title">
                <span>Changes ({unstaged.length})</span>
                {unstaged.length > 0 && (
                  <button
                    className="btn sm ghost"
                    onClick={() => void act(() => window.api.git.stage(folderPath, unstaged.map((c) => c.path)))}
                  >
                    Stage all
                  </button>
                )}
              </div>
              {unstaged.map((c) => fileRow(c, false))}

              {untracked.length > 0 && (
                <>
                  <div className="git-section-title">
                    <span>Untracked ({untracked.length})</span>
                    <button
                      className="btn sm ghost"
                      onClick={() => void act(() => window.api.git.stage(folderPath, untracked.map((c) => c.path)))}
                    >
                      Stage all
                    </button>
                  </div>
                  {untracked.map((c) => fileRow(c, false))}
                </>
              )}

              {changes.length === 0 && <div className="muted" style={{ padding: '8px 0' }}>Working tree clean ✓</div>}

              <div className="field" style={{ marginTop: 14 }}>
                <label>Commit message</label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your changes"
                />
              </div>
              <button
                className="btn primary"
                disabled={busy || staged.length === 0 || !message.trim()}
                onClick={() =>
                  void act(async () => {
                    const r = await window.api.git.commit(folderPath, message)
                    if (r.ok) setMessage('')
                    return r
                  })
                }
              >
                Commit {staged.length > 0 ? `(${staged.length})` : ''}
              </button>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="git-section-title">
                <span>Diff{diffFile ? ` · ${diffFile}` : ''}</span>
              </div>
              {diffFile ? (
                <DiffText text={diffText} />
              ) : (
                <div className="muted" style={{ fontSize: 12 }}>
                  Click a file to view its diff.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
