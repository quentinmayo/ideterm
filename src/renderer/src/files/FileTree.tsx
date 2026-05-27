import { useCallback, useEffect, useState } from 'react'
import type { FileEntry } from '@shared/types'
import { useToast } from '../components/Toast'
import { ContextMenu, type MenuItem } from '../components/ContextMenu'
import { Prompt } from '../components/Prompt'

function join(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  return `${dir.replace(/[\\/]$/, '')}${sep}${name}`
}
function parentOf(p: string): string {
  return p.replace(/[\\/][^\\/]+[\\/]?$/, '') || p
}
function fileIcon(name: string, kind: 'file' | 'directory', open: boolean): string {
  if (kind === 'directory') return open ? '📂' : '📁'
  const ext = name.split('.').pop()?.toLowerCase()
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext ?? '')) return '📜'
  if (['json'].includes(ext ?? '')) return '🔧'
  if (['md', 'markdown'].includes(ext ?? '')) return '📝'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext ?? '')) return '🖼'
  return '📄'
}

interface FileTreeProps {
  root: string
  rootName: string
  selectedPath: string | null
  onOpenFile: (path: string, name: string) => void
}

export function FileTree({ root, rootName, selectedPath, onOpenFile }: FileTreeProps): JSX.Element {
  const toast = useToast()
  const [expanded, setExpanded] = useState<Set<string>>(new Set([root]))
  const [cache, setCache] = useState<Record<string, FileEntry[]>>({})
  const [menu, setMenu] = useState<{ x: number; y: number; entry: FileEntry } | null>(null)
  const [prompt, setPrompt] = useState<{ mode: 'newFile' | 'newFolder' | 'rename'; target: string } | null>(null)
  const [dragSrc, setDragSrc] = useState<string | null>(null)

  const loadDir = useCallback(
    async (dir: string) => {
      try {
        const entries = await window.api.fs.list(dir)
        setCache((c) => ({ ...c, [dir]: entries }))
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error')
      }
    },
    [toast]
  )

  useEffect(() => {
    setExpanded(new Set([root]))
    void loadDir(root)
  }, [root, loadDir])

  const toggle = async (dir: string): Promise<void> => {
    const next = new Set(expanded)
    if (next.has(dir)) next.delete(dir)
    else {
      next.add(dir)
      if (!cache[dir]) await loadDir(dir)
    }
    setExpanded(next)
  }

  const doCreate = async (dir: string, kind: 'file' | 'directory', name: string): Promise<void> => {
    try {
      const created = await window.api.fs.create(join(dir, name), kind)
      await loadDir(dir)
      setExpanded((e) => new Set(e).add(dir))
      if (kind === 'file') onOpenFile(created, name)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const doRename = async (target: string, newName: string): Promise<void> => {
    try {
      await window.api.fs.rename(target, newName)
      await loadDir(parentOf(target))
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const doDelete = async (entry: FileEntry): Promise<void> => {
    if (!window.confirm(`Delete "${entry.name}"? This cannot be undone.`)) return
    try {
      await window.api.fs.delete(entry.path)
      await loadDir(parentOf(entry.path))
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const doMove = async (src: string, destDir: string): Promise<void> => {
    if (parentOf(src) === destDir || src === destDir) return
    try {
      await window.api.fs.move(src, destDir)
      await Promise.all([loadDir(parentOf(src)), loadDir(destDir)])
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const menuItems = (entry: FileEntry): MenuItem[] => {
    const dir = entry.kind === 'directory' ? entry.path : parentOf(entry.path)
    const items: MenuItem[] = [
      { icon: '📄', label: 'New file', onClick: () => setPrompt({ mode: 'newFile', target: dir }) },
      { icon: '📁', label: 'New folder', onClick: () => setPrompt({ mode: 'newFolder', target: dir }) },
      { separator: true },
      { icon: '✏️', label: 'Rename', onClick: () => setPrompt({ mode: 'rename', target: entry.path }) },
      { icon: '🗑', label: 'Delete', danger: true, onClick: () => void doDelete(entry) },
      { separator: true },
      { icon: '📂', label: 'Reveal in OS explorer', onClick: () => void window.api.fs.reveal(entry.path) }
    ]
    return items
  }

  const renderEntry = (entry: FileEntry, depth: number): JSX.Element => {
    const isDir = entry.kind === 'directory'
    const open = expanded.has(entry.path)
    return (
      <div key={entry.path}>
        <div
          className={`tree-node ${selectedPath === entry.path ? 'selected' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            setDragSrc(entry.path)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (isDir && dragSrc) e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (isDir && dragSrc) void doMove(dragSrc, entry.path)
            setDragSrc(null)
          }}
          onClick={() => (isDir ? void toggle(entry.path) : onOpenFile(entry.path, entry.name))}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, entry })
          }}
        >
          <span className="tree-caret">{isDir ? (open ? '▾' : '▸') : ''}</span>
          <span>{fileIcon(entry.name, entry.kind, open)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
        </div>
        {isDir && open && (cache[entry.path] ?? []).map((child) => renderEntry(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="file-tree">
      <div className="row" style={{ padding: '4px 6px 8px', gap: 4 }}>
        <strong style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis' }}>{rootName}</strong>
        <button className="icon-btn" title="New file" onClick={() => setPrompt({ mode: 'newFile', target: root })}>
          📄
        </button>
        <button className="icon-btn" title="New folder" onClick={() => setPrompt({ mode: 'newFolder', target: root })}>
          📁
        </button>
        <button className="icon-btn" title="Refresh" onClick={() => void loadDir(root)}>
          ↻
        </button>
      </div>
      {(cache[root] ?? []).map((entry) => renderEntry(entry, 0))}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.entry)} onClose={() => setMenu(null)} />}
      {prompt && (
        <Prompt
          title={prompt.mode === 'rename' ? 'Rename' : prompt.mode === 'newFolder' ? 'New folder' : 'New file'}
          label="Name"
          initial={prompt.mode === 'rename' ? (prompt.target.split(/[\\/]/).pop() ?? '') : ''}
          submitLabel={prompt.mode === 'rename' ? 'Rename' : 'Create'}
          onSubmit={(name) => {
            if (prompt.mode === 'rename') void doRename(prompt.target, name)
            else void doCreate(prompt.target, prompt.mode === 'newFolder' ? 'directory' : 'file', name)
          }}
          onClose={() => setPrompt(null)}
        />
      )}
    </div>
  )
}
