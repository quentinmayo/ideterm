import { useState } from 'react'
import type { Tool, ToolType } from '@shared/types'
import { Modal } from './Modal'
import { useToast } from './Toast'

interface ToolEditorProps {
  tool: Tool | null // null => creating a new custom tool
  onClose: () => void
  onSave: (tool: Tool) => Promise<void>
}

const TYPES: ToolType[] = ['ide', 'terminal', 'ai-agent', 'custom']

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

  const browse = async (): Promise<void> => {
    const picked = await window.api.dialog.pickExecutable()
    if (picked) setPath(picked)
  }

  const save = async (): Promise<void> => {
    if (!name.trim() || !path.trim()) {
      toast('Name and executable path are required', 'error')
      return
    }
    const next: Tool = {
      id: tool?.id ?? crypto.randomUUID(),
      name: name.trim(),
      type,
      path: path.trim(),
      args: argsText.trim() ? argsText.trim().split(/\s+/) : [],
      icon,
      builtin: tool?.builtin ?? false,
      launchMode,
      folderArgPosition
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
    </Modal>
  )
}
