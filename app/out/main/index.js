"use strict";
const electron = require("electron");
const path = require("path");
const child_process = require("child_process");
let coreProcess = null;
function coreBinaryPath() {
  const bin = process.platform === "win32" ? "term-core.exe" : "term-core";
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, bin);
  }
  return path.join(electron.app.getAppPath(), "..", "core", bin);
}
function startCore() {
  const bin = coreBinaryPath();
  coreProcess = child_process.spawn(bin, [], { stdio: "pipe" });
  coreProcess.stdout.on("data", (d) => console.log("[core]", d.toString().trim()));
  coreProcess.stderr.on("data", (d) => console.error("[core]", d.toString().trim()));
  coreProcess.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`[core] exited unexpectedly: code=${code} signal=${signal}`);
    }
    coreProcess = null;
  });
}
function stopCore() {
  if (coreProcess) {
    coreProcess.kill("SIGTERM");
    coreProcess = null;
  }
}
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
electron.app.whenReady().then(() => {
  startCore();
  createWindow();
  electron.globalShortcut.register("CommandOrControl+N", createWindow);
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopCore();
    electron.app.quit();
  }
});
electron.app.on("will-quit", stopCore);
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
