import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../state/Session'
import { useAppState } from '../state/AppState'
import { useLauncher } from '../util/launch'
import { useToast } from '../components/Toast'
import { CommandPalette, type PaletteItem } from '../components/CommandPalette'
import { FindReplacePanel } from '../components/FindReplacePanel'
import { FileTree } from '../files/FileTree'
import { FileEditor } from '../files/FileEditor'

interface OpenDoc {
  text: string
  dirty: boolean
}

export function FilesView(): JSX.Element {
  const { projects, filesTarget: target, openFiles, setFilesTarget, addOpenFile, removeOpenFile } = useSession()
  const { tools } = useAppState()
  const launcher = useLauncher()
  const toast = useToast()
  const [docs, setDocs] = useState<Record<string, OpenDoc>>({})
  const [active, setActive] = useState<string | null>(null)
  const [palette, setPalette] = useState<'tool' | 'folder' | null>(null)
  const [findOpen, setFindOpen] = useState(false)

  const loadDoc = useCallback(
    async (path: string) => {
      try {
        const text = await window.api.fs.read(path)
        setDocs((d) => ({ ...d, [path]: { text, dirty: false } }))
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error')
      }
    },
    [toast]
  )

  const openFile = useCallback(
    (path: string, name: string) => {
      setActive(path)
      addOpenFile({ path, name })
      if (!docs[path]) void loadDoc(path)
    },
    [docs, addOpenFile, loadDoc]
  )

  // After a restore, default the active tab and lazily load its content.
  useEffect(() => {
    if (!active && openFiles.length) setActive(openFiles[openFiles.length - 1].path)
  }, [openFiles, active])
  useEffect(() => {
    if (active && !docs[active]) void loadDoc(active)
  }, [active, docs, loadDoc])

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
    removeOpenFile(path)
    setActive((cur) => {
      if (cur !== path) return cur
      const remaining = openFiles.filter((x) => x.path !== path)
      return remaining.length ? remaining[remaining.length - 1].path : null
    })
  }

  // Quick-action palettes: launch a tool here, or jump to another folder.
  const toolItems: PaletteItem[] = tools.flatMap((t) =>
    t.modes?.length
      ? t.modes.map((m) => ({ id: `${t.id}@@${m.id}`, label: `${t.name} · ${m.label}`, hint: t.path, icon: t.icon }))
      : [{ id: t.id, label: t.name, hint: `${t.type} · ${t.path}`, icon: t.icon }]
  )
  const folderItems: PaletteItem[] = projects.flatMap((p) =>
    p.folders.map((f) => ({ id: f.path, label: f.name, hint: `${p.name} · ${f.path}`, icon: p.icon ?? '📁' }))
  )

  const launchTool = async (encodedId: string): Promise<void> => {
    if (!target) return
    const [toolId, modeId] = encodedId.split('@@')
    await launcher.launchTool(toolId, target.path, modeId)
  }
  const switchFolder = (path: string): void => {
    const found = projects.flatMap((p) => p.folders).find((f) => f.path === path)
    if (found) setFilesTarget({ path: found.path, name: found.name })
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
                onClick={() => setFilesTarget({ path: f.path, name: f.name })}
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
        <div className="quick-actions">
          <button className="btn sm" title="Launch a tool in this folder" onClick={() => setPalette('tool')}>
            ⚡ Run tool…
          </button>
          <button className="btn sm" title="Switch to another folder" onClick={() => setPalette('folder')}>
            📁 {target.name} ▾
          </button>
          <button className="btn sm" title="Find & replace in this folder" onClick={() => setFindOpen(true)}>
            🔎 Find / replace…
          </button>
          <div className="spacer" />
          <button className="icon-btn" title="Reveal folder in OS explorer" onClick={() => void window.api.fs.reveal(target.path)}>
            📂
          </button>
        </div>
        <div className="editor-tabs">
          <div className="editor-tab" onClick={() => setFilesTarget(null)} title="Back to folder list">
            ‹ Folders
          </div>
          {openFiles.map((tab) => (
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

      {palette === 'tool' && (
        <CommandPalette
          title="Run a tool in this folder"
          placeholder="Search tools…"
          items={toolItems}
          onPick={(id) => void launchTool(id)}
          onClose={() => setPalette(null)}
        />
      )}
      {palette === 'folder' && (
        <CommandPalette
          title="Switch folder"
          placeholder="Search folders…"
          items={folderItems}
          onPick={switchFolder}
          onClose={() => setPalette(null)}
        />
      )}
      {findOpen && (
        <FindReplacePanel
          dir={target.path}
          dirName={target.name}
          onOpenFile={openFile}
          onClose={() => setFindOpen(false)}
        />
      )}
    </div>
  )
}
