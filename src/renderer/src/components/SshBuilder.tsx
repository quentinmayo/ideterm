import { useEffect, useState } from 'react'
import type { SshBuildResult, SshConfig } from '@shared/types'
import { Modal } from './Modal'
import { useAppState } from '../state/AppState'
import { useTerminals } from '../state/Terminals'
import { useToast } from './Toast'

export function SshBuilder({ onClose }: { onClose: () => void }): JSX.Element {
  const toast = useToast()
  const { saveCommand } = useAppState()
  const terminals = useTerminals()
  const [config, setConfig] = useState<SshConfig>({ host: '', user: '', port: 22, forwardAgent: false })
  const [result, setResult] = useState<SshBuildResult>({ command: 'ssh <host>', warnings: [] })

  useEffect(() => {
    let cancelled = false
    void window.api.ssh.build(config).then((r) => {
      if (!cancelled) setResult(r)
    })
    return () => {
      cancelled = true
    }
  }, [config])

  const set = <K extends keyof SshConfig>(key: K, value: SshConfig[K]): void =>
    setConfig((c) => ({ ...c, [key]: value }))

  const browseKey = async (): Promise<void> => {
    const picked = await window.api.dialog.pickExecutable()
    if (picked) set('identityFile', picked)
  }

  const runInTerminal = (): void => {
    if (!config.host.trim()) {
      toast('Host is required', 'error')
      return
    }
    void terminals.newTerminal({ initialCommand: result.command, title: `ssh ${config.host}` })
    onClose()
  }

  const saveAsCommand = async (): Promise<void> => {
    if (!config.host.trim()) {
      toast('Host is required', 'error')
      return
    }
    await saveCommand({
      id: crypto.randomUUID(),
      label: `SSH: ${config.user ? `${config.user}@` : ''}${config.host}`,
      command: result.command
    })
    toast('Saved as a reusable command', 'success')
    onClose()
  }

  return (
    <Modal
      title="SSH command builder"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={() => void saveAsCommand()}>
            Save as command
          </button>
          <button className="btn primary" onClick={runInTerminal}>
            Run in terminal
          </button>
        </>
      }
    >
      <div className="warn-banner">
        ⚠️ This opens an interactive SSH session in a <b>local embedded terminal only</b>. Your IDEs,
        agents, and the file tree keep operating on this machine — they are <b>not</b> connected to the
        remote host.
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 2 }}>
          <label>Host</label>
          <input
            type="text"
            value={config.host}
            onChange={(e) => set('host', e.target.value)}
            placeholder="example.com or 10.0.0.5"
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>User</label>
          <input type="text" value={config.user ?? ''} onChange={(e) => set('user', e.target.value)} />
        </div>
        <div className="field" style={{ width: 90 }}>
          <label>Port</label>
          <input
            type="number"
            value={config.port ?? 22}
            onChange={(e) => set('port', Number(e.target.value) || 22)}
          />
        </div>
      </div>

      <div className="field">
        <label>Identity file (optional)</label>
        <div className="row">
          <input
            type="text"
            value={config.identityFile ?? ''}
            onChange={(e) => set('identityFile', e.target.value)}
            placeholder="~/.ssh/id_ed25519"
          />
          <button className="btn" onClick={() => void browseKey()}>
            Browse…
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Extra flags (optional)</label>
          <input
            type="text"
            value={config.extraFlags ?? ''}
            onChange={(e) => set('extraFlags', e.target.value)}
            placeholder="-o StrictHostKeyChecking=accept-new"
          />
        </div>
        <label className="row" style={{ alignItems: 'center', gap: 6, marginTop: 18 }}>
          <input
            type="checkbox"
            checked={!!config.forwardAgent}
            onChange={(e) => set('forwardAgent', e.target.checked)}
            style={{ width: 'auto' }}
          />
          Forward agent (-A)
        </label>
      </div>

      <div className="field">
        <label>Remote command (optional)</label>
        <input
          type="text"
          value={config.remoteCommand ?? ''}
          onChange={(e) => set('remoteCommand', e.target.value)}
          placeholder="docker ps"
        />
      </div>

      <div className="field">
        <label>Generated command</label>
        <div className="diff-view" style={{ whiteSpace: 'pre-wrap' }}>
          {result.command}
        </div>
      </div>
      {result.warnings.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--yellow)', fontSize: 12 }}>
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
