import { contextBridge, ipcRenderer } from 'electron'
import type { IdeTermApi } from '@shared/api'

/** Subscribe to a broadcast channel; returns an unsubscribe function. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: IdeTermApi = {
  store: {
    getState: () => ipcRenderer.invoke('store:getState'),
    setSettings: (partial) => ipcRenderer.invoke('store:setSettings', partial)
  },
  tools: {
    list: () => ipcRenderer.invoke('tools:list'),
    detect: () => ipcRenderer.invoke('tools:detect'),
    save: (tool) => ipcRenderer.invoke('tools:save', tool),
    remove: (id) => ipcRenderer.invoke('tools:remove', id)
  },
  projects: {
    save: (project) => ipcRenderer.invoke('projects:save', project),
    remove: (id) => ipcRenderer.invoke('projects:remove', id)
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
    pickExecutable: () => ipcRenderer.invoke('dialog:pickExecutable')
  },
  git: {
    status: (path) => ipcRenderer.invoke('git:status', path),
    changes: (path) => ipcRenderer.invoke('git:changes', path),
    stage: (path, files) => ipcRenderer.invoke('git:stage', path, files),
    unstage: (path, files) => ipcRenderer.invoke('git:unstage', path, files),
    commit: (path, message) => ipcRenderer.invoke('git:commit', path, message),
    pull: (path) => ipcRenderer.invoke('git:pull', path),
    push: (path) => ipcRenderer.invoke('git:push', path),
    fetch: (path) => ipcRenderer.invoke('git:fetch', path),
    diff: (path, file) => ipcRenderer.invoke('git:diff', path, file),
    branches: (path) => ipcRenderer.invoke('git:branches', path)
  },
  launch: {
    tool: (toolId, folderPath) => ipcRenderer.invoke('launch:tool', toolId, folderPath),
    command: (command, cwd, title) => ipcRenderer.invoke('launch:command', command, cwd, title)
  },
  pty: {
    create: (opts) => ipcRenderer.invoke('pty:create', opts),
    list: () => ipcRenderer.invoke('pty:list'),
    restart: (id) => ipcRenderer.invoke('pty:restart', id),
    rename: (id, title) => ipcRenderer.invoke('pty:rename', id, title),
    kill: (id) => ipcRenderer.invoke('pty:kill', id),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    onData: (cb) => on('pty:data', cb),
    onExit: (cb) => on('pty:exit', cb),
    onRestart: (cb) => on('pty:restart', cb)
  },
  commands: {
    save: (cmd) => ipcRenderer.invoke('commands:save', cmd),
    remove: (id) => ipcRenderer.invoke('commands:remove', id)
  },
  fs: {
    list: (dir) => ipcRenderer.invoke('fs:list', dir),
    read: (file) => ipcRenderer.invoke('fs:read', file),
    write: (file, content) => ipcRenderer.invoke('fs:write', file, content),
    create: (target, kind) => ipcRenderer.invoke('fs:create', target, kind),
    delete: (target) => ipcRenderer.invoke('fs:delete', target),
    rename: (target, newName) => ipcRenderer.invoke('fs:rename', target, newName),
    move: (src, destDir) => ipcRenderer.invoke('fs:move', src, destDir),
    reveal: (target) => ipcRenderer.invoke('fs:reveal', target),
    openExternal: (target) => ipcRenderer.invoke('fs:openExternal', target)
  },
  ssh: {
    build: (config) => ipcRenderer.invoke('ssh:build', config)
  }
}

contextBridge.exposeInMainWorld('api', api)
