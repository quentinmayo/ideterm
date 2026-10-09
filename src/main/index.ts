import { app, BrowserWindow, dialog, Menu, ipcMain, shell, type MenuItemConstructorOptions } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { store } from './store'
import { registerIpc } from './ipc'
import { ptyManager } from './services/pty'
import * as sessionSvc from './services/session'
import { checkForUpdates } from './services/updates'
import { externalUrl } from './services/ipcValidation'

const RELEASES_URL = 'https://github.com/quentinmayo/ideterm/releases'

/** Run an update check and report via a native dialog (used by the Help menu). */
async function runUpdateCheck(win: BrowserWindow): Promise<void> {
  const r = await checkForUpdates()
  if (r.hasUpdate) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update available',
      message: `Mayo's IdeTerm ${r.latestVersion} is available.`,
      detail: `You're running ${r.currentVersion}.`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    })
    if (response === 0) shell.openExternal(externalUrl(r.url ?? RELEASES_URL))
  } else if (r.error) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Check for Updates',
      message: 'Could not check for updates.',
      detail: r.error,
      buttons: ['View Releases', 'OK'],
      defaultId: 1,
      cancelId: 1
    })
    if (response === 0) shell.openExternal(externalUrl(r.url ?? RELEASES_URL))
  } else {
    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Check for Updates',
      message: `You're on the latest version (${r.currentVersion}).`,
      buttons: ['OK']
    })
  }
}

// Test runs use an isolated profile and never touch the real workspace registry.
if (process.env.IDETERM_TEST_USER_DATA) app.setPath('userData', process.env.IDETERM_TEST_USER_DATA)

const baseDir = dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.ELECTRON_RENDERER_URL
const isDev = !!rendererUrl

let mainWindow: BrowserWindow | null = null
let quitting = false

/** Build the application menu. File-menu items message the renderer, which owns the live state. */
function buildMenu(win: BrowserWindow): void {
  const send = (channel: string, ...args: unknown[]): void => win.webContents.send(channel, ...args)
  const snapshots = store.getSnapshots()
  const recent = [...snapshots.recent]
  if (snapshots.lastOpened && !recent.includes(snapshots.lastOpened)) {
    recent.unshift(snapshots.lastOpened)
  }

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
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Check for Updates…', click: () => void runUpdateCheck(win) },
        { label: 'View Releases', click: () => shell.openExternal(RELEASES_URL) },
        { type: 'separator' },
        {
          label: "About Mayo's IdeTerm",
          click: () =>
            void dialog.showMessageBox(win, {
              type: 'info',
              title: "About Mayo's IdeTerm",
              message: "Mayo's IdeTerm",
              detail: `Version ${app.getVersion()}\nOne control center for your IDEs, terminals, repos, and coding agents.`,
              buttons: ['OK']
            })
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  void store.setCleanShutdown(false).catch(console.error)
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0d0e12',
    title: "Mayo's IdeTerm",
    ...(isDev ? { icon: join(baseDir, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(baseDir, '../preload/index.cjs'),
      sandbox: true,
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

  const disposeIpc = registerIpc(mainWindow, () => {
    if (mainWindow && !mainWindow.isDestroyed()) buildMenu(mainWindow)
  })
  buildMenu(mainWindow)
  if (!isDev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"
      ] } })
    })
  }

  // A failed flush is not a clean shutdown. Let the user keep the window open.
  const win = mainWindow
  let closing = false
  let cancelFlush: (() => void) | undefined
  win.on('close', (event) => {
    event.preventDefault()
    if (closing) return
    closing = true
    let settled = false
    const finish = async (ok: boolean): Promise<void> => {
      if (settled) return
      settled = true
      cancelFlush?.()
      if (!ok) {
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning', message: 'The session could not be saved.',
          detail: 'Keep the window open to retry, or close and use the last recovery snapshot.',
          buttons: ['Keep open', 'Close without saving'], defaultId: 0, cancelId: 0
        })
        if (response !== 1) { closing = false; quitting = false; return }
      }
      try { await store.setCleanShutdown(ok) }
      catch (error) { console.error('Could not record shutdown', error) }
      win.destroy()
      if (quitting) app.quit()
    }
    const listener = (event: Electron.IpcMainEvent, ok: unknown): void => {
      if (event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame) void finish(ok === true)
    }
    const timer = setTimeout(() => void finish(false), 10_000)
    cancelFlush = () => { clearTimeout(timer); ipcMain.removeListener('session:flush-done', listener) }
    ipcMain.on('session:flush-done', listener)
    win.webContents.send('session:flush')
  })

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(baseDir, '../renderer/index.html'))
  }
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('closed', () => {
    cancelFlush?.()
    disposeIpc()
    ptyManager.killAll()
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
  quitting = true
  if (!mainWindow) ptyManager.killAll()
})
