import { useState } from 'react'
import type { FavCommand, Tool } from '@shared/types'
import { Modal } from './Modal'
import { useToast } from './Toast'

interface FavCommandWizardProps {
  fav: FavCommand | null // null => creating
  tools: Tool[]
  defaultCwd?: string
  onClose: () => void
  onSave: (fav: FavCommand) => Promise<void>
}

export function FavCommandWizard({ fav, tools, defaultCwd, onClose, onSave }: FavCommandWizardProps): JSX.Element {
  const toast = useToast()
  // Editing jumps straight to the details step.
  const [step, setStep] = useState<1 | 2>(fav ? 2 : 1)
  const [label, setLabel] = useState(fav?.label ?? '')
  const [icon, setIcon] = useState(fav?.icon ?? '⭐')
  const [cwd, setCwd] = useState(fav?.cwd ?? defaultCwd ?? '')
  const [command, setCommand] = useState(fav?.command ?? '')
  const [target, setTarget] = useState<'embedded' | 'external'>(fav?.target ?? 'embedded')

  const fromTool = (t: Tool): void => {
    setLabel(t.name)
    setIcon(t.icon ?? '⭐')
    setCommand([t.path, ...t.args].join(' '))
    setTarget(t.launchMode === 'external' ? 'external' : 'embedded')
    setStep(2)
  }

  const browse = async (): Promise<void> => {
    const dir = await window.api.dialog.pickFolder()
    if (dir) setCwd(dir)
  }

  const save = async (): Promise<void> => {
    if (!label.trim() || !command.trim() || !cwd.trim()) {
      toast('Label, path, and command are all required', 'error')
      return
    }
    await onSave({
      id: fav?.id ?? crypto.randomUUID(),
      label: label.trim(),
      icon,
      cwd: cwd.trim(),
      command: command.trim(),
      target
    })
    onClose()
  }

  if (step === 1) {
    return (
      <Modal title="New favorite command" onClose={onClose} width={560}>
        <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
          Start from a tool you already have — we&apos;ll prefill the command — or build one from scratch.
        </p>
        <div className="git-section-title">
          <span>From a tool</span>
        </div>
        <div style={{ maxHeight: 280, overflow: 'auto' }}>
          {tools.map((t) => (
            <div key={t.id} className="project-list-item" onClick={() => fromTool(t)}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{t.icon ?? '🧩'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{t.name}</div>
                <div className="mono faint" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.path} {t.args.join(' ')}
                </div>
              </div>
              <span className="tag-type">{t.type}</span>
            </div>
          ))}
          {tools.length === 0 && <div className="muted" style={{ padding: 10, fontSize: 12 }}>No tools detected.</div>}
        </div>
        <div className="modal-foot" style={{ padding: '14px 0 0', borderTop: 'none' }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => setStep(2)}>
            Start blank →
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={fav ? `Edit ${fav.label}` : 'New favorite command'}
      onClose={onClose}
      footer={
        <>
          {!fav && (
            <button className="btn" onClick={() => setStep(1)}>
              ← Back
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void save()}>
            Save favorite
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Label</label>
          <input type="text" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Claude on backend" />
        </div>
        <div className="field" style={{ width: 80 }}>
          <label>Icon</label>
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={3} />
        </div>
      </div>
      <div className="field">
        <label>Path (working directory)</label>
        <div className="row">
          <input type="text" value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="C:\\dev\\backend" />
          <button className="btn" onClick={() => void browse()}>
            Browse…
          </button>
        </div>
      </div>
      <div className="field">
        <label>Command</label>
        <input type="text" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="claude --dangerously-skip-permissions" />
      </div>
      <div className="field">
        <label>Run in</label>
        <div className="row" style={{ gap: 16 }}>
          <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
            <input type="radio" checked={target === 'embedded'} onChange={() => setTarget('embedded')} style={{ width: 'auto' }} />
            <span>Embedded terminal (inside IdeTerm)</span>
          </label>
          <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
            <input type="radio" checked={target === 'external'} onChange={() => setTarget('external')} style={{ width: 'auto' }} />
            <span>External terminal window</span>
          </label>
        </div>
      </div>
    </Modal>
  )
}
