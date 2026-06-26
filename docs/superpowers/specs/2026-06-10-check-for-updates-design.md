# Check for Updates — Design Spec

## Overview

jebi checks for new releases on startup and on user request. If a newer version exists, a subtle animated indicator appears next to the current version in the status bar. The About tab is the action surface for manual checks and upgrade instructions.

No auto-download, no polling — check on startup and on explicit user request only.

---

## Architecture

### Main Process (`app/src/main/index.js`)

**Version check function** — `checkForUpdates()`
- Fetches `https://api.github.com/repos/jebi-sh/jebi/releases/latest`
- Compares `tag_name` (strip leading `v`) against `app.getVersion()`
- Detects install method:
  - Check if `/opt/homebrew/Caskroom/jebi/` or `/usr/local/Caskroom/jebi/` exists → `'brew'`
  - Otherwise → `'dmg'`
- Sends `update:status` event to all windows with result object:
  ```js
  {
    available: boolean,
    currentVersion: string,      // e.g. "0.1.7"
    latestVersion: string,       // e.g. "0.1.8"
    installMethod: 'brew'|'dmg', // how jebi was installed
    releaseUrl: string,          // GitHub release page URL
  }
  ```
- On network error: sends `{ available: false, error: true, currentVersion }`

**IPC handlers**
- `update:check` (invoke) — renderer calls this to trigger a manual check; calls `checkForUpdates()` and returns the same result object
- `update:status` (on) — main pushes result to renderer after startup check

**Startup trigger**
- Call `checkForUpdates()` inside `app.whenReady()` after the main window is created (so the window exists to receive the event)

**Preload** (`preload/index.js`)
- Expose `window.api.checkForUpdates()` — calls `ipcRenderer.invoke('update:check')`
- Expose `window.api.onUpdateStatus(cb)` — registers `ipcRenderer.on('update:status', cb)`

---

### Renderer

**`useUpdateStatus` hook** (`app/src/renderer/src/hooks/useUpdateStatus.js`)
- Registers `window.api.onUpdateStatus(...)` on mount
- Stores result in local state: `{ available, currentVersion, latestVersion, installMethod, releaseUrl, error, checking }`
- Exposes `checkNow()` — calls `window.api.checkForUpdates()`, sets `checking: true` while waiting, updates state on response
- Initial state: `{ available: false, currentVersion: app.getVersion(), checking: false }`

---

## StatusBar (`app/src/renderer/src/components/StatusBar/index.jsx`)

**Left end — version chip**

Always visible. Two states:

1. **No update available** — muted version label:
   ```
   v0.1.7
   ```

2. **Update available** — version label with animated pulse dot to its left:
   ```
   ⬤ v0.1.7
   ```
   - Dot: 6px amber (`#f59e0b`), CSS `@keyframes pulse` — scale 1→1.4→1, opacity 1→0.4→1, 1.8s infinite ease-in-out
   - Tooltip on hover: `v0.1.8 available`
   - The version chip itself is not a button — clicking does nothing in the status bar

**Right end** — AI chip unchanged.

---

## About Tab (`app/src/renderer/src/components/Preferences/AboutSection.jsx`)

**Current version display**
- Always shows `Version: 0.1.7` at the top of the section

**"Check for updates" button**
- Calls `checkNow()` from `useUpdateStatus`
- While checking: button shows a small inline spinner (CSS animation, no library), text changes to `Checking…`, button disabled
- Button is always shown regardless of update state

**Result text** (appears below button, replaces previous result on each check)

Three states:

1. **Up to date:**
   ```
   You're up to date.
   ```
   Muted text, small font.

2. **Update available — brew:**
   ```
   v0.1.8 is available

   brew upgrade --cask jebi    [copy icon]
   ```
   The command is in a monospace code block with a copy-to-clipboard icon button. Clicking copies the command.

3. **Update available — DMG:**
   ```
   v0.1.8 is available

   Download latest release →
   ```
   The link opens the GitHub release page in the system browser via `shell.openExternal`.

4. **Error:**
   ```
   Could not check for updates. Try again.
   ```
   Muted text.

---

## Files Changed

| File | Change |
|---|---|
| `app/src/main/index.js` | Add `checkForUpdates()`, IPC handler `update:check`, startup call |
| `app/src/preload/index.js` | Expose `checkForUpdates` and `onUpdateStatus` on `window.api` |
| `app/src/renderer/src/hooks/useUpdateStatus.js` | New hook |
| `app/src/renderer/src/components/StatusBar/index.jsx` | Add version chip (left) with conditional pulse dot |
| `app/src/renderer/src/components/Preferences/AboutSection.jsx` | Add check button + result text |

---

## Out of Scope

- Auto-download or auto-install
- Polling / scheduled checks (startup + manual only)
- Caching the last check result across restarts
- Windows/Linux support (macOS only for now)
