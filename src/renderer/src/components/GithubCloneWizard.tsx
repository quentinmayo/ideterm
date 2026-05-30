import { useEffect, useMemo, useState } from 'react'
import type { GithubRepoSummary, GitPathState, Project } from '@shared/types'
import { Modal } from './Modal'
import { useToast } from './Toast'

type SourceMode = 'manual' | 'browse'

function normalizeRepoInput(input: string): string {
  const v = input.trim()
  if (!v) return ''
  const https = v.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/i)
  if (https) return https[1]
  if (v.endsWith('.git')) return v.slice(0, -4)
  return v
}

function repoNameFromSpec(spec: string): string {
  const clean = normalizeRepoInput(spec)
  const parts = clean.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function joinPath(base: string, name: string): string {
  const slash = base.includes('\\') ? '\\' : '/'
  const b = base.replace(/[\\/]+$/, '')
  return `${b}${slash}${name}`
}

function normPath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

interface GithubCloneWizardProps {
  project: Project
  onClose: () => void
  onEnsureFolder: (path: string, name: string) => Promise<void>
  onOpenFiles: (target: { path: string; name: string }) => void
}

export function GithubCloneWizard({ project, onClose, onEnsureFolder, onOpenFiles }: GithubCloneWizardProps): JSX.Element {
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState<SourceMode>('browse')
  const [manualRepo, setManualRepo] = useState('')
  const [query, setQuery] = useState('')
  const [repos, setRepos] = useState<GithubRepoSummary[]>([])
  const [selectedRepo, setSelectedRepo] = useState<GithubRepoSummary | null>(null)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [destinationRoot, setDestinationRoot] = useState(project.folders[0]?.path ?? '')
  const [pathState, setPathState] = useState<GitPathState | null>(null)
  const [branchName, setBranchName] = useState(`feature/${Date.now().toString(36)}`)
  const [busy, setBusy] = useState(false)

  const repoSpec = mode === 'browse' ? (selectedRepo?.fullName ?? '') : normalizeRepoInput(manualRepo)
  const repoName = mode === 'browse' ? (selectedRepo?.name ?? '') : repoNameFromSpec(repoSpec)
  const destinationPath = destinationRoot && repoName ? joinPath(destinationRoot, repoName) : ''
  const alreadyInProject = useMemo(
    () => !!project.folders.find((f) => normPath(f.path) === normPath(destinationPath)),
    [project.folders, destinationPath]
  )

  useEffect(() => {
    if (mode !== 'browse') return
    let cancelled = false
    const timer = setTimeout(() => {
      setLoadingRepos(true)
      const load = query.trim()
        ? window.api.git.githubSearch(query.trim(), 80)
        : window.api.git.githubList(120)
      void load
        .then((items) => {
          if (!cancelled) setRepos(items)
        })
        .finally(() => {
          if (!cancelled) setLoadingRepos(false)
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, query])

  useEffect(() => {
    if (step !== 2 || !destinationPath) {
      setPathState(null)
      return
    }
    let cancelled = false
    void window.api.git.inspectPath(destinationPath).then((s) => {
      if (!cancelled) setPathState(s)
    })
    return () => {
      cancelled = true
    }
  }, [step, destinationPath])

  const chooseDestination = async (): Promise<void> => {
    const picked = await window.api.dialog.pickFolder()
    if (picked) setDestinationRoot(picked)
  }

  const ensureAndOpen = async (): Promise<void> => {
    await onEnsureFolder(destinationPath, repoName || 'repo')
    onOpenFiles({ path: destinationPath, name: repoName || 'repo' })
    onClose()
  }

  const cloneHere = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await window.api.git.githubClone(repoSpec, destinationPath)
      toast(res.message, res.ok ? 'success' : 'error')
      if (!res.ok) return
      await ensureAndOpen()
    } finally {
      setBusy(false)
    }
  }

  const createBranchThenOpen = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await window.api.git.createBranchFromMain(destinationPath, branchName.trim())
      toast(res.message, res.ok ? 'success' : 'error')
      if (!res.ok) return
      await ensureAndOpen()
    } finally {
      setBusy(false)
    }
  }

  const canNextFromStep0 = mode === 'browse' ? !!selectedRepo : !!repoSpec
  const canNextFromStep1 = !!destinationRoot && !!repoName

  return (
    <Modal
      title={`GitHub clone · ${project.name || 'Untitled project'}`}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <div className="spacer" />
          {step > 0 && (
            <button className="btn" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              Back
            </button>
          )}
          {step === 0 && (
            <button className="btn primary" disabled={!canNextFromStep0} onClick={() => setStep(1)}>
              Next
            </button>
          )}
          {step === 1 && (
            <button className="btn primary" disabled={!canNextFromStep1} onClick={() => setStep(2)}>
              Next
            </button>
          )}
        </>
      }
    >
      {step === 0 && (
        <div>
          <div className="field">
            <label>Source</label>
            <div className="row">
              <button className={`btn sm ${mode === 'browse' ? 'primary' : ''}`} onClick={() => setMode('browse')}>
                Browse accessible repos
              </button>
              <button className={`btn sm ${mode === 'manual' ? 'primary' : ''}`} onClick={() => setMode('manual')}>
                Paste owner/repo or URL
              </button>
            </div>
          </div>

          {mode === 'manual' ? (
            <div className="field">
              <label>Repository</label>
              <input
                type="text"
                autoFocus
                value={manualRepo}
                onChange={(e) => setManualRepo(e.target.value)}
                placeholder="owner/repo or https://github.com/owner/repo"
              />
            </div>
          ) : (
            <>
              <div className="field">
                <label>Search GitHub repos you can access</label>
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to filter repositories…"
                />
              </div>
              <div className="card" style={{ maxHeight: 280, overflow: 'auto' }}>
                {loadingRepos ? (
                  <div className="muted">Loading repositories…</div>
                ) : repos.length === 0 ? (
                  <div className="muted">No repositories found. Ensure `gh auth login` is set up.</div>
                ) : (
                  repos.map((r) => (
                    <button
                      key={r.fullName}
                      className={`btn ghost`}
                      style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        marginBottom: 6,
                        borderColor: selectedRepo?.fullName === r.fullName ? 'var(--accent)' : 'transparent'
                      }}
                      onClick={() => setSelectedRepo(r)}
                    >
                      <span>{r.private ? '🔒' : '🌐'}</span>
                      <span style={{ flex: 1, textAlign: 'left' }}>{r.fullName}</span>
                      <span className="faint">{r.defaultBranch ?? 'main'}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="field">
            <label>Repository selected</label>
            <div className="card mono">{repoSpec}</div>
          </div>
          <div className="field">
            <label>Clone into this project location</label>
            <div className="row">
              <input type="text" value={destinationRoot} onChange={(e) => setDestinationRoot(e.target.value)} />
              <button className="btn" onClick={() => void chooseDestination()}>
                Browse…
              </button>
            </div>
          </div>
          <div className="field">
            <label>Final destination</label>
            <div className={`card mono ${alreadyInProject ? 'warn-banner' : ''}`}>{destinationPath || '(incomplete)'}</div>
          </div>
          {alreadyInProject && (
            <div className="warn-banner">This folder path is already in this project. The wizard will highlight reuse options.</div>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="badge accent">{repoSpec}</span>
            <span className="badge">{destinationPath}</span>
            {alreadyInProject && <span className="badge yellow">Already in project</span>}
          </div>
          {!pathState ? (
            <div className="muted">Checking destination…</div>
          ) : !pathState.exists ? (
            <div className="card">
              <div className="muted" style={{ marginBottom: 8 }}>
                Destination does not exist yet.
              </div>
              <button className="btn primary" disabled={busy} onClick={() => void cloneHere()}>
                Clone repository here
              </button>
            </div>
          ) : pathState.isGitRepo ? (
            <div className="card">
              <div className="muted" style={{ marginBottom: 8 }}>
                Repository already exists here (branch: {pathState.branch ?? 'unknown'}).
              </div>
              <div className="field">
                <label>Create a new branch from main</label>
                <div className="row">
                  <input type="text" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
                  <button className="btn primary" disabled={busy || !branchName.trim()} onClick={() => void createBranchThenOpen()}>
                    Create branch + open files
                  </button>
                </div>
              </div>
              <button className="btn" disabled={busy} onClick={() => void ensureAndOpen()}>
                Open existing repo in file viewer
              </button>
            </div>
          ) : (
            <div className="card">
              <div className="warn-banner" style={{ margin: 0 }}>
                A non-git folder already exists at this destination. Pick a different destination root.
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
