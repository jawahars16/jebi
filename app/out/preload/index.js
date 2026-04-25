"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  openPath: (path) => electron.ipcRenderer.invoke("open-path", path),
  listFiles: (dirPath) => electron.ipcRenderer.invoke("list-files", dirPath)
});
