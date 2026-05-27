import { app, BrowserWindow, Menu, ipcMain, shell, type MenuItemConstructorOptions } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { store } from './store'
import { registerIpc } from './ipc'
import { ptyManager } from './services/pty'
import * as sessionSvc from './services/session'

const baseDir = dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.ELECTRON_RENDERER_URL
const isDev = !!rendererUrl

let mainWindow: BrowserWindow | null = null

/** Build the application menu. File-menu items message the renderer, which owns the live state. */
function buildMenu(win: BrowserWindow): void {
  const send = (channel: string, ...args: unknown[]): void => win.webContents.send(channel, ...args)
  const recent = store.getSnapshots().recent

  const fileSubmenu: MenuItemConstructorOptions[] = [
    { label: 'New Session', click: () => send('menu:new-temp') },
    { label: 'New Session on Disk…', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('menu:new-disk') },
    { label: 'Open Session…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open') },
    { type: 'separator' },
    // Ctrl/Cmd+S is left to the file editor; session save uses Shift.
    { label: 'Save Session', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:save') },
    { label: 'Save Session As…', click: () => send('menu:save-as') }
  ]
  if (recent.length) {
    fileSubmenu.push(
      { type: 'separator' },
      {
        label: 'Recent Sessions',
        submenu: recent.slice(0, 10).map((p) => ({
          label: p.split(/[\\/]/).pop() ?? p,
          click: () => send('menu:open-path', p)
        }))
      }
    )
  }
  fileSubmenu.push({ type: 'separator' }, process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' })

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { label: 'File', submenu: fileSubmenu },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0d0e12',
    title: "Mayo's IdeTerm",
    ...(isDev ? { icon: join(baseDir, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(baseDir, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  registerIpc(mainWindow)
  buildMenu(mainWindow)

  // Save-on-close: give the renderer a chance to flush the active session.
  let flushed = false
  mainWindow.on('close', (event) => {
    if (flushed || !mainWindow) return
    event.preventDefault()
    flushed = true
    const finish = async (): Promise<void> => {
      await store.setCleanShutdown(true)
      mainWindow?.destroy()
    }
    ipcMain.once('session:flush-done', () => void finish())
    mainWindow.webContents.send('session:flush')
    setTimeout(() => void finish(), 2500) // never let close hang
  })

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(baseDir, '../renderer/index.html'))
  }
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    await store.load()
    await sessionSvc.initSession()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  ptyManager.killAll()
  void store.setCleanShutdown(true)
})
