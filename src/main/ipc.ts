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

export function registerIpc(win: BrowserWindow, onSessionRecentsChanged?: () => void): void {
  ptyManager.setSender(win.webContents)

  // --- persisted state ---
  ipcMain.handle('store:getState', () => store.getState())
  ipcMain.handle('store:setSettings', (_e, partial: Partial<AppSettings>) => store.setSettings(partial))

  // --- tools ---
  ipcMain.handle('tools:list', () => listTools())
  ipcMain.handle('tools:detect', () => detectTools())
  ipcMain.handle('tools:save', (_e, tool: Tool) => store.saveTool(tool))
  ipcMain.handle('tools:remove', (_e, id: string) => store.removeTool(id))

  // --- session snapshots ---
  ipcMain.handle('session:state', () => sessionSvc.getSessionState())
  ipcMain.handle('session:read', async (_e, path: string) => {
    const snap = await sessionSvc.readSnapshot(path)
    onSessionRecentsChanged?.()
    return snap
  })
  ipcMain.handle('session:write', async (_e, snapshot: SessionSnapshot, path: string) => {
    const saved = await sessionSvc.writeSnapshot(path, snapshot)
    onSessionRecentsChanged?.()
    return saved
  })
  ipcMain.handle('session:tempPath', () => sessionSvc.tempPath())
  ipcMain.handle('session:recent', () => sessionSvc.listRecent())
  ipcMain.handle('session:setRoots', (_e, projects: Project[]) => sessionSvc.setActiveProjects(projects))
  ipcMain.handle('session:setRestoreMode', (_e, mode: 'ask' | 'last') => store.setRestoreMode(mode))
  ipcMain.handle('session:setDir', (_e, dir: string) => store.setSnapshotDir(dir))
  ipcMain.handle('session:saveDialog', async (_e, defaultName: string) => {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `${sessionSvc.snapshotDir()}/${defaultName}`,
      filters: [{ name: 'IdeTerm session', extensions: ['ideterm-session.json', 'json'] }]
    })
    return r.canceled ? null : r.filePath
  })
  ipcMain.handle('session:openDialog', async () => {
    const r = await dialog.showOpenDialog(win, {
      defaultPath: sessionSvc.snapshotDir(),
      properties: ['openFile'],
      filters: [{ name: 'IdeTerm session', extensions: ['ideterm-session.json', 'json'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  // --- dialogs ---
  ipcMain.handle('dialog:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:pickExecutable', async () => {
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
  ipcMain.handle('git:status', (_e, path: string) => gitSvc.getStatus(path))
  ipcMain.handle('git:changes', (_e, path: string) => gitSvc.getChanges(path))
  ipcMain.handle('git:stage', (_e, path: string, files: string[]) => gitSvc.stage(path, files))
  ipcMain.handle('git:unstage', (_e, path: string, files: string[]) => gitSvc.unstage(path, files))
  ipcMain.handle('git:commit', (_e, path: string, message: string) => gitSvc.commit(path, message))
  ipcMain.handle('git:pull', (_e, path: string) => gitSvc.pull(path))
  ipcMain.handle('git:push', (_e, path: string) => gitSvc.push(path))
  ipcMain.handle('git:fetch', (_e, path: string) => gitSvc.fetch(path))
  ipcMain.handle('git:diff', (_e, path: string, file: string) => gitSvc.diff(path, file))
  ipcMain.handle('git:branches', (_e, path: string) => gitSvc.branches(path))
  ipcMain.handle('git:remote', (_e, path: string) => gitSvc.getRemote(path))
  ipcMain.handle('git:github-list', (_e, limit?: number) => gitSvc.githubList(limit))
  ipcMain.handle('git:github-search', (_e, query: string, limit?: number) => gitSvc.githubSearch(query, limit))
  ipcMain.handle('git:github-clone', (_e, repo: string, destinationPath: string) =>
    gitSvc.githubClone(repo, destinationPath)
  )
  ipcMain.handle('git:inspect-path', (_e, path: string) => gitSvc.inspectPath(path))
  ipcMain.handle('git:create-branch-from-main', (_e, path: string, branchName: string) =>
    gitSvc.createBranchFromMain(path, branchName)
  )

  // --- launching ---
  ipcMain.handle('launch:tool', (_e, toolId: string, folderPath?: string) => launchTool(toolId, folderPath))
  ipcMain.handle('launch:command', (_e, command: string, cwd?: string, title?: string) =>
    launchCommand(command, cwd, title)
  )
  ipcMain.handle('launch:externalCommand', (_e, command: string, cwd?: string) =>
    launchExternalCommand(command, cwd)
  )

  // --- terminals (pty) ---
  ipcMain.handle('pty:create', (_e, opts: CreateTerminalOptions) => ptyManager.create(opts))
  ipcMain.handle('pty:list', () => ptyManager.list())
  ipcMain.handle('pty:restart', (_e, id: string) => ptyManager.restart(id))
  ipcMain.handle('pty:rename', (_e, id: string, title: string) => ptyManager.rename(id, title))
  ipcMain.handle('pty:kill', (_e, id: string) => ptyManager.kill(id))
  // High-frequency, fire-and-forget channels:
  ipcMain.on('pty:write', (_e, id: string, data: string) => ptyManager.write(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) => ptyManager.resize(id, cols, rows))

  // --- saved commands ---
  ipcMain.handle('commands:save', (_e, cmd: SavedCommand) => store.saveCommand(cmd))
  ipcMain.handle('commands:remove', (_e, id: string) => store.removeCommand(id))

  // --- favorite commands ---
  ipcMain.handle('favs:save', (_e, fav: FavCommand) => store.saveFav(fav))
  ipcMain.handle('favs:remove', (_e, id: string) => store.removeFav(id))

  // --- recent launches ---
  ipcMain.handle('recents:add', (_e, entry: RecentLaunch) => store.addRecentLaunch(entry))
  ipcMain.handle('recents:clear', () => store.clearRecentLaunches())

  // --- file system ---
  ipcMain.handle('fs:list', (_e, dir: string) => fsSvc.list(dir))
  ipcMain.handle('fs:read', (_e, file: string) => fsSvc.read(file))
  ipcMain.handle('fs:write', (_e, file: string, content: string) => fsSvc.write(file, content))
  ipcMain.handle('fs:create', (_e, target: string, kind: 'file' | 'directory') => fsSvc.create(target, kind))
  ipcMain.handle('fs:delete', (_e, target: string) => fsSvc.remove(target))
  ipcMain.handle('fs:rename', (_e, target: string, newName: string) => fsSvc.rename(target, newName))
  ipcMain.handle('fs:move', (_e, src: string, destDir: string) => fsSvc.move(src, destDir))
  ipcMain.handle('fs:reveal', (_e, target: string) => {
    shell.showItemInFolder(target)
  })
  ipcMain.handle('fs:openExternal', (_e, target: string) => shell.openPath(target))
  ipcMain.handle('fs:search', (_e, dir: string, query: string, opts: SearchOptions) =>
    searchSvc.searchDir(dir, query, opts)
  )
  ipcMain.handle('fs:replace', (_e, dir: string, query: string, replacement: string, opts: SearchOptions) =>
    searchSvc.replaceInDir(dir, query, replacement, opts)
  )

  // --- ssh ---
  ipcMain.handle('ssh:build', (_e, config: SshConfig) => buildSshCommand(config))

  // --- app + updates ---
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('updates:check', () => checkForUpdates())
}
