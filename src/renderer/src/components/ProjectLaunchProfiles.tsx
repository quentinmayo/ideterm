import { useState } from 'react'
import { ZodError } from 'zod'
import type { LaunchProfile, LaunchStep, Project } from '@shared/types'
import { profileSchema } from '@shared/validation'
import { useAppState } from '../state/AppState'
import { useSession } from '../state/Session'
import { profileKey, useLaunchProfiles } from '../state/LaunchProfiles'
import { useTerminals } from '../state/Terminals'
import { useToast } from './Toast'
import { Modal } from './Modal'

export function ProjectLaunchProfiles({ project }: { project: Project }): JSX.Element {
  const { saveProject } = useSession()
  const { runs, launch, stop } = useLaunchProfiles()
  const terminals = useTerminals()
  const toast = useToast()
  const [editing, setEditing] = useState<LaunchProfile | null>(null)
  const [selectedId, setSelectedId] = useState<string>('')
  const profiles = project.launchProfiles ?? []
  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0]
  const key = selected ? profileKey(project, selected) : ''
  const run = runs[key]
  const hasTerminals = run?.steps.some((s) => s.sessionId && terminals.sessions[s.sessionId]?.alive)
  const newProfile = (): void =>
    setEditing({
      id: crypto.randomUUID(),
      name: 'Develop',
      steps: [
        {
          id: crypto.randomUUID(),
          name: 'Terminal',
          folderId: project.folders[0]?.id ?? '',
          kind: 'command',
          command: ''
        }
      ]
    })
  return (
    <section className="card launch-profiles" aria-label="Project launch profiles">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <strong>Launch project</strong>
        {selected && (
          <select
            aria-label="Launch profile"
            value={selected.id}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {selected && (
          <button
            className="btn primary"
            disabled={run?.busy || hasTerminals}
            onClick={() => void launch(project, selected)}
          >
            {run?.busy ? 'Launching…' : `Launch ${selected.name}`}
          </button>
        )}
        {selected && (
          <button className="btn" disabled={run?.busy} onClick={() => setEditing(selected)}>
            Edit profile
          </button>
        )}
        {(run?.busy || hasTerminals) && (
          <button className="btn danger" onClick={() => stop(key)}>
            Stop terminals
          </button>
        )}
        <div className="spacer" />
        <button className="btn" disabled={!project.folders.length} onClick={newProfile}>
          New launch profile
        </button>
      </div>
      {!selected && (
        <p className="muted">
          Add folders, choose the tools and commands for each, then launch them together.
        </p>
      )}
      {selected && (
        <p className="muted">
          {selected.steps.length} steps · run in order · embedded terminals share a split layout
        </p>
      )}
      {run && (
        <div aria-live="polite">
          {run.steps.map((step) => {
            const session = step.sessionId ? terminals.sessions[step.sessionId] : undefined
            const status =
              step.sessionId && !session?.alive && ['launched', 'ready'].includes(step.status)
                ? 'stopped'
                : step.status
            return (
              <div className="row launch-step-result" key={step.id}>
                <strong>{step.name}</strong>
                <span className={`badge ${status === 'failed' ? 'red' : ''}`}>{status}</span>
                <span className="muted" style={{ flex: 1 }}>
                  {step.message}
                </span>
                {session && (
                  <>
                    <button className="btn sm" onClick={() => terminals.focusSession(session.id)}>
                      Show terminal
                    </button>
                    <button
                      className="btn sm"
                      disabled={run.busy}
                      onClick={() =>
                        void terminals.restartSession(session.id).catch((e) => toast(String(e), 'error'))
                      }
                    >
                      Restart
                    </button>
                    <button className="btn sm" onClick={() => terminals.closeSession(session.id)}>
                      Stop
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
      {editing && (
        <ProfileEditor
          profile={editing}
          project={project}
          onClose={() => setEditing(null)}
          onSave={(profile) => {
            const next = profiles.some((p) => p.id === profile.id)
              ? profiles.map((p) => (p.id === profile.id ? profile : p))
              : [...profiles, profile]
            saveProject({ ...project, launchProfiles: next })
            setSelectedId(profile.id)
            setEditing(null)
          }}
          onDelete={
            profiles.some((p) => p.id === editing.id)
              ? () => {
                  saveProject({ ...project, launchProfiles: profiles.filter((p) => p.id !== editing.id) })
                  setEditing(null)
                }
              : undefined
          }
        />
      )}
    </section>
  )
}

function ProfileEditor({
  profile,
  project,
  onSave,
  onClose,
  onDelete
}: {
  profile: LaunchProfile
  project: Project
  onSave: (profile: LaunchProfile) => void
  onClose: () => void
  onDelete?: () => void
}): JSX.Element {
  const { tools } = useAppState()
  const [name, setName] = useState(profile.name)
  const [steps, setSteps] = useState(profile.steps)
  const [envText, setEnvText] = useState<Record<string, string>>(
    Object.fromEntries(
      profile.steps.map((s) => [
        s.id,
        Object.entries(s.env ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join('\n')
      ])
    )
  )
  const [error, setError] = useState('')
  const change = (id: string, values: Partial<LaunchStep>): void =>
    setSteps((steps) => steps.map((s) => (s.id === id ? { ...s, ...values } : s)))
  const save = (): void => {
    try {
      const parsed = profileSchema.parse({
        ...profile,
        name: name.trim(),
        steps: steps.map((s) => {
          const env: Record<string, string> = {}
          for (const line of (envText[s.id] ?? '').split('\n').filter((line) => line.trim())) {
            const equals = line.indexOf('=')
            if (equals < 1) throw new Error('Use NAME=value for each environment override')
            env[line.slice(0, equals).trim()] = line.slice(equals + 1)
          }
          return { ...s, env }
        })
      })
      if (parsed.steps.some((s) => !project.folders.some((f) => f.id === s.folderId)))
        throw new Error('Choose an existing folder for every step')
      onSave(parsed)
    } catch (error) {
      setError(
        error instanceof ZodError
          ? error.issues
              .slice(0, 3)
              .map((issue) => {
                const step =
                  issue.path[0] === 'steps' && typeof issue.path[1] === 'number'
                    ? `Step ${issue.path[1] + 1}: `
                    : ''
                return step + issue.message
              })
              .join(' · ')
          : error instanceof Error
            ? error.message
            : String(error)
      )
    }
  }
  return (
    <Modal
      title="Configure launch profile"
      width={850}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button className="btn danger" onClick={onDelete}>
              Delete profile
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save profile
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="profile-name">Profile name</label>
        <input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Develop, Debug, Review…"
        />
      </div>
      <p className="muted">
        Steps launch in order. An optional local port check waits for a service before starting the next step.
        A failed step leaves earlier terminals open for inspection.
      </p>
      {steps.map((step, index) => {
        const tool = tools.find((t) => t.id === step.toolId)
        return (
          <fieldset className="launch-step" key={step.id}>
            <legend>Step {index + 1}</legend>
            <div className="row">
              <input
                aria-label={`Step ${index + 1} name`}
                value={step.name}
                onChange={(e) => change(step.id, { name: e.target.value })}
                placeholder="Backend server"
              />
              <button
                className="btn sm"
                disabled={index === 0}
                onClick={() =>
                  setSteps((steps) => {
                    const next = [...steps]
                    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                    return next
                  })
                }
              >
                Move up
              </button>
              <button
                className="btn sm danger"
                onClick={() => setSteps((steps) => steps.filter((s) => s.id !== step.id))}
              >
                Remove
              </button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <select
                aria-label={`Step ${index + 1} folder`}
                value={step.folderId}
                onChange={(e) => change(step.id, { folderId: e.target.value })}
              >
                <option value="" disabled>
                  Choose folder
                </option>
                {project.folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Step ${index + 1} type`}
                value={step.kind}
                onChange={(e) => change(step.id, { kind: e.target.value as LaunchStep['kind'] })}
              >
                <option value="command">Terminal command</option>
                <option value="tool">Configured tool</option>
              </select>
            </div>
            {step.kind === 'command' ? (
              <div className="field">
                <label>Command</label>
                <input
                  aria-label={`Step ${index + 1} command`}
                  value={step.command ?? ''}
                  onChange={(e) => change(step.id, { command: e.target.value })}
                  placeholder="npm run dev"
                />
              </div>
            ) : (
              <div className="row" style={{ marginTop: 10 }}>
                <select
                  aria-label={`Step ${index + 1} tool`}
                  value={step.toolId ?? ''}
                  onChange={(e) => change(step.id, { toolId: e.target.value, modeId: undefined })}
                >
                  <option value="">Choose tool</option>
                  {tools.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Step ${index + 1} mode`}
                  value={step.modeId ?? ''}
                  onChange={(e) => change(step.id, { modeId: e.target.value || undefined })}
                >
                  <option value="">Default mode</option>
                  {tool?.modes?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <details style={{ marginTop: 12 }}>
              <summary>Environment and readiness</summary>
              <div className="field">
                <label>Environment overrides (saved in the session file)</label>
                <textarea
                  aria-label={`Step ${index + 1} environment`}
                  rows={2}
                  value={envText[step.id] ?? ''}
                  onChange={(e) => setEnvText({ ...envText, [step.id]: e.target.value })}
                  placeholder={'NODE_ENV=development\nPORT=3000'}
                />
              </div>
              <div className="row">
                <div className="field">
                  <label>Wait for local TCP port (optional)</label>
                  <input
                    aria-label={`Step ${index + 1} port`}
                    type="number"
                    min={1}
                    max={65535}
                    value={step.readyPort ?? ''}
                    onChange={(e) =>
                      change(step.id, { readyPort: e.target.value ? Number(e.target.value) : undefined })
                    }
                  />
                </div>
                <div className="field">
                  <label>Timeout in seconds</label>
                  <input
                    aria-label={`Step ${index + 1} timeout`}
                    type="number"
                    min={1}
                    max={120}
                    value={step.timeoutSeconds ?? 30}
                    onChange={(e) => change(step.id, { timeoutSeconds: Number(e.target.value) })}
                  />
                </div>
              </div>
            </details>
          </fieldset>
        )
      })}
      <button
        className="btn"
        disabled={steps.length >= 30}
        onClick={() =>
          setSteps([
            ...steps,
            {
              id: crypto.randomUUID(),
              name: 'New step',
              folderId: project.folders[0]?.id ?? '',
              kind: 'command',
              command: ''
            }
          ])
        }
      >
        Add step
      </button>
      {error && (
        <p role="alert" style={{ color: 'var(--red)', whiteSpace: 'pre-wrap' }}>
          {error}
        </p>
      )}
    </Modal>
  )
}
