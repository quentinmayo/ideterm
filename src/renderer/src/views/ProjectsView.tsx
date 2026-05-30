import { useEffect, useState, type CSSProperties } from 'react'
import type { Project, ProjectFolder } from '@shared/types'
import { useAppState } from '../state/AppState'
import { useSession } from '../state/Session'
import { useTerminals } from '../state/Terminals'
import { useLauncher } from '../util/launch'
import { useToast } from '../components/Toast'
import { Modal } from '../components/Modal'
import { ContextMenu, type MenuItem } from '../components/ContextMenu'
import { FolderCard } from '../components/FolderCard'
import { GitPanel } from '../components/GitPanel'
import { SubfolderPicker } from '../components/SubfolderPicker'
import type { FilesTarget } from '../App'

const COLORS = ['#6ea8fe', '#b58cff', '#4ec9a8', '#e2c08d', '#f06d6d', '#e8a55c']
const PROJECTS_SORT_KEY = 'ideterm.projects.sort'
type ProjectSort = 'recent' | 'name' | 'created'

function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

export function ProjectsView({ onOpenFiles }: { onOpenFiles: (t: FilesTarget) => void }): JSX.Element {
  const { tools } = useAppState()
  const { projects, saveProject, removeProject, selectedProjectId, setSelectedProjectId } = useSession()
  const terminals = useTerminals()
  const launcher = useLauncher()
  const toast = useToast()
  const [editing, setEditing] = useState<Project | null>(null)
  const [gitFolder, setGitFolder] = useState<{ path: string; name: string } | null>(null)
  const [subfolderTarget, setSubfolderTarget] = useState<ProjectFolder | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [globalFolderQuery, setGlobalFolderQuery] = useState('')
  const [sort, setSort] = useState<ProjectSort>(() => {
    try {
      const stored = window.localStorage.getItem(PROJECTS_SORT_KEY)
      return stored === 'name' || stored === 'created' || stored === 'recent' ? stored : 'recent'
    } catch {
      return 'recent'
    }
  })

  const blankProject = (): Project => ({
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    id: crypto.randomUUID(),
    name: '',
    color: COLORS[0],
    icon: '📁',
    folders: []
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
  const sidebarMenu = (): MenuItem[] => [{ icon: '➕', label: 'New project', onClick: () => setEditing(blankProject()) }]

  const selectedId = selectedProjectId
  const setSelectedId = setSelectedProjectId
  const sortedProjects = [...projects].sort((a, b) => {
    if (sort === 'name') return (a.name || 'Untitled').localeCompare(b.name || 'Untitled')
    if (sort === 'created') return b.createdAt - a.createdAt
    const aRecent = a.lastAccessedAt ?? a.createdAt
    const bRecent = b.lastAccessedAt ?? b.createdAt
    return bRecent - aRecent
  })
  const q = globalFolderQuery.trim().toLowerCase()
  const globalFolderHits = projects
    .flatMap((project) =>
      project.folders.map((folder) => ({
        project,
        folder
      }))
    )
    .filter(({ project, folder }) => {
      if (!q) return false
      return (
        folder.name.toLowerCase().includes(q) ||
        folder.path.toLowerCase().includes(q) ||
        (project.name || 'untitled').toLowerCase().includes(q)
      )
    })

  useEffect(() => {
    if (!selectedId && sortedProjects.length) setSelectedId(sortedProjects[0].id)
    if (selectedId && !projects.some((p) => p.id === selectedId)) {
      setSelectedId(sortedProjects[0]?.id ?? null)
    }
  }, [projects, selectedId, setSelectedId, sortedProjects])

  useEffect(() => {
    try {
      window.localStorage.setItem(PROJECTS_SORT_KEY, sort)
    } catch {
      /* ignore storage errors */
    }
  }, [sort])

  const selected = projects.find((p) => p.id === selectedId) ?? null
  const ideTools = tools.filter((t) => t.type === 'ide')
  const runnableTools = tools.filter((t) => t.type === 'terminal' || t.type === 'ai-agent' || t.type === 'custom')

  const selectProject = (p: Project): void => {
    setSelectedId(p.id)
    const now = Date.now()
    const current = p.lastAccessedAt ?? 0
    // Skip noisy updates if this project was just touched.
    if (now - current < 1_000) return
    void saveProject({ ...p, lastAccessedAt: now })
  }

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

  const openFolderFromGlobalSearch = (project: Project, folder: ProjectFolder): void => {
    selectProject(project)
    onOpenFiles({ path: folder.path, name: folder.name })
  }

  const toolMenuItemsForFolder = (folderPath: string, kind: 'ide' | 'run'): MenuItem[] => {
    const set = kind === 'ide' ? ideTools : runnableTools
    if (!set.length) return [{ label: kind === 'ide' ? 'No IDE tools configured' : 'No runnable tools configured', disabled: true }]
    const items: MenuItem[] = []
    for (const tool of set) {
      if (tool.modes?.length) {
        items.push({ header: tool.name })
        for (const mode of tool.modes) {
          items.push({
            icon: tool.icon,
            label: mode.label,
            onClick: () => void launcher.launchTool(tool.id, folderPath, mode.id)
          })
        }
        items.push({ separator: true })
      } else {
        items.push({
          icon: tool.icon,
          label: tool.name,
          onClick: () => void launcher.launchTool(tool.id, folderPath)
        })
      }
    }
    if (items[items.length - 1]?.separator) items.pop()
    return items
  }

  const renderGlobalSearch = (extraStyle?: CSSProperties): JSX.Element => (
    <div className="projects-global-search card" style={extraStyle}>
      <div className="muted" style={{ marginBottom: 6 }}>
        Global folder search
      </div>
      <input
        className="projects-global-search-input"
        type="text"
        value={globalFolderQuery}
        onChange={(e) => setGlobalFolderQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && globalFolderHits[0]) {
            openFolderFromGlobalSearch(globalFolderHits[0].project, globalFolderHits[0].folder)
          }
        }}
        placeholder="Search folders across all projects…"
      />
      {globalFolderQuery.trim() !== '' && (
        <div className="projects-search-results">
          {globalFolderHits.length === 0 ? (
            <div className="faint">No matching folders.</div>
          ) : (
            globalFolderHits.slice(0, 30).map(({ project, folder }) => (
              <div key={`${project.id}:${folder.id}`} className="projects-search-hit" title={folder.path}>
                <button className="projects-search-hit-main" onClick={() => openFolderFromGlobalSearch(project, folder)}>
                  <span style={{ fontSize: 14 }}>{project.icon || '📁'}</span>
                  <span style={{ flex: 1, overflow: 'hidden' }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{folder.name}</span>
                    <span className="faint" style={{ display: 'block', fontSize: 11 }}>
                      {(project.name || 'Untitled') + ' · ' + folder.path}
                    </span>
                  </span>
                </button>
                <div className="projects-search-hit-actions">
                  <button className="btn sm" onClick={() => openFolderFromGlobalSearch(project, folder)}>
                    Files
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => void terminals.newTerminal({ cwd: folder.path, title: folder.name })}
                  >
                    Terminal
                  </button>
                  <button
                    className="btn sm projects-action-menu-btn"
                    disabled={!ideTools.length}
                    onClick={(e) => {
                      e.stopPropagation()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setMenu({ x: rect.left, y: rect.bottom + 4, items: toolMenuItemsForFolder(folder.path, 'ide') })
                    }}
                    title="Open in IDE tool or mode"
                  >
                    Open in ▾
                  </button>
                  <button
                    className="btn sm projects-action-menu-btn"
                    disabled={!runnableTools.length}
                    onClick={(e) => {
                      e.stopPropagation()
                      const rect = e.currentTarget.getBoundingClientRect()
                      setMenu({ x: rect.left, y: rect.bottom + 4, items: toolMenuItemsForFolder(folder.path, 'run') })
                    }}
                    title="Run tool or mode"
                  >
                    Run ▾
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <aside
        style={{
          width: 232,
          display: 'flex',
          flexDirection: 'column',
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
        <div className="field" style={{ marginBottom: 10 }}>
          <select value={sort} onChange={(e) => setSort(e.target.value as ProjectSort)}>
            <option value="recent">Most recently accessed</option>
            <option value="name">Name (A → Z)</option>
            <option value="created">Newest first</option>
          </select>
        </div>
        {sortedProjects.map((p) => (
          <div
            key={p.id}
            className={`project-list-item ${p.id === selectedId ? 'active' : ''}`}
            onClick={() => selectProject(p)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, items: projectMenu(p) })
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
        <div
          style={{ flex: 1, minHeight: 80 }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, items: sidebarMenu() })
          }}
          title="Right-click for actions"
        />
      </aside>

      <main style={{ flex: 1, overflow: 'auto' }}>
        {!selected ? (
          <div className="view-inner">
            {renderGlobalSearch()}
            <div className="empty">
              <div className="big">📁</div>
              <div>Create a project, then add the folders you work across.</div>
              <button className="btn primary" onClick={() => setEditing(blankProject())}>
                ＋ New project
              </button>
            </div>
          </div>
        ) : (
          <div className="view-inner">
            {renderGlobalSearch({ marginBottom: 14 })}
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
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
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
