# Check for Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check GitHub for new jebi releases on startup and on demand; show a pulsing dot next to the version in the status bar when an update is available; show upgrade instructions in the About tab.

**Architecture:** Main process fetches the GitHub releases API, detects install method (brew vs DMG), and pushes results to the renderer via IPC. A singleton hook (`useUpdateStatus`) distributes status to StatusBar and AboutSection. No polling — check fires once on startup and once per manual "Check for updates" click.

**Tech Stack:** Electron IPC (ipcMain/ipcRenderer), React hooks, CSS keyframe animation, Node.js `https`, Node.js `fs.existsSync`

---

## File Map

| Action | File |
|---|---|
| Modify | `app/src/main/index.js` |
| Modify | `app/src/preload/index.js` |
| Create | `app/src/renderer/src/hooks/useUpdateStatus.js` |
| Modify | `app/src/renderer/src/components/StatusBar/index.jsx` |
| Modify | `app/src/renderer/src/components/Preferences/AboutSection.jsx` |

---

### Task 1: Main process — version check function + IPC handler

**Files:**
- Modify: `app/src/main/index.js`

The `checkForUpdates` function fetches `https://api.github.com/repos/jebi-sh/jebi/releases/latest`, compares the tag to `app.getVersion()`, detects brew vs DMG, then sends an `update:status` event to the given window. An IPC handler exposes manual triggering from the renderer.

- [ ] **Step 1: Add `checkForUpdates` function**

First, add two imports to the existing import block at the top of `app/src/main/index.js`:

```js
import https from 'https'
import { existsSync } from 'fs'
```

(The file already has `import { promises as fs } from 'fs'` — add `existsSync` as a separate named import on a new line.)

Then add this function near the top, after the imports, before `createWindow`:

```js
function checkForUpdates(win) {
  const current = app.getVersion()
  const options = {
    hostname: 'api.github.com',
    path: '/repos/jebi-sh/jebi/releases/latest',
    headers: { 'User-Agent': 'jebi-app' },
  }
  https.get(options, (res) => {
    let data = ''
    res.on('data', chunk => { data += chunk })
    res.on('end', () => {
      try {
        const json = JSON.parse(data)
        const latest = (json.tag_name || '').replace(/^v/, '')
        const available = latest && latest !== current && compareVersions(latest, current) > 0
        const brewPaths = [
          '/opt/homebrew/Caskroom/jebi',
          '/usr/local/Caskroom/jebi',
        ]
        const installMethod = brewPaths.some(p => fs.existsSync(p)) ? 'brew' : 'dmg'
        win.webContents.send('update:status', {
          available,
          currentVersion: current,
          latestVersion: latest,
          installMethod,
          releaseUrl: json.html_url || 'https://github.com/jebi-sh/jebi/releases/latest',
        })
      } catch {
        win.webContents.send('update:status', { available: false, error: true, currentVersion: current })
      }
    })
  }).on('error', () => {
    win.webContents.send('update:status', { available: false, error: true, currentVersion: current })
  })
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}
```

- [ ] **Step 2: Add IPC handler for manual check**

After the existing `ipcMain.handle` calls (around line 540), add:

```js
ipcMain.handle('update:check', async () => {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) checkForUpdates(wins[0])
})
```

- [ ] **Step 3: Call checkForUpdates on startup**

In `app.whenReady().then(async () => { ... })`, add a call after `createWindow()`:

```js
app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildAppMenu())
  corePort = await getFreePort()
  startCore(corePort)
  try {
    await waitForCore(corePort)
  } catch (e) {
    console.error('[core] failed to start:', e)
  }
  createWindow()
  // Delay slightly so the window is ready to receive IPC
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) setTimeout(() => checkForUpdates(wins[0]), 2000)
})
```

- [ ] **Step 4: Commit**

```bash
git add app/src/main/index.js
git commit -m "feat: add checkForUpdates IPC in main process"
```

---

### Task 2: Preload — expose update API to renderer

**Files:**
- Modify: `app/src/preload/index.js`

- [ ] **Step 1: Add `update` namespace to the contextBridge**

In `app/src/preload/index.js`, add an `update` key inside the existing `contextBridge.exposeInMainWorld('electron', { ... })` object:

```js
update: {
  check: () => ipcRenderer.invoke('update:check'),
  onStatus: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },
},
```

- [ ] **Step 2: Commit**

```bash
git add app/src/preload/index.js
git commit -m "feat: expose update IPC in preload"
```

---

### Task 3: `useUpdateStatus` hook

**Files:**
- Create: `app/src/renderer/src/hooks/useUpdateStatus.js`

Follows the exact singleton listener pattern used by `useAIStatus.js`. Module-level state is shared across all component instances.

- [ ] **Step 1: Create the hook**

```js
import { useState, useEffect } from 'react'

const listeners = new Set()
let currentStatus = {
  available: false,
  currentVersion: '',
  latestVersion: '',
  installMethod: 'dmg',
  releaseUrl: '',
  error: false,
  checking: false,
}

function notifyListeners(status) {
  currentStatus = status
  listeners.forEach(cb => cb(status))
}

export function useUpdateStatus() {
  const [status, setStatus] = useState(currentStatus)

  useEffect(() => {
    listeners.add(setStatus)
    return () => listeners.delete(setStatus)
  }, [])

  return status
}

export function initUpdateStatusListener() {
  window.electron.update.onStatus((data) => {
    notifyListeners({ ...currentStatus, ...data, checking: false })
  })
}

export async function checkForUpdates() {
  notifyListeners({ ...currentStatus, checking: true })
  await window.electron.update.check()
  // result arrives via onStatus — checking: false set there
}
```

- [ ] **Step 2: Register the listener at app startup**

In `app/src/renderer/src/App.jsx`, import and call `initUpdateStatusListener` once:

```js
import { initUpdateStatusListener } from './hooks/useUpdateStatus'

// Inside App component, add a one-time useEffect at the top:
useEffect(() => {
  initUpdateStatusListener()
}, [])
```

Find the App component's existing `useEffect` calls and add this alongside them.

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/hooks/useUpdateStatus.js app/src/renderer/src/App.jsx
git commit -m "feat: add useUpdateStatus hook"
```

---

### Task 4: StatusBar — current version + pulse dot

**Files:**
- Modify: `app/src/renderer/src/components/StatusBar/index.jsx`

Show `v{version}` always on the left. When `available === true`, show a small amber pulsing dot to the left of the version text. Tooltip on the chip says `v{latestVersion} available`.

- [ ] **Step 1: Add CSS keyframe for pulse animation**

At the top of `StatusBar/index.jsx`, after the imports, add a `<style>` injection via a module-level constant:

```js
const pulseStyle = `
  @keyframes jebi-update-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(1.5); }
  }
`
```

Inside the returned JSX, inject it as the very first child of the outer `<div>`:

```jsx
<style>{pulseStyle}</style>
```

- [ ] **Step 2: Import hook and add version chip**

Add the import at the top of `StatusBar/index.jsx`:

```js
import { useUpdateStatus } from '../../hooks/useUpdateStatus'
```

Inside the component, add:

```js
const updateStatus = useUpdateStatus()
const version = updateStatus.currentVersion || __APP_VERSION__
```

Add the version chip as the first element inside the status bar `<div>` (before the transient message span):

```jsx
{/* Version chip — left */}
<span
  title={updateStatus.available ? `v${updateStatus.latestVersion} available` : undefined}
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    opacity: 0.7,
    flexShrink: 0,
    userSelect: 'none',
  }}
>
  {updateStatus.available && (
    <span style={{
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: '#f59e0b',
      display: 'inline-block',
      flexShrink: 0,
      animation: 'jebi-update-pulse 1.8s ease-in-out infinite',
    }} />
  )}
  v{version}
</span>
```

- [ ] **Step 3: Verify status bar always renders when version is known**

The existing guard `if (aiStatus.status === 'unknown' && !message) return null` will hide the bar before AI status is known. Update it to also keep the bar visible when a version is available:

```js
if (aiStatus.status === 'unknown' && !message && !updateStatus.currentVersion) return null
```

- [ ] **Step 4: Commit**

```bash
git add app/src/renderer/src/components/StatusBar/index.jsx
git commit -m "feat: show version + update pulse in status bar"
```

---

### Task 5: AboutSection — Check for updates button + result

**Files:**
- Modify: `app/src/renderer/src/components/Preferences/AboutSection.jsx`

Add a "Check for updates" button below the existing version line. While checking: spinner + disabled. Result text appears inline below the button.

- [ ] **Step 1: Rewrite AboutSection with update check UI**

Replace the full content of `app/src/renderer/src/components/Preferences/AboutSection.jsx` with:

```jsx
import { useState } from 'react'
import logoUrl from '../../assets/jebi-logo.svg'
import { useUpdateStatus, checkForUpdates } from '../../hooks/useUpdateStatus'

const spinnerStyle = `
  @keyframes jebi-spin {
    to { transform: rotate(360deg); }
  }
`

export default function AboutSection() {
  const year = new Date().getFullYear()
  const updateStatus = useUpdateStatus()
  const [checked, setChecked] = useState(false)

  async function handleCheck() {
    setChecked(true)
    await checkForUpdates()
  }

  const showResult = checked && !updateStatus.checking

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px 4px' }}>
      <style>{spinnerStyle}</style>

      {/* Logo + name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <img src={logoUrl} style={{ width: 80, height: 80, flexShrink: 0 }} alt="jebi" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{
            fontSize: 16, fontWeight: 700,
            fontFamily: 'var(--font-ui)', color: 'var(--text-primary)',
          }}>
            {__APP_NAME__}
          </div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)' }}>
            Version {__APP_VERSION__}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--text-muted)', opacity: 0.55, marginTop: 2 }}>
            © {year} All Rights Reserved.
          </div>
        </div>
      </div>

      {/* Update check */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={handleCheck}
          disabled={updateStatus.checking}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            cursor: updateStatus.checking ? 'default' : 'pointer',
            opacity: updateStatus.checking ? 0.6 : 1,
            alignSelf: 'flex-start',
          }}
        >
          {updateStatus.checking && (
            <span style={{
              width: 10,
              height: 10,
              border: '1.5px solid var(--text-muted)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'jebi-spin 0.7s linear infinite',
            }} />
          )}
          {updateStatus.checking ? 'Checking…' : 'Check for updates'}
        </button>

        {showResult && (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12 }}>
            {updateStatus.error && (
              <span style={{ color: 'var(--text-muted)' }}>Could not check for updates. Try again.</span>
            )}
            {!updateStatus.error && !updateStatus.available && (
              <span style={{ color: 'var(--text-muted)' }}>You're up to date.</span>
            )}
            {!updateStatus.error && updateStatus.available && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ color: 'var(--text-primary)' }}>
                  v{updateStatus.latestVersion} is available
                </span>
                {updateStatus.installMethod === 'brew' ? (
                  <BrewInstruction />
                ) : (
                  <a
                    href="#"
                    onClick={e => { e.preventDefault(); window.electron.openExternal(updateStatus.releaseUrl) }}
                    style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 12 }}
                  >
                    Download latest release →
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function BrewInstruction() {
  const [copied, setCopied] = useState(false)
  const cmd = 'brew upgrade --cask jebi'

  function copy() {
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '4px 10px',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-primary)',
      alignSelf: 'flex-start',
    }}>
      {cmd}
      <button
        onClick={copy}
        title="Copy"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: copied ? '#22c55e' : 'var(--text-muted)',
          padding: 0,
          fontSize: 12,
          lineHeight: 1,
        }}
      >
        {copied ? '✓' : '⎘'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/renderer/src/components/Preferences/AboutSection.jsx
git commit -m "feat: add check-for-updates UI in About tab"
```

---

### Task 6: Smoke test

- [ ] **Step 1: Run the app**

```bash
cd /Users/jawahar/Work/me/jebi
make dev
```

- [ ] **Step 2: Verify status bar**

- Bottom status bar shows `v0.1.7` (or current version) on the left
- No pulsing dot (unless there actually is a newer release)

- [ ] **Step 3: Verify About tab**

- Open Preferences → About
- Click "Check for updates"
- Button shows spinner + "Checking…" briefly
- Shows either "You're up to date." or version + install instructions

- [ ] **Step 4: Force an update available state for visual testing**

Temporarily edit `checkForUpdates` in `index.js` to send a hardcoded payload:

```js
// Temporary — remove after testing
win.webContents.send('update:status', {
  available: true,
  currentVersion: app.getVersion(),
  latestVersion: '99.0.0',
  installMethod: 'brew',
  releaseUrl: 'https://github.com/jebi-sh/jebi/releases/latest',
})
```

Restart the app, confirm:
- Pulsing amber dot appears left of version in status bar
- Tooltip on hover shows `v99.0.0 available`
- About tab shows `v99.0.0 is available` + brew command with copy button

- [ ] **Step 5: Revert the temporary hardcoded payload**

Remove the temporary block from `index.js`.

- [ ] **Step 6: Final commit**

```bash
git add app/src/main/index.js
git commit -m "feat: check-for-updates — remove test payload"
```
