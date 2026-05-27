import { useState } from 'react'
import type { Tool } from '@shared/types'
import { useAppState } from '../state/AppState'
import { useTerminals } from '../state/Terminals'
import { useToast } from '../components/Toast'
import { ToolEditor } from '../components/ToolEditor'
import { SshBuilder } from '../components/SshBuilder'

export function ToolsView(): JSX.Element {
  const { tools, saveTool, removeTool, reloadTools } = useAppState()
  const terminals = useTerminals()
  const toast = useToast()
  const [editing, setEditing] = useState<Tool | null>(null)
  const [creating, setCreating] = useState(false)
  const [showSsh, setShowSsh] = useState(false)

  const run = async (tool: Tool): Promise<void> => {
    const res = await window.api.launch.tool(tool.id)
    if (!res.ok) toast(res.message, 'error')
    else if (res.kind === 'terminal' && res.session) terminals.adoptSession(res.session)
    else toast(res.message, 'success')
  }

  return (
    <div className="view-inner">
      <div className="page-head">
        <div>
          <h1>Tools</h1>
          <div className="sub">Detected tools plus anything you point IdeTerm at — executable + flags.</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => void reloadTools()}>
            ↻ Re-detect
          </button>
          <button className="btn" onClick={() => setShowSsh(true)}>
            🔐 SSH builder
          </button>
          <button className="btn primary" onClick={() => setCreating(true)}>
            ＋ Add tool
          </button>
        </div>
      </div>

      <div className="grid">
        {tools.map((tool) => (
          <div key={tool.id} className="card tool-card">
            <div className="tool-icon">{tool.icon ?? '🧩'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row">
                <strong>{tool.name}</strong>
                <span className="tag-type">{tool.type}</span>
                {tool.builtin && <span className="badge accent">detected</span>}
              </div>
              <div className="path mono" style={{ fontSize: 11, color: 'var(--text-faint)', wordBreak: 'break-all' }}>
                {tool.path} {tool.args.join(' ')}
              </div>
            </div>
            <div className="row">
              <button className="btn sm" title="Test launch" onClick={() => void run(tool)}>
                Run
              </button>
              <button className="btn sm" onClick={() => setEditing(tool)}>
                Edit
              </button>
              <button
                className="btn sm danger"
                title={tool.builtin ? 'Reset to detected defaults' : 'Delete'}
                onClick={() => void removeTool(tool.id)}
              >
                {tool.builtin ? 'Reset' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {tools.length === 0 && (
        <div className="empty">
          <div className="big">🧰</div>
          <div>No tools detected. Add one manually.</div>
        </div>
      )}

      {(editing || creating) && (
        <ToolEditor
          tool={editing}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSave={saveTool}
        />
      )}
      {showSsh && <SshBuilder onClose={() => setShowSsh(false)} />}
    </div>
  )
}
