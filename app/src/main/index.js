import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'

// ─── Go core lifecycle ────────────────────────────────────────────────────────

let coreProcess = null

function coreBinaryPath() {
  const bin = process.platform === 'win32' ? 'term-core.exe' : 'term-core'
  if (app.isPackaged) {
    return join(process.resourcesPath, bin)
  }
  return join(app.getAppPath(), '..', 'core/bin', bin)
}

function startCore() {
  const bin = coreBinaryPath()
  coreProcess = spawn(bin, [], { stdio: 'pipe' })
  coreProcess.stdout.on('data', d => console.log('[core]', d.toString().trim()))
  coreProcess.stderr.on('data', d => console.error('[core]', d.toString().trim()))
  coreProcess.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
      console.error(`[core] exited unexpectedly: code=${code} signal=${signal}`)
    }
    coreProcess = null
  })
}

function stopCore() {
  if (coreProcess) {
    coreProcess.kill('SIGTERM')
    coreProcess = null
  }
}

// ─── Window management ────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0d0d0d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('open-path', (_, path) => shell.openPath(path))

app.whenReady().then(() => {
  startCore()
  createWindow()
})

// Register Cmd+N only while a terminal window is focused so it doesn't
// fire as a system-wide shortcut when other apps are in the foreground.
app.on('browser-window-focus', () => {
  globalShortcut.register('CommandOrControl+N', createWindow)
})
app.on('browser-window-blur', () => {
  globalShortcut.unregister('CommandOrControl+N')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopCore()
    app.quit()
  }
})

app.on('will-quit', stopCore)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
