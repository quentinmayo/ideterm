import { useState } from 'react'
import type { SearchFileResult } from '@shared/types'
import { Modal } from './Modal'
import { useToast } from './Toast'

interface FindReplacePanelProps {
  dir: string
  dirName: string
  onOpenFile: (path: string, name: string) => void
  onClose: () => void
}

export function FindReplacePanel({ dir, dirName, onOpenFile, onClose }: FindReplacePanelProps): JSX.Element {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [regex, setRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<SearchFileResult[] | null>(null)
  const [busy, setBusy] = useState(false)

  const opts = { regex, caseSensitive }
  const totalMatches = (results ?? []).reduce((n, r) => n + r.matches.length, 0)

  const runSearch = async (): Promise<void> => {
    if (!query.trim()) return
    setBusy(true)
    try {
      setResults(await window.api.fs.search(dir, query, opts))
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const replaceAll = async (): Promise<void> => {
    if (!query.trim()) return
    if (!window.confirm(`Replace all "${query}" with "${replacement}" across ${dirName}? This edits files on disk.`)) {
      return
    }
    setBusy(true)
    try {
      const r = await window.api.fs.replace(dir, query, replacement, opts)
      toast(`Replaced ${r.replacements} occurrence(s) in ${r.filesChanged} file(s)`, 'success')
      await runSearch()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Find & replace in ${dirName}`}
      onClose={onClose}
      width={680}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn" disabled={busy || !query.trim()} onClick={() => void runSearch()}>
            🔎 Search
          </button>
          <button className="btn primary" disabled={busy || !query.trim()} onClick={() => void replaceAll()}>
            Replace all
          </button>
        </>
      }
    >
      <div className="field">
        <label>Find</label>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
          placeholder="text or pattern"
        />
      </div>
      <div className="field">
        <label>Replace with</label>
        <input type="text" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 16, marginBottom: 8 }}>
        <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} style={{ width: 'auto' }} />
          <span style={{ fontSize: 12 }}>Regex</span>
        </label>
        <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span style={{ fontSize: 12 }}>Case sensitive</span>
        </label>
      </div>

      {results !== null && (
        <>
          <div className="git-section-title">
            <span>
              {totalMatches} match(es) in {results.length} file(s)
            </span>
          </div>
          <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            {results.length === 0 ? (
              <div className="muted" style={{ padding: 10, fontSize: 12 }}>
                No matches{busy ? ' (searching…)' : ''}.
              </div>
            ) : (
              results.map((r) => (
                <div key={r.path} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                  <div
                    className="mono"
                    style={{ fontSize: 12, cursor: 'pointer', color: 'var(--accent)' }}
                    onClick={() => onOpenFile(r.path, r.relative.split(/[\\/]/).pop() ?? r.relative)}
                  >
                    {r.relative} <span className="faint">· {r.matches.length}</span>
                  </div>
                  {r.matches.slice(0, 5).map((m, i) => (
                    <div key={i} className="mono faint" style={{ fontSize: 11, whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.line}: {m.text}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Modal>
  )
}
