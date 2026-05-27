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
  session: {
    state: () => ipcRenderer.invoke('session:state'),
    read: (path) => ipcRenderer.invoke('session:read', path),
    write: (snapshot, path) => ipcRenderer.invoke('session:write', snapshot, path),
    tempPath: () => ipcRenderer.invoke('session:tempPath'),
    recent: () => ipcRenderer.invoke('session:recent'),
    setRoots: (projects) => ipcRenderer.invoke('session:setRoots', projects),
    setRestoreMode: (mode) => ipcRenderer.invoke('session:setRestoreMode', mode),
    setDir: (dir) => ipcRenderer.invoke('session:setDir', dir),
    saveDialog: (defaultName) => ipcRenderer.invoke('session:saveDialog', defaultName),
    openDialog: () => ipcRenderer.invoke('session:openDialog'),
    onMenu: (cb) => {
      const map: Record<string, string> = {
        'menu:new-temp': 'new-temp',
        'menu:new-disk': 'new-disk',
        'menu:open': 'open',
        'menu:save': 'save',
        'menu:save-as': 'save-as',
        'menu:open-path': 'open-path'
      }
      const unsubs = Object.entries(map).map(([channel, action]) => {
        const listener = (_e: unknown, arg?: string): void => cb(action as never, arg)
        ipcRenderer.on(channel, listener)
        return () => ipcRenderer.removeListener(channel, listener)
      })
      return () => unsubs.forEach((u) => u())
    },
    onFlush: (cb) => {
      const listener = (): void => cb()
      ipcRenderer.on('session:flush', listener)
      return () => ipcRenderer.removeListener('session:flush', listener)
    },
    flushDone: () => ipcRenderer.send('session:flush-done')
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
    tool: (toolId, folderPath, modeId) => ipcRenderer.invoke('launch:tool', toolId, folderPath, modeId),
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
    openExternal: (target) => ipcRenderer.invoke('fs:openExternal', target),
    search: (dir, query, opts) => ipcRenderer.invoke('fs:search', dir, query, opts),
    replace: (dir, query, replacement, opts) => ipcRenderer.invoke('fs:replace', dir, query, replacement, opts)
  },
  ssh: {
    build: (config) => ipcRenderer.invoke('ssh:build', config)
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
  },
  updates: {
    check: () => ipcRenderer.invoke('updates:check')
  }
}

contextBridge.exposeInMainWorld('api', api)
