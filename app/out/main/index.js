"use strict";
const electron = require("electron");
const path = require("path");
require("child_process");
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: "#0d0d0d",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.ipcMain.handle("open-path", (_, path2) => electron.shell.openPath(path2));
electron.app.whenReady().then(() => {
  createWindow();
});
electron.app.on("browser-window-focus", () => {
  electron.globalShortcut.register("CommandOrControl+N", createWindow);
});
electron.app.on("browser-window-blur", () => {
  electron.globalShortcut.unregister("CommandOrControl+N");
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
