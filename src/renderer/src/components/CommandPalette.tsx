import { useMemo, useState } from 'react'
import { Modal } from './Modal'

export interface PaletteItem {
  id: string
  label: string
  hint?: string
  icon?: string
}

interface CommandPaletteProps {
  title: string
  placeholder?: string
  items: PaletteItem[]
  onPick: (id: string) => void
  onClose: () => void
}

export function CommandPalette({ title, placeholder, items, onPick, onClose }: CommandPaletteProps): JSX.Element {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim()
    if (!needle) return items
    return items.filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(needle))
  }, [q, items])

  const pick = (id: string): void => {
    onPick(id)
    onClose()
  }

  return (
    <Modal title={title} onClose={onClose} width={560}>
      <input
        type="text"
        autoFocus
        value={q}
        placeholder={placeholder ?? 'Type to filter…'}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtered[0]) pick(filtered[0].id)
        }}
      />
      <div style={{ maxHeight: 360, overflow: 'auto', marginTop: 10 }}>
        {filtered.length === 0 ? (
          <div className="muted" style={{ padding: 10, fontSize: 12 }}>
            No matches.
          </div>
        ) : (
          filtered.map((i) => (
            <div key={i.id} className="project-list-item" onClick={() => pick(i.id)} title={i.hint}>
              {i.icon && <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{i.icon}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</div>
                {i.hint && (
                  <div className="mono faint" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.hint}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
