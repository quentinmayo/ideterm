import { useEffect, useMemo, useState } from 'react'
import type { FileEntry } from '@shared/types'
import { Modal } from './Modal'
import { useToast } from './Toast'

interface SubfolderPickerProps {
  parentPath: string
  parentName: string
  /** Folder paths already in the project (shown as already added). */
  existingPaths: string[]
  onClose: () => void
  onConfirm: (selectedPaths: string[], removeParent: boolean) => void
}

export function SubfolderPicker({
  parentPath,
  parentName,
  existingPaths,
  onClose,
  onConfirm
}: SubfolderPickerProps): JSX.Element {
  const toast = useToast()
  const existing = useMemo(() => new Set(existingPaths), [existingPaths])
  const [subdirs, setSubdirs] = useState<FileEntry[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [removeParent, setRemoveParent] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.fs
      .list(parentPath)
      .then((entries) => {
        if (cancelled) return
        const dirs = entries.filter((e) => e.kind === 'directory')
        setSubdirs(dirs)
        setSelected(new Set(dirs.filter((d) => !existing.has(d.path)).map((d) => d.path)))
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : String(err), 'error')
        setSubdirs([])
      })
    return () => {
      cancelled = true
    }
  }, [parentPath, existing, toast])

  const selectable = (subdirs ?? []).filter((d) => !existing.has(d.path))
  const toggle = (p: string): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })

  return (
    <Modal
      title={`Break “${parentName}” into subfolders`}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected], removeParent)}
          >
            Add {selected.size} folder{selected.size === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
        Pick which immediate subfolders of <span className="mono">{parentName}</span> to add as
        their own entries.
      </p>

      <div className="row" style={{ marginBottom: 8 }}>
        <button className="btn sm" disabled={!selectable.length} onClick={() => setSelected(new Set(selectable.map((d) => d.path)))}>
          Select all
        </button>
        <button className="btn sm" disabled={!selected.size} onClick={() => setSelected(new Set())}>
          Select none
        </button>
        <div className="spacer" />
        <span className="faint" style={{ fontSize: 11 }}>
          {selected.size} / {selectable.length} selected
        </span>
      </div>

      <div
        style={{
          maxHeight: 320,
          overflow: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)'
        }}
      >
        {subdirs === null ? (
          <div className="muted" style={{ padding: 12 }}>
            Scanning…
          </div>
        ) : subdirs.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>
            No subfolders found in this folder.
          </div>
        ) : (
          subdirs.map((d) => {
            const already = existing.has(d.path)
            return (
              <label
                key={d.path}
                className="git-file"
                style={{ opacity: already ? 0.5 : 1, cursor: already ? 'default' : 'pointer' }}
              >
                <input
                  type="checkbox"
                  disabled={already}
                  checked={already || selected.has(d.path)}
                  onChange={() => toggle(d.path)}
                  style={{ width: 'auto' }}
                />
                <span style={{ flex: 1 }}>{d.name}</span>
                {already && <span className="faint" style={{ fontSize: 11 }}>already added</span>}
              </label>
            )
          })
        )}
      </div>

      <label className="row" style={{ gap: 8, marginTop: 14, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={removeParent}
          onChange={(e) => setRemoveParent(e.target.checked)}
          style={{ width: 'auto' }}
        />
        <span>
          Remove <span className="mono">{parentName}</span> from the project (keep only the selected
          subfolders)
        </span>
      </label>
    </Modal>
  )
}
