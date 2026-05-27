import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label?: string
  icon?: string
  onClick?: () => void
  danger?: boolean
  separator?: boolean
  header?: string
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, window.innerWidth - rect.width - 8),
      y: Math.min(y, window.innerHeight - rect.height - 8)
    })
  }, [x, y])

  useEffect(() => {
    const close = (): void => onClose()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      className="ctx-menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="ctx-sep" />
        if (item.header)
          return (
            <div key={i} className="ctx-label">
              {item.header}
            </div>
          )
        return (
          <div
            key={i}
            className="ctx-item"
            style={item.disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
            onClick={() => {
              item.onClick?.()
              onClose()
            }}
          >
            <span className="ic">{item.icon ?? ''}</span>
            <span style={item.danger ? { color: 'var(--red)' } : undefined}>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}
