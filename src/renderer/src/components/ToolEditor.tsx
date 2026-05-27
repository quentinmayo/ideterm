import { useState } from 'react'
import type { Tool, ToolMode, ToolType } from '@shared/types'
import { Modal } from './Modal'
import { useToast } from './Toast'

interface ToolEditorProps {
  tool: Tool | null // null => creating a new custom tool
  onClose: () => void
  onSave: (tool: Tool) => Promise<void>
}

const TYPES: ToolType[] = ['ide', 'terminal', 'ai-agent', 'custom']

interface ModeDraft {
  id: string
  label: string
  argsText: string
  type: '' | ToolType
  launchMode: '' | NonNullable<Tool['launchMode']>
  folderArgPosition: '' | NonNullable<Tool['folderArgPosition']>
}

export function ToolEditor({ tool, onClose, onSave }: ToolEditorProps): JSX.Element {
  const toast = useToast()
  const [name, setName] = useState(tool?.name ?? '')
  const [type, setType] = useState<ToolType>(tool?.type ?? 'custom')
  const [path, setPath] = useState(tool?.path ?? '')
  const [argsText, setArgsText] = useState((tool?.args ?? []).join(' '))
  const [icon, setIcon] = useState(tool?.icon ?? '🧩')
  const [launchMode, setLaunchMode] = useState<NonNullable<Tool['launchMode']>>(
    tool?.launchMode ?? 'command'
  )
  const [folderArgPosition, setFolderArgPosition] = useState<NonNullable<Tool['folderArgPosition']>>(
    tool?.folderArgPosition ?? 'append'
  )
  const [modes, setModes] = useState<ModeDraft[]>(
    (tool?.modes ?? []).map((m) => ({
      id: m.id,
      label: m.label,
      argsText: m.args.join(' '),
      type: m.type ?? '',
      launchMode: m.launchMode ?? '',
      folderArgPosition: m.folderArgPosition ?? ''
    }))
  )

  const updateMode = (id: string, patch: Partial<ModeDraft>): void =>
    setModes((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  const addMode = (): void =>
    setModes((ms) => [
      ...ms,
      { id: crypto.randomUUID(), label: '', argsText: '', type: '', launchMode: '', folderArgPosition: '' }
    ])
  const removeMode = (id: string): void => setModes((ms) => ms.filter((m) => m.id !== id))

  const browse = async (): Promise<void> => {
    const picked = await window.api.dialog.pickExecutable()
    if (picked) setPath(picked)
  }

  const save = async (): Promise<void> => {
    if (!name.trim() || !path.trim()) {
      toast('Name and executable path are required', 'error')
      return
    }
    const builtModes: ToolMode[] = modes
      .filter((m) => m.label.trim())
      .map((m) => ({
        id: m.id,
        label: m.label.trim(),
        args: m.argsText.trim() ? m.argsText.trim().split(/\s+/) : [],
        ...(m.type ? { type: m.type } : {}),
        ...(m.launchMode ? { launchMode: m.launchMode } : {}),
        ...(m.folderArgPosition ? { folderArgPosition: m.folderArgPosition } : {})
      }))
    const next: Tool = {
      id: tool?.id ?? crypto.randomUUID(),
      name: name.trim(),
      type,
      path: path.trim(),
      args: argsText.trim() ? argsText.trim().split(/\s+/) : [],
      icon,
      builtin: tool?.builtin ?? false,
      launchMode,
      folderArgPosition,
      modes: builtModes.length ? builtModes : undefined
    }
    await onSave(next)
    onClose()
  }

  return (
    <Modal
      title={tool ? `Edit ${tool.name}` : 'Add custom tool'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Tool" />
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as ToolType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ width: 90 }}>
          <label>Icon</label>
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={3} />
        </div>
      </div>
      <div className="field">
        <label>Executable path</label>
        <div className="row">
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\\path\\to\\tool.exe or a command on PATH"
          />
          <button className="btn" onClick={() => void browse()}>
            Browse…
          </button>
        </div>
      </div>
      <div className="field">
        <label>Default arguments (space-separated)</label>
        <input
          type="text"
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          placeholder="--dangerously-skip-permissions"
        />
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Launch mode</label>
          <select
            value={launchMode}
            onChange={(e) => setLaunchMode(e.target.value as NonNullable<Tool['launchMode']>)}
          >
            <option value="external">external — own window (IDE / GUI terminal)</option>
            <option value="shell">shell — run as embedded terminal</option>
            <option value="command">command — type into embedded shell</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Folder argument</label>
          <select
            value={folderArgPosition}
            onChange={(e) =>
              setFolderArgPosition(e.target.value as NonNullable<Tool['folderArgPosition']>)
            }
          >
            <option value="append">append — exe …args folder</option>
            <option value="prepend">prepend — exe folder …args</option>
            <option value="none">none — folder is cwd only</option>
          </select>
        </div>
      </div>
      <p className="faint" style={{ fontSize: 11, lineHeight: 1.5 }}>
        Example: Claude Code as <span className="mono">claude</span>, args{' '}
        <span className="mono">--dangerously-skip-permissions</span>, mode <b>command</b>, folder{' '}
        <b>none</b>.
      </p>

      <div className="git-section-title" style={{ marginTop: 4 }}>
        <span>Configuration modes</span>
        <button className="btn sm" onClick={addMode}>
          ＋ Add mode
        </button>
      </div>
      <p className="faint" style={{ fontSize: 11, marginTop: 0 }}>
        Optional named presets. Each can override the args and even the type/launch — so one tool can
        be multi-purpose (e.g. an &ldquo;Open&rdquo; IDE mode and a &ldquo;Diff&rdquo; command mode). Leave a
        field on <i>inherit</i> to use the values above.
      </p>
      {modes.map((m) => (
        <div key={m.id} className="card" style={{ padding: 10, marginBottom: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <input
              type="text"
              value={m.label}
              placeholder="Mode label (e.g. Skip permissions)"
              onChange={(e) => updateMode(m.id, { label: e.target.value })}
              style={{ flex: 1 }}
            />
            <button className="btn sm danger" onClick={() => removeMode(m.id)}>
              Remove
            </button>
          </div>
          <input
            type="text"
            value={m.argsText}
            placeholder="args (space-separated)"
            onChange={(e) => updateMode(m.id, { argsText: e.target.value })}
            style={{ marginTop: 6 }}
          />
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <select value={m.type} onChange={(e) => updateMode(m.id, { type: e.target.value as ModeDraft['type'] })}>
              <option value="">type: inherit</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  type: {t}
                </option>
              ))}
            </select>
            <select
              value={m.launchMode}
              onChange={(e) => updateMode(m.id, { launchMode: e.target.value as ModeDraft['launchMode'] })}
            >
              <option value="">launch: inherit</option>
              <option value="external">launch: external</option>
              <option value="shell">launch: shell</option>
              <option value="command">launch: command</option>
            </select>
            <select
              value={m.folderArgPosition}
              onChange={(e) =>
                updateMode(m.id, { folderArgPosition: e.target.value as ModeDraft['folderArgPosition'] })
              }
            >
              <option value="">folder: inherit</option>
              <option value="append">folder: append</option>
              <option value="prepend">folder: prepend</option>
              <option value="none">folder: none</option>
            </select>
          </div>
        </div>
      ))}
    </Modal>
  )
}
