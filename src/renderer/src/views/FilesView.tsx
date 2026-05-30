import { useCallback, useEffect, useState } from 'react'
import type { GitFileChange, GitStatus } from '@shared/types'
import { useSession } from '../state/Session'
import { useAppState } from '../state/AppState'
import { useLauncher } from '../util/launch'
import { useToast } from '../components/Toast'
import { CommandPalette, type PaletteItem } from '../components/CommandPalette'
import { FindReplacePanel } from '../components/FindReplacePanel'
import { FileTree } from '../files/FileTree'
import { FileEditor } from '../files/FileEditor'

interface OpenDoc {
  text: string
  dirty: boolean
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function FilesView(): JSX.Element {
  const { projects, filesTarget: target, openFiles, setFilesTarget, addOpenFile, removeOpenFile } = useSession()
  const { tools } = useAppState()
  const launcher = useLauncher()
  const toast = useToast()
  const [docs, setDocs] = useState<Record<string, OpenDoc>>({})
  const [active, setActive] = useState<string | null>(null)
  const [palette, setPalette] = useState<'tool' | 'folder' | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [tab, setTab] = useState<'files' | 'git'>('files')
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [gitChanges, setGitChanges] = useState<GitFileChange[]>([])
  const [gitMessage, setGitMessage] = useState('')
  const [gitBusy, setGitBusy] = useState(false)
  const [gitDiffFile, setGitDiffFile] = useState<string | null>(null)
  const [gitDiffText, setGitDiffText] = useState('')

  const loadDoc = useCallback(
    async (path: string) => {
      try {
        const text = await window.api.fs.read(path)
        setDocs((d) => ({ ...d, [path]: { text, dirty: false } }))
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error')
      }
    },
    [toast]
  )

  const openFile = useCallback(
    (path: string, name: string) => {
      setActive(path)
      addOpenFile({ path, name })
      if (!docs[path]) void loadDoc(path)
    },
    [docs, addOpenFile, loadDoc]
  )

  // After a restore, default the active tab and lazily load its content.
  useEffect(() => {
    if (!active && openFiles.length) setActive(openFiles[openFiles.length - 1].path)
  }, [openFiles, active])
  useEffect(() => {
    if (active && !docs[active]) void loadDoc(active)
  }, [active, docs, loadDoc])

  const save = useCallback(
    async (path: string) => {
      const doc = docs[path]
      if (!doc) return
      try {
        await window.api.fs.write(path, doc.text)
        setDocs((d) => ({ ...d, [path]: { ...d[path], dirty: false } }))
        toast('Saved', 'success')
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error')
      }
    },
    [docs, toast]
  )

  const closeTab = (path: string): void => {
    removeOpenFile(path)
    setActive((cur) => {
      if (cur !== path) return cur
      const remaining = openFiles.filter((x) => x.path !== path)
      return remaining.length ? remaining[remaining.length - 1].path : null
    })
  }

  // Quick-action palettes: launch a tool here, or jump to another folder.
  const toolItems: PaletteItem[] = tools.flatMap((t) =>
    t.modes?.length
      ? t.modes.map((m) => ({ id: `${t.id}@@${m.id}`, label: `${t.name} · ${m.label}`, hint: t.path, icon: t.icon }))
      : [{ id: t.id, label: t.name, hint: `${t.type} · ${t.path}`, icon: t.icon }]
  )
  const folderItems: PaletteItem[] = projects.flatMap((p) =>
    p.folders.map((f) => ({ id: f.path, label: f.name, hint: `${p.name} · ${f.path}`, icon: p.icon ?? '📁' }))
  )

  const launchTool = async (encodedId: string): Promise<void> => {
    if (!target) return
    const [toolId, modeId] = encodedId.split('@@')
    await launcher.launchTool(toolId, target.path, modeId)
  }
  const switchFolder = (path: string): void => {
    const found = projects.flatMap((p) => p.folders).find((f) => f.path === path)
    if (found) setFilesTarget({ path: found.path, name: found.name })
  }

  const refreshGit = useCallback(async () => {
    if (!target) return
    const [s, c] = await Promise.all([window.api.git.status(target.path), window.api.git.changes(target.path)])
    setGitStatus(s)
    setGitChanges(c)
  }, [target])

  useEffect(() => {
    if (!target) return
    setGitDiffFile(null)
    setGitDiffText('')
    if (tab === 'git') void refreshGit()
  }, [target, tab, refreshGit])

  const gitAct = useCallback(
    async (fn: () => Promise<{ ok: boolean; message: string }>) => {
      setGitBusy(true)
      try {
        const r = await fn()
        toast(r.message, r.ok ? 'success' : 'error')
        await refreshGit()
      } finally {
        setGitBusy(false)
      }
    },
    [refreshGit, toast]
  )

  const showGitDiff = useCallback(
    async (file: string) => {
      if (!target) return
      setGitDiffFile(file)
      setGitDiffText('Loading…')
      setGitDiffText(await window.api.git.diff(target.path, file))
    },
    [target]
  )

  if (!target) {
    const folders = projects.flatMap((p) => p.folders.map((f) => ({ ...f, project: p.name })))
    return (
      <div className="view-inner">
        <div className="page-head">
          <div>
            <h1>Files</h1>
            <div className="sub">Browse and edit files in any of your project folders.</div>
          </div>
        </div>
        {folders.length === 0 ? (
          <div className="empty">
            <div className="big">🗂</div>
            <div>Add folders to a project first, then open them here.</div>
          </div>
        ) : (
          <div className="grid">
            {folders.map((f) => (
              <div
                key={f.id}
                className="card"
                style={{ cursor: 'pointer' }}
                onClick={() => setFilesTarget({ path: f.path, name: f.name })}
              >
                <strong>{f.name}</strong>
                <div className="faint" style={{ fontSize: 11 }}>
                  {f.project}
                </div>
                <div className="path mono" style={{ fontSize: 11 }}>
                  {f.path}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="files-layout">
      <FileTree root={target.path} rootName={target.name} selectedPath={active} onOpenFile={openFile} />
      <div className="editor-area">
        <div className="quick-actions">
          <button className="btn sm" title="Launch a tool in this folder" onClick={() => setPalette('tool')}>
            ⚡ Run tool…
          </button>
          <button className="btn sm" title="Switch to another folder" onClick={() => setPalette('folder')}>
            📁 {target.name} ▾
          </button>
          <button className="btn sm" title="Find & replace in this folder" onClick={() => setFindOpen(true)}>
            🔎 Find / replace…
          </button>
          <button className="btn sm" title="Open Git tab" onClick={() => setTab('git')}>
            ⎇ Git
          </button>
          <div className="spacer" />
          <button className="icon-btn" title="Reveal folder in OS explorer" onClick={() => void window.api.fs.reveal(target.path)}>
            📂
          </button>
        </div>
        <div className="editor-tabs">
          <div className="editor-tab" onClick={() => setFilesTarget(null)} title="Back to folder list">
            ‹ Folders
          </div>
          <div className={`editor-tab ${tab === 'git' ? 'active' : ''}`} onClick={() => setTab('git')}>
            ⎇ Git
          </div>
          {openFiles.map((openTab) => (
            <div
              key={openTab.path}
              className={`editor-tab ${tab === 'files' && active === openTab.path ? 'active' : ''}`}
              onClick={() => {
                setTab('files')
                setActive(openTab.path)
              }}
            >
              {docs[openTab.path]?.dirty && <span className="dirty" />}
              <span>{openTab.name}</span>
              <span
                className="icon-btn"
                style={{ padding: 0 }}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(openTab.path)
                }}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
        {tab === 'git' ? (
          <div style={{ padding: 14, overflow: 'auto', height: '100%' }}>
            {!gitStatus?.isRepo ? (
              <div className="muted">{gitStatus?.error ?? 'This folder is not a Git repository.'}</div>
            ) : (
              <>
                <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                  <span className="badge accent">⎇ {gitStatus.branch ?? 'detached'}</span>
                  {!!gitStatus.ahead && <span className="badge">↑ {gitStatus.ahead}</span>}
                  {!!gitStatus.behind && <span className="badge">↓ {gitStatus.behind}</span>}
                  <button className="btn sm" disabled={gitBusy} onClick={() => void gitAct(() => window.api.git.fetch(target.path))}>
                    Fetch
                  </button>
                  <button className="btn sm" disabled={gitBusy} onClick={() => void gitAct(() => window.api.git.pull(target.path))}>
                    Pull
                  </button>
                  <button className="btn sm" disabled={gitBusy} onClick={() => void gitAct(() => window.api.git.push(target.path))}>
                    Push
                  </button>
                  <div className="spacer" />
                  <button className="btn sm" onClick={() => void refreshGit()}>
                    ↻ Refresh
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="git-section-title">
                      <span>Changes ({gitChanges.length})</span>
                      {gitChanges.length > 0 && (
                        <button
                          className="btn sm ghost"
                          onClick={() => void gitAct(() => window.api.git.stage(target.path, gitChanges.map((c) => c.path)))}
                        >
                          Stage all
                        </button>
                      )}
                    </div>
                    {gitChanges.map((c) => (
                      <div key={c.path} className="git-file" onClick={() => void showGitDiff(c.path)}>
                        <span
                          className="git-status-char"
                          style={{ color: c.untracked ? 'var(--text-faint)' : c.staged ? 'var(--green)' : 'var(--yellow)' }}
                        >
                          {c.staged ? c.index : c.untracked ? '?' : c.workingDir}
                        </span>
                        <span className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.path}
                        </span>
                        <button
                          className="btn sm ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            void gitAct(() =>
                              c.staged
                                ? window.api.git.unstage(target.path, [c.path])
                                : window.api.git.stage(target.path, [c.path])
                            )
                          }}
                        >
                          {c.staged ? '−' : '+'}
                        </button>
                        <button
                          className="btn sm ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            openFile(`${target.path}/${c.path}`, baseName(c.path))
                            setTab('files')
                          }}
                        >
                          Open
                        </button>
                      </div>
                    ))}
                    {gitChanges.length === 0 && <div className="muted">Working tree clean.</div>}

                    <div className="field" style={{ marginTop: 14 }}>
                      <label>Commit message</label>
                      <textarea
                        rows={3}
                        value={gitMessage}
                        onChange={(e) => setGitMessage(e.target.value)}
                        placeholder="Describe your changes"
                      />
                    </div>
                    <button
                      className="btn primary"
                      disabled={gitBusy || gitChanges.every((c) => !c.staged) || !gitMessage.trim()}
                      onClick={() =>
                        void gitAct(async () => {
                          const r = await window.api.git.commit(target.path, gitMessage)
                          if (r.ok) setGitMessage('')
                          return r
                        })
                      }
                    >
                      Commit
                    </button>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="git-section-title">
                      <span>Diff{gitDiffFile ? ` · ${gitDiffFile}` : ''}</span>
                    </div>
                    {gitDiffFile ? (
                      <div className="diff-view">
                        {gitDiffText.split('\n').map((line, i) => {
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
                    ) : (
                      <div className="muted">Click a changed file to view diff.</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : active && docs[active] ? (
          <FileEditor
            key={active}
            path={active}
            initialValue={docs[active].text}
            onChange={(text) => setDocs((d) => ({ ...d, [active]: { text, dirty: true } }))}
            onSave={() => void save(active)}
          />
        ) : (
          <div className="empty" style={{ height: '100%' }}>
            <div className="big">📄</div>
            <div>Select a file from the tree. Ctrl/Cmd+S to save.</div>
          </div>
        )}
      </div>

      {palette === 'tool' && (
        <CommandPalette
          title="Run a tool in this folder"
          placeholder="Search tools…"
          items={toolItems}
          onPick={(id) => void launchTool(id)}
          onClose={() => setPalette(null)}
        />
      )}
      {palette === 'folder' && (
        <CommandPalette
          title="Switch folder"
          placeholder="Search folders…"
          items={folderItems}
          onPick={switchFolder}
          onClose={() => setPalette(null)}
        />
      )}
      {findOpen && (
        <FindReplacePanel
          dir={target.path}
          dirName={target.name}
          onOpenFile={openFile}
          onClose={() => setFindOpen(false)}
        />
      )}
    </div>
  )
}
