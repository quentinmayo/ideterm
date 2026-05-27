import { useEffect, useState } from 'react'
import type { Project, ProjectFolder } from '@shared/types'
import { useAppState } from '../state/AppState'
import { useSession } from '../state/Session'
import { useToast } from '../components/Toast'
import { Modal } from '../components/Modal'
import { ContextMenu, type MenuItem } from '../components/ContextMenu'
import { FolderCard } from '../components/FolderCard'
import { GitPanel } from '../components/GitPanel'
import { SubfolderPicker } from '../components/SubfolderPicker'
import type { FilesTarget } from '../App'

const COLORS = ['#6ea8fe', '#b58cff', '#4ec9a8', '#e2c08d', '#f06d6d', '#e8a55c']

function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

export function ProjectsView({ onOpenFiles }: { onOpenFiles: (t: FilesTarget) => void }): JSX.Element {
  const { tools } = useAppState()
  const { projects, saveProject, removeProject, selectedProjectId, setSelectedProjectId } = useSession()
  const toast = useToast()
  const [editing, setEditing] = useState<Project | null>(null)
  const [gitFolder, setGitFolder] = useState<{ path: string; name: string } | null>(null)
  const [subfolderTarget, setSubfolderTarget] = useState<ProjectFolder | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; project: Project } | null>(null)

  const blankProject = (): Project => ({
    id: crypto.randomUUID(),
    name: '',
    color: COLORS[0],
    icon: '📁',
    folders: [],
    createdAt: Date.now()
  })

  const projectMenu = (p: Project): MenuItem[] => [
    { icon: '✏️', label: 'Edit project…', onClick: () => setEditing(p) },
    { icon: '➕', label: 'New project', onClick: () => setEditing(blankProject()) },
    { separator: true },
    {
      icon: '🗑',
      label: 'Delete project',
      danger: true,
      onClick: () => void removeProject(p.id)
    }
  ]

  const selectedId = selectedProjectId
  const setSelectedId = setSelectedProjectId

  useEffect(() => {
    if (!selectedId && projects.length) setSelectedId(projects[0].id)
    if (selectedId && !projects.some((p) => p.id === selectedId)) {
      setSelectedId(projects[0]?.id ?? null)
    }
  }, [projects, selectedId, setSelectedId])

  const selected = projects.find((p) => p.id === selectedId) ?? null
  const ideTools = tools.filter((t) => t.type === 'ide')

  const addFolder = async (): Promise<void> => {
    if (!selected) return
    const picked = await window.api.dialog.pickFolder()
    if (!picked) return
    if (selected.folders.some((f) => f.path === picked)) {
      toast('Folder already in project', 'error')
      return
    }
    await saveProject({
      ...selected,
      folders: [...selected.folders, { id: crypto.randomUUID(), path: picked, name: baseName(picked) }]
    })
  }

  const removeFolder = async (folderId: string): Promise<void> => {
    if (!selected) return
    await saveProject({ ...selected, folders: selected.folders.filter((f) => f.id !== folderId) })
  }

  const addSubfolders = async (paths: string[], removeParent: boolean): Promise<void> => {
    if (!selected || !subfolderTarget) return
    const existing = new Set(selected.folders.map((f) => f.path))
    const additions = paths
      .filter((p) => !existing.has(p))
      .map((p) => ({ id: crypto.randomUUID(), path: p, name: baseName(p) }))
    const base = removeParent
      ? selected.folders.filter((f) => f.id !== subfolderTarget.id)
      : selected.folders
    await saveProject({ ...selected, folders: [...base, ...additions] })
    toast(`Added ${additions.length} folder${additions.length === 1 ? '' : 's'}`, 'success')
    setSubfolderTarget(null)
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <aside
        style={{
          width: 232,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          overflow: 'auto',
          padding: 12
        }}
      >
        <div className="row" style={{ marginBottom: 10 }}>
          <strong style={{ flex: 1 }}>Projects</strong>
          <button className="icon-btn" title="New project" onClick={() => setEditing(blankProject())}>
            ＋
          </button>
        </div>
        {projects.map((p) => (
          <div
            key={p.id}
            className={`project-list-item ${p.id === selectedId ? 'active' : ''}`}
            onClick={() => setSelectedId(p.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, project: p })
            }}
            title="Right-click for project actions"
          >
            {p.icon ? (
              <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>{p.icon}</span>
            ) : (
              <span className="dot" style={{ background: p.color ?? COLORS[0] }} />
            )}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name || 'Untitled'}
            </span>
            <span className="faint" style={{ fontSize: 11 }}>
              {p.folders.length}
            </span>
          </div>
        ))}
        {projects.length === 0 && <div className="faint" style={{ fontSize: 12, padding: 8 }}>No projects yet.</div>}
      </aside>

      <main style={{ flex: 1, overflow: 'auto' }}>
        {!selected ? (
          <div className="empty">
            <div className="big">📁</div>
            <div>Create a project, then add the folders you work across.</div>
            <button className="btn primary" onClick={() => setEditing(blankProject())}>
              ＋ New project
            </button>
          </div>
        ) : (
          <div className="view-inner">
            <div className="page-head">
              <div className="row">
                {selected.icon ? (
                  <span style={{ fontSize: 20 }}>{selected.icon}</span>
                ) : (
                  <span className="dot" style={{ background: selected.color ?? COLORS[0], width: 12, height: 12 }} />
                )}
                <h1 style={{ margin: 0 }}>{selected.name || 'Untitled'}</h1>
                <span className="muted">· {selected.folders.length} folders</span>
              </div>
              <div className="row">
                <button className="btn" onClick={() => setEditing(selected)}>
                  Edit
                </button>
                <button className="btn primary" onClick={() => void addFolder()}>
                  ＋ Add folder
                </button>
              </div>
            </div>

            {selected.folders.length === 0 ? (
              <div className="card muted">No folders yet — click “Add folder”.</div>
            ) : (
              <div className="grid">
                {selected.folders.map((f) => (
                  <FolderCard
                    key={f.id}
                    folder={f}
                    onOpenGit={() => setGitFolder({ path: f.path, name: f.name })}
                    onOpenFiles={() => onOpenFiles({ path: f.path, name: f.name })}
                    onAddSubfolders={() => setSubfolderTarget(f)}
                    onRemove={() => void removeFolder(f.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {editing && (
        <ProjectEditor
          project={editing}
          onClose={() => setEditing(null)}
          onSave={async (p) => {
            await saveProject(p)
            setSelectedId(p.id)
            setEditing(null)
          }}
          onDelete={
            projects.some((p) => p.id === editing.id)
              ? async () => {
                  await removeProject(editing.id)
                  setEditing(null)
                }
              : undefined
          }
        />
      )}

      {gitFolder && (
        <GitPanel
          folderPath={gitFolder.path}
          folderName={gitFolder.name}
          ideTools={ideTools}
          onClose={() => setGitFolder(null)}
        />
      )}

      {subfolderTarget && selected && (
        <SubfolderPicker
          parentPath={subfolderTarget.path}
          parentName={subfolderTarget.name}
          existingPaths={selected.folders.map((f) => f.path)}
          onClose={() => setSubfolderTarget(null)}
          onConfirm={(paths, removeParent) => void addSubfolders(paths, removeParent)}
        />
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={projectMenu(menu.project)} onClose={() => setMenu(null)} />}
    </div>
  )
}

function ProjectEditor({
  project,
  onClose,
  onSave,
  onDelete
}: {
  project: Project
  onClose: () => void
  onSave: (p: Project) => Promise<void>
  onDelete?: () => Promise<void>
}): JSX.Element {
  const [name, setName] = useState(project.name)
  const [color, setColor] = useState(project.color ?? COLORS[0])
  const [icon, setIcon] = useState(project.icon ?? '📁')

  return (
    <Modal
      title={project.name ? `Edit ${project.name}` : 'New project'}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button className="btn danger" onClick={() => void onDelete()}>
              Delete
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => void onSave({ ...project, name: name.trim() || 'Untitled', color, icon })}
          >
            Save
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Project name</label>
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Mayo ASPM" />
        </div>
        <div className="field" style={{ width: 80 }}>
          <label>Icon</label>
          <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={3} />
        </div>
      </div>
      <div className="field">
        <label>Color</label>
        <div className="row">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: c,
                border: color === c ? '2px solid white' : '2px solid transparent',
                cursor: 'pointer'
              }}
            />
          ))}
        </div>
      </div>
    </Modal>
  )
}
