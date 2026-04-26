"use strict";
const electron = require("electron");
const path = require("path");
require("child_process");
const fs = require("fs");
const os = require("os");
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
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.meta && input.shift && !input.alt && !input.control) {
      const k = input.key.toLowerCase();
      if (k === "d") {
        event.preventDefault();
        win.webContents.send("app-shortcut", "split-down");
      }
      if (k === "c") {
        event.preventDefault();
        win.webContents.send("app-shortcut", "copy");
      }
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.ipcMain.handle("open-path", (_, path2) => electron.shell.openPath(path2));
electron.ipcMain.handle("list-files", async (_, dirPath) => {
  if (typeof dirPath !== "string" || dirPath === "") return [];
  let abs = dirPath;
  if (abs === "~" || abs.startsWith("~/")) {
    abs = abs === "~" ? os.homedir() : path.join(os.homedir(), abs.slice(2));
  }
  if (!path.isAbsolute(abs)) return [];
  abs = path.resolve(abs);
  try {
    const entries = await fs.promises.readdir(abs, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
  } catch {
    return [];
  }
});
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
