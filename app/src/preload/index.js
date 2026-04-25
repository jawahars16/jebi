import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  listFiles: (dirPath) => ipcRenderer.invoke('list-files', dirPath),
})
