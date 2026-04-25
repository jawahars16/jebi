import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import { join, isAbsolute, resolve } from 'path'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { homedir } from 'os'

// ─── Go core lifecycle ────────────────────────────────────────────────────────

let coreProcess = null

function coreBinaryPath() {
  const bin = process.platform === 'win32' ? 'term-core.exe' : 'term-core'
  if (app.isPackaged) {
    return join(process.resourcesPath, bin)
  }
  return join(app.getAppPath(), '..', 'core', bin)
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

// Lists folders/files at dirPath. Used by the InputBar file-path autosuggest.
// Resolves '~' against the user's home dir; relative paths must be resolved
// against cwd by the caller (this handler doesn't know about per-pane cwd).
// Returns [] silently on any error so the dropdown just stays empty.
ipcMain.handle('list-files', async (_, dirPath) => {
  if (typeof dirPath !== 'string' || dirPath === '') return []
  let abs = dirPath
  if (abs === '~' || abs.startsWith('~/')) {
    abs = abs === '~' ? homedir() : join(homedir(), abs.slice(2))
  }
  if (!isAbsolute(abs)) return []
  abs = resolve(abs)
  try {
    const entries = await fs.readdir(abs, { withFileTypes: true })
    return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }))
  } catch {
    return []
  }
})

app.whenReady().then(() => {
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
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
