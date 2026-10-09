import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  AppSettings,
  CreateTerminalOptions,
  FavCommand,
  Project,
  RecentLaunch,
  SavedCommand,
  SearchOptions,
  SessionSnapshot,
  SshConfig,
  Tool
} from '@shared/types'
import { store } from './store'
import { detectTools, listTools } from './services/tools'
import * as gitSvc from './services/git'
import * as fsSvc from './services/fs'
import * as searchSvc from './services/search'
import * as sessionSvc from './services/session'
import { buildSshCommand } from './services/ssh'
import { launchCommand, launchExternalCommand, launchTool } from './services/launcher'
import { ptyManager } from './services/pty'
import { checkForUpdates } from './services/updates'
import { validateProfile, waitReady } from './services/profiles'
import { allowedPath } from './services/fileAccess'
import { validateIpc, externalUrl } from './services/ipcValidation'

export function registerIpc(win: BrowserWindow, onSessionRecentsChanged?: () => void): () => void {
  ptyManager.setSender(win.webContents)
  const handles: string[] = []
  const listeners: [string, Parameters<typeof ipcMain.on>[1]][] = []
  const trusted = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): void => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
      throw new Error('Untrusted IPC sender')
    }
  }
  const handle: typeof ipcMain.handle = (channel, listener) => {
    ipcMain.handle(channel, async (event, ...args) => {
      trusted(event)
      const result = await listener(event, ...validateIpc(channel, args))
      if (/^(git:(stage|unstage|commit|pull|push|fetch|create-branch-from-main)|fs:(write|create|delete|rename|move|replace))$/.test(channel) && !win.isDestroyed()) {
        win.webContents.send('git:changed', channel.startsWith('git:') ? args[0] : '*')
      }
      return result
    })
    handles.push(channel)
  }
  const on: typeof ipcMain.on = (channel, listener) => {
    const guarded: typeof listener = (event, ...args) => {
      try { trusted(event); listener(event, ...validateIpc(channel, args)) }
      catch (error) { console.warn(`Rejected ${channel}`, String(error)) }
    }
    listeners.push([channel, guarded])
    return ipcMain.on(channel, guarded)
  }

  // --- persisted state ---
  handle('store:getState', () => store.getState())
  handle('store:setSettings', (_e, partial: Partial<AppSettings>) => store.setSettings(partial))

  // --- tools ---
  handle('tools:list', () => listTools())
  handle('tools:detect', () => detectTools())
  handle('tools:save', (_e, tool: Tool) => store.saveTool(tool))
  handle('tools:remove', (_e, id: string) => store.removeTool(id))

  // --- session snapshots ---
  handle('session:state', () => sessionSvc.getSessionState())
  handle('session:read', async (_e, path: string) => {
    const snap = await sessionSvc.readSnapshot(path)
    onSessionRecentsChanged?.()
    return snap
  })
  handle('session:write', async (_e, snapshot: SessionSnapshot, path: string) => {
    const saved = await sessionSvc.writeSnapshot(path, snapshot)
    onSessionRecentsChanged?.()
    return saved
  })
  handle('session:tempPath', () => sessionSvc.tempPath())
  handle('session:recent', () => sessionSvc.listRecent())
  handle('session:setRoots', (_e, projects: Project[]) => sessionSvc.setActiveProjects(projects))
  handle('session:setRestoreMode', (_e, mode: 'ask' | 'last') => store.setRestoreMode(mode))
  handle('session:setDir', (_e, dir: string) => store.setSnapshotDir(dir))
  handle('session:saveDialog', async (_e, defaultName: string) => {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `${sessionSvc.snapshotDir()}/${defaultName}`,
      filters: [{ name: 'IdeTerm session', extensions: ['ideterm-session.json', 'json'] }]
    })
    return r.canceled ? null : r.filePath
  })
  handle('session:openDialog', async () => {
    const r = await dialog.showOpenDialog(win, {
      defaultPath: sessionSvc.snapshotDir(),
      properties: ['openFile'],
      filters: [{ name: 'IdeTerm session', extensions: ['ideterm-session.json', 'json'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  handle('dialog:closeFile', async (_e, name: string) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question', message: `Save changes to ${name}?`,
      buttons: ['Save', 'Discard', 'Cancel'], defaultId: 0, cancelId: 2
    })
    return (['save', 'discard', 'cancel'] as const)[response]
  })

  // --- dialogs ---
  handle('dialog:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  handle('dialog:pickExecutable', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters:
        process.platform === 'win32'
          ? [{ name: 'Executables', extensions: ['exe', 'cmd', 'bat'] }, { name: 'All', extensions: ['*'] }]
          : [{ name: 'All', extensions: ['*'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  // --- git ---
  handle('git:status', (_e, path: string) => gitSvc.getStatus(path))
  handle('git:changes', (_e, path: string) => gitSvc.getChanges(path))
  handle('git:stage', (_e, path: string, files: string[]) => gitSvc.stage(path, files))
  handle('git:unstage', (_e, path: string, files: string[]) => gitSvc.unstage(path, files))
  handle('git:commit', (_e, path: string, message: string) => gitSvc.commit(path, message))
  handle('git:pull', (_e, path: string) => gitSvc.pull(path))
  handle('git:push', (_e, path: string) => gitSvc.push(path))
  handle('git:fetch', (_e, path: string) => gitSvc.fetch(path))
  handle('git:diff', (_e, path: string, file: string) => gitSvc.diff(path, file))
  handle('git:branches', (_e, path: string) => gitSvc.branches(path))
  handle('git:remote', (_e, path: string) => gitSvc.getRemote(path))
  handle('git:github-list', (_e, limit?: number) => gitSvc.githubList(limit))
  handle('git:github-search', (_e, query: string, limit?: number) => gitSvc.githubSearch(query, limit))
  handle('git:github-clone', (_e, repo: string, destinationPath: string) =>
    gitSvc.githubClone(repo, destinationPath)
  )
  handle('git:inspect-path', (_e, path: string) => gitSvc.inspectPath(path))
  handle('git:create-branch-from-main', (_e, path: string, branchName: string) =>
    gitSvc.createBranchFromMain(path, branchName)
  )

  // --- launching ---
  handle('launch:validateProfile', (_e, project, profile) => validateProfile(project, profile))
  handle('launch:waitReady', (_e, port, timeout, sessionId) => waitReady(port, timeout, sessionId))
  handle('launch:tool', (_e, toolId: string, folderPath?: string, modeId?: string, env?: Record<string, string>) => launchTool(toolId, folderPath, modeId, env))
  handle('launch:command', (_e, command: string, cwd?: string, title?: string, env?: Record<string, string>) =>
    launchCommand(command, cwd, title, env)
  )
  handle('launch:externalCommand', (_e, command: string, cwd?: string) =>
    launchExternalCommand(command, cwd)
  )

  // --- terminals (pty) ---
  handle('pty:create', (_e, opts: CreateTerminalOptions) => ptyManager.create(opts))
  handle('pty:list', () => ptyManager.list())
  handle('pty:restart', (_e, id: string) => ptyManager.restart(id))
  handle('pty:rename', (_e, id: string, title: string) => ptyManager.rename(id, title))
  handle('pty:kill', (_e, id: string) => ptyManager.kill(id))
  // High-frequency, fire-and-forget channels:
  on('pty:write', (_e, id: string, data: string) => ptyManager.write(id, data))
  on('pty:resize', (_e, id: string, cols: number, rows: number) => ptyManager.resize(id, cols, rows))

  // --- saved commands ---
  handle('commands:save', (_e, cmd: SavedCommand) => store.saveCommand(cmd))
  handle('commands:remove', (_e, id: string) => store.removeCommand(id))

  // --- favorite commands ---
  handle('favs:save', (_e, fav: FavCommand) => store.saveFav(fav))
  handle('favs:remove', (_e, id: string) => store.removeFav(id))

  // --- recent launches ---
  handle('recents:add', (_e, entry: RecentLaunch) => store.addRecentLaunch(entry))
  handle('recents:clear', () => store.clearRecentLaunches())

  // --- file system ---
  handle('fs:list', (_e, dir: string) => fsSvc.list(dir))
  handle('fs:read', (_e, file: string) => fsSvc.read(file))
  handle('fs:write', (_e, file: string, content: string) => fsSvc.write(file, content))
  handle('fs:create', (_e, target: string, kind: 'file' | 'directory') => fsSvc.create(target, kind))
  handle('fs:delete', (_e, target: string) => fsSvc.remove(target))
  handle('fs:rename', (_e, target: string, newName: string) => fsSvc.rename(target, newName))
  handle('fs:move', (_e, src: string, destDir: string) => fsSvc.move(src, destDir))
  handle('fs:reveal', async (_e, target: string) => {
    shell.showItemInFolder(await allowedPath(target, sessionSvc.getActiveRoots()))
  })
  handle('fs:openExternal', async (_e, target: string) => shell.openPath(await allowedPath(target, sessionSvc.getActiveRoots())))
  handle('fs:search', (_e, dir: string, query: string, opts: SearchOptions) =>
    searchSvc.searchDir(dir, query, opts)
  )
  handle('fs:replace', (_e, dir: string, query: string, replacement: string, opts: SearchOptions) =>
    searchSvc.replaceInDir(dir, query, replacement, opts)
  )

  // --- ssh ---
  handle('ssh:build', (_e, config: SshConfig) => buildSshCommand(config))

  // --- app + updates ---
  handle('app:version', () => app.getVersion())
  handle('app:openExternal', (_e, url: string) => shell.openExternal(externalUrl(url)))
  handle('updates:check', () => checkForUpdates())
  return () => {
    for (const channel of handles) ipcMain.removeHandler(channel)
    for (const [channel, listener] of listeners) ipcMain.removeListener(channel, listener)
  }
}
