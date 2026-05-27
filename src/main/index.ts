import { app, BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { store } from './store'
import { registerIpc } from './ipc'
import { ptyManager } from './services/pty'

const baseDir = dirname(fileURLToPath(import.meta.url))
const rendererUrl = process.env.ELECTRON_RENDERER_URL
const isDev = !!rendererUrl

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0d0e12',
    title: "Mayo's IdeTerm",
    autoHideMenuBar: true,
    // In dev, use the repo icon; packaged builds embed it via electron-builder.
    ...(isDev ? { icon: join(baseDir, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(baseDir, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Open real external links in the OS browser; deny in-app popups.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })

  registerIpc(mainWindow)

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
})
