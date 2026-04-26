import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  listFiles: (dirPath) => ipcRenderer.invoke('list-files', dirPath),
  onAppShortcut: (cb) => {
    const handler = (_, name) => cb(name)
    ipcRenderer.on('app-shortcut', handler)
    return () => ipcRenderer.removeListener('app-shortcut', handler)
  },
})
