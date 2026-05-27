import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type {
  AppSettings,
  CreateTerminalOptions,
  Project,
  SavedCommand,
  SshConfig,
  Tool
} from '@shared/types'
import { store } from './store'
import { detectTools, listTools } from './services/tools'
import * as gitSvc from './services/git'
import * as fsSvc from './services/fs'
import { buildSshCommand } from './services/ssh'
import { launchCommand, launchTool } from './services/launcher'
import { ptyManager } from './services/pty'

export function registerIpc(win: BrowserWindow): void {
  ptyManager.setSender(win.webContents)

  // --- persisted state ---
  ipcMain.handle('store:getState', () => store.getState())
  ipcMain.handle('store:setSettings', (_e, partial: Partial<AppSettings>) => store.setSettings(partial))

  // --- tools ---
  ipcMain.handle('tools:list', () => listTools())
  ipcMain.handle('tools:detect', () => detectTools())
  ipcMain.handle('tools:save', (_e, tool: Tool) => store.saveTool(tool))
  ipcMain.handle('tools:remove', (_e, id: string) => store.removeTool(id))

  // --- projects ---
  ipcMain.handle('projects:save', (_e, project: Project) => store.saveProject(project))
  ipcMain.handle('projects:remove', (_e, id: string) => store.removeProject(id))

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

  // --- launching ---
  ipcMain.handle('launch:tool', (_e, toolId: string, folderPath?: string) => launchTool(toolId, folderPath))
  ipcMain.handle('launch:command', (_e, command: string, cwd?: string, title?: string) =>
    launchCommand(command, cwd, title)
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

  // --- ssh ---
  ipcMain.handle('ssh:build', (_e, config: SshConfig) => buildSshCommand(config))
}
