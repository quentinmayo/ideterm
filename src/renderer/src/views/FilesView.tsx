import { useCallback, useState } from 'react'
import { useAppState } from '../state/AppState'
import { useToast } from '../components/Toast'
import { FileTree } from '../files/FileTree'
import { FileEditor } from '../files/FileEditor'
import type { FilesTarget } from '../App'

interface OpenDoc {
  text: string
  dirty: boolean
}

export function FilesView({
  target,
  onPickTarget
}: {
  target: FilesTarget | null
  onPickTarget: (t: FilesTarget) => void
}): JSX.Element {
  const { projects } = useAppState()
  const toast = useToast()
  const [tabs, setTabs] = useState<FilesTarget[]>([])
  const [docs, setDocs] = useState<Record<string, OpenDoc>>({})
  const [active, setActive] = useState<string | null>(null)

  const openFile = useCallback(
    async (path: string, name: string) => {
      setActive(path)
      setTabs((t) => (t.some((x) => x.path === path) ? t : [...t, { path, name }]))
      if (!docs[path]) {
        try {
          const text = await window.api.fs.read(path)
          setDocs((d) => ({ ...d, [path]: { text, dirty: false } }))
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), 'error')
        }
      }
    },
    [docs, toast]
  )

  const save = useCallback(
    async (path: string) => {
      const doc = docs[path]
      if (!doc) return
      try {
        await window.api.fs.write(path, doc.text)
        setDocs((d) => ({ ...d, [path]: { ...d[path], dirty: false } }))
        toast('Saved', 'success')
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error')
      }
    },
    [docs, toast]
  )

  const closeTab = (path: string): void => {
    setTabs((t) => t.filter((x) => x.path !== path))
    setActive((cur) => {
      if (cur !== path) return cur
      const remaining = tabs.filter((x) => x.path !== path)
      return remaining.length ? remaining[remaining.length - 1].path : null
    })
  }

  if (!target) {
    const folders = projects.flatMap((p) => p.folders.map((f) => ({ ...f, project: p.name })))
    return (
      <div className="view-inner">
        <div className="page-head">
          <div>
            <h1>Files</h1>
            <div className="sub">Browse and edit files in any of your project folders.</div>
          </div>
        </div>
        {folders.length === 0 ? (
          <div className="empty">
            <div className="big">🗂</div>
            <div>Add folders to a project first, then open them here.</div>
          </div>
        ) : (
          <div className="grid">
            {folders.map((f) => (
              <div
                key={f.id}
                className="card"
                style={{ cursor: 'pointer' }}
                onClick={() => onPickTarget({ path: f.path, name: f.name })}
              >
                <strong>{f.name}</strong>
                <div className="faint" style={{ fontSize: 11 }}>
                  {f.project}
                </div>
                <div className="path mono" style={{ fontSize: 11 }}>
                  {f.path}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="files-layout">
      <FileTree root={target.path} rootName={target.name} selectedPath={active} onOpenFile={openFile} />
      <div className="editor-area">
        {tabs.length > 0 && (
          <div className="editor-tabs">
            {tabs.map((tab) => (
              <div
                key={tab.path}
                className={`editor-tab ${active === tab.path ? 'active' : ''}`}
                onClick={() => setActive(tab.path)}
              >
                {docs[tab.path]?.dirty && <span className="dirty" />}
                <span>{tab.name}</span>
                <span
                  className="icon-btn"
                  style={{ padding: 0 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.path)
                  }}
                >
                  ✕
                </span>
              </div>
            ))}
          </div>
        )}
        {active && docs[active] ? (
          <FileEditor
            key={active}
            path={active}
            initialValue={docs[active].text}
            onChange={(text) => setDocs((d) => ({ ...d, [active]: { text, dirty: true } }))}
            onSave={() => void save(active)}
          />
        ) : (
          <div className="empty" style={{ height: '100%' }}>
            <div className="big">📄</div>
            <div>Select a file from the tree. Ctrl/Cmd+S to save.</div>
          </div>
        )}
      </div>
    </div>
  )
}
