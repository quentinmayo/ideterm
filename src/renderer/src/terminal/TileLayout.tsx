import { Fragment, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { useTerminals, type TileNode } from '../state/Terminals'
import { TerminalView } from './TerminalView'

function leafCount(node: TileNode): number {
  return node.kind === 'leaf' ? 1 : node.children.reduce((count, child) => count + leafCount(child), 0)
}

export function TileLayout({ node }: { node: TileNode }): JSX.Element {
  if (node.kind === 'leaf') return <TermPane sessionId={node.sessionId} />
  return (
    <PanelGroup key={node.children.map((child) => child.id).join(':')} id={node.id} direction={node.dir === 'row' ? 'horizontal' : 'vertical'}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <PanelResizeHandle className="resize-handle" />}
          <Panel id={child.id} order={i} minSize={8} defaultSize={100 * leafCount(child) / leafCount(node)}>
            <TileLayout node={child} />
          </Panel>
        </Fragment>
      ))}
    </PanelGroup>
  )
}

function TermPane({ sessionId }: { sessionId: string }): JSX.Element {
  const t = useTerminals()
  const session = t.sessions[sessionId]
  const active = t.activeSessionId === sessionId
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')

  const commit = (): void => {
    if (name.trim()) void t.renameSession(sessionId, name.trim())
    setEditing(false)
  }

  return (
    <div
      className={`term-pane ${active ? 'active' : ''}`}
      onMouseDown={() => t.setActiveSession(sessionId)}
    >
      <div className="term-pane-head">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            style={{ flex: 1, padding: '1px 4px', fontSize: 11 }}
          />
        ) : (
          <span
            className="term-pane-title"
            title="Double-click to rename"
            onDoubleClick={() => {
              setName(session?.title ?? '')
              setEditing(true)
            }}
          >
            {session?.title ?? 'terminal'}
            {session && !session.alive ? ' · exited' : ''}
          </span>
        )}
        <button className="icon-btn" title="Split right" onClick={() => void t.splitActive('row')}>
          ▥
        </button>
        <button className="icon-btn" title="Split down" onClick={() => void t.splitActive('col')}>
          ▤
        </button>
        <button className="icon-btn" title="Pop out (float)" onClick={() => t.floatSession(sessionId)}>
          ⧉
        </button>
        <button className="icon-btn" title="Restart" onClick={() => void t.restartSession(sessionId)}>
          ⟳
        </button>
        <button className="icon-btn" title="Close" onClick={() => t.closeSession(sessionId)}>
          ✕
        </button>
      </div>
      <TerminalView sessionId={sessionId} />
    </div>
  )
}
