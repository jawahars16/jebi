"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  openPath: (path) => electron.ipcRenderer.invoke("open-path", path),
  listFiles: (dirPath) => electron.ipcRenderer.invoke("list-files", dirPath),
  onAppShortcut: (cb) => {
    const handler = (_, name) => cb(name);
    electron.ipcRenderer.on("app-shortcut", handler);
    return () => electron.ipcRenderer.removeListener("app-shortcut", handler);
  }
});
