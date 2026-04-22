# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What We Are Building

A modern developer terminal for **Mac and Linux** — a ground-up rethink of how developers interact with a shell, not a wrapper around an existing terminal.

### Core Goals
- **Better input UX** — syntax highlighting, autocomplete, natural language commands
- **Better output UX** — rich React rendering of known command outputs; xterm.js as fallback
- **Blazingly fast** — GPU-accelerated rendering, Go for all heavy lifting
- **AI as first-class input** — natural language → shell command, inline error explanation

---

## Tech Stack

| Layer | Technology |
|---|---|
| App shell | Electron (bundles Chromium — consistent Mac + Linux rendering) |
| UI framework | React 19 + Tailwind CSS v4 |
| Build tool | electron-vite |
| Terminal rendering | xterm.js (`@xterm/xterm`) via WebGL |
| PTY + backend | Go binary (`core/`) |
| PTY library | `creack/pty` |
| Transport | WebSocket on `localhost:7070` |

---

## How to Run

```bash
# Terminal 1 — Go core
cd core
go build -o term-core .
./term-core

# Terminal 2 — Electron + React
cd app
npm install
npm run dev
```

Other app scripts: `npm run build`, `npm run preview`.

---

## Architecture

```
Electron Renderer (React)
  ↕ WebSocket ws://localhost:7070
Go core binary  (PTY manager + shell hook)
  ↕ PTY
OS Shell (zsh/bash)
```

Each terminal pane gets its own WebSocket connection to the Go core. The Go core spawns one shell process per connection.

---

## Go Core (`core/`)

**Entry:** `main.go` — HTTP server that upgrades every connection to WebSocket and creates a `session.Session`.

**`session/session.go`** — One `Session` = one WebSocket + one PTY. Key lifecycle:
1. `New()` opens PTY, spawns shell, injects shell hook (see below), sends `config` message, then emits `__TERM_READY__` marker.
2. `Start()` reads from WebSocket (input/resize/kill) and forwards to PTY; runs `pipe()` in a goroutine.
3. `pipe()` reads PTY output, drops all bytes until the `__TERM_READY__` marker appears, then forwards raw output as `TypeOutput` messages. The marker prevents shell init noise (echo, hook setup) from reaching xterm.

**`session/parser.go`** — Two parsers exist but are **not currently called** from `pipe()` (inactive/dead code):
- `parseOSC()` — extracts OSC sequences (e.g. `\033]7;...`) and returns them as payload strings alongside cleaned output.
- `parseVT()` — detects TUI enter/exit signals and strips private-mode sequences from the output stream.

**`session/config.go`** — `Config` (shell + promptSegments) and `buildShellHook()`. On connect, the hook is injected into the shell to emit OSC sequences before each prompt:
- `cwd` → `printf '\033]7;%s\033\\' "$PWD"` → intended for `TypeCwd` message (not yet wired on frontend)
- `exit_code` → `printf '\033]9001;%s\033\\' "$?"` → intended for `TypeExitCode` message (not yet wired)
- Prompt is suppressed entirely (`PROMPT=''`); the shell sends a new precmd when a new prompt fires.
- `DefaultConfig` is hardcoded; `app/settings/config.json` holds the reference config (`{ "promptSegments": ["cwd", "exit_code"] }`).

**`wire/`** — `Wire` struct wraps a WebSocket connection with typed send/receive. Message type constants are in `types.go` — **keep in sync with `app/src/renderer/src/wire.js`**.

---

## Electron App (`app/`)

### Main Process (`src/main/index.js`)
Spawns the Go core binary on app launch (`startCore()`) and kills it on `will-quit`. Registers `Cmd+N` for new windows. In dev, the binary path resolves to `../core/term-core` relative to the app directory. In packaged builds it resolves to `process.resourcesPath/term-core`.

### Renderer (`src/renderer/src/`)

**State architecture:**
- `SessionStoreProvider` (in `main.jsx`) holds per-pane session data keyed by `paneId` in React context. Fields: `tuiMode`, `isRunning`, `segmentData`, `config`. Currently only `deleteSession` is actively used (on pane close); the other fields are not yet written to.
- `useTerminal(paneId, callbacksRef)` manages one WebSocket connection. Provides `sendInput`, `sendRaw`, `sendResize`. Uses `callbacksRef` (a stable ref of callbacks) to deliver data to `OutputArea` without re-renders. Does **not** handle `TypeCwd`, `TypePrompt`, `TypeTui`, or `TypeConfig` messages yet — only `TypeOutput` is handled.

**Layout system:**
- `App.jsx` manages tabs and pane layout trees.
- `utils/layoutTree.js` — pure functions for a binary tree of pane splits: `{ type: 'leaf', paneId }` or `{ type: 'split', direction, ratio, first, second }`. `direction: 'horizontal'` = side-by-side; `vertical` = stacked.
- `App.jsx` renders panes as **flat absolutely-positioned siblings** using `computePaneRects` + `computeDividers` (not via `PaneContainer`). This keeps React keys stable across layout mutations — existing terminals never remount when the layout changes. `PaneContainer` exists in the codebase but is currently unused.

**Output rendering:**
- All output goes directly to **xterm.js**, all the time. There is no dual-mode switching or React-rendered command blocks.
- `OutputArea` mounts a single `Terminal` instance, registers `WebglAddon` + `PromptAddon` + `FitAddon`, and wires `callbacksRef.onOutput` → `term.write()`.
- xterm.js observes `rootRef` (not `xtermContainerRef`) for resize — observing the xterm container causes a feedback loop.
- `WebglAddon` (`@xterm/addon-webgl`) is loaded after `term.open()`. It provides GPU-accelerated rendering. `onContextLoss` disposes it so xterm falls back to canvas 2D. `allowTransparency` is NOT used — background color is set explicitly via `cssVar('--bg-surface')` in the theme.
- `scrollback: 10000` — default 1000 is too small for real use.
- `smoothScrollDuration: 100` — smooth viewport scrolling.
- Output buffering for hidden tabs: up to 512 KB buffered in `pendingRef`, flushed when tab becomes visible.

**PromptAddon (`addons/PromptAddon.jsx`):**
- An xterm.js addon using the Decoration + Marker APIs to render a React `<Prompt>` component above each command's output.
- `commandStart(command)` registers a marker at the current cursor row, writes `PROMPT_HEADER_ROWS + commandLines` blank terminal rows to reserve space, then mounts a React root via `createRoot` inside the decoration element.
- Each reserved row maps 1-to-1 with one terminal cell. The actual cell height is read from xterm's internal renderer (`_core._renderService.dimensions.css.cell.height`) and passed to `<Prompt>` as `rowHeight` so the component fills exactly the reserved space.
- Decoration `onRender`: sets `width: 100%`, `overflow: hidden`, `backgroundColor` from `--bg-surface`. Does NOT set `display` or `visibility` — xterm controls these during viewport scroll.
- `getStickyCommand(viewportY)`: returns the command with the highest marker line still above the viewport top. Used by `OutputArea` for the sticky header overlay.
- TUI enter/exit: `enterTui()` / `exitTui()` toggle `visibility` on all decoration elements.
- `_commands[]` tracks `{ marker, command }` pairs for sticky header logic.

**Sticky header (`OutputArea`):**
- `term.onScroll` fires on every viewport scroll. Calls `promptAddon.getStickyCommand(viewportY)` and stores result in `stickyCommand` state.
- A `<Prompt>` overlay renders at `position: absolute; top: 0; zIndex: 10` when `stickyCommand` is set.
- Behaviour: the prompt for the current command sticks to the top of the terminal while any of its output is visible. Clears when the user scrolls back to the bottom or a new command starts.

**Prompt (`components/Prompt/`):**
- Used in BOTH xterm decorations and InputBar (row 1) and as the sticky overlay.
- Two-line layout: row 1 = segment group + `WaveSeparator` + optional copy button; rows 2+ = one div per command line (only in xterm decoration / sticky; InputBar uses the textarea as row 2).
- Segments rendered inline from props: `cwd` → `CwdSegment`, `gitData` → `GitSegment`, `nodeData` → `NodeSegment`. New segments are added directly in `Prompt/index.jsx` — there is no central segment registry.
- CwdSegment click calls `window.electron?.openPath(cwd)` (IPC exposed from main → renderer preload).
- `WaveSeparator` is always rendered between segments and the copy button; it animates into a sine wave while `running` is true, flat otherwise.
- `rowHeight` prop (default 28) controls each row's pixel height. In xterm decorations, this is set to the actual terminal cell height so rows align perfectly.
- Font size uses `--font-size-mono` CSS variable — never hardcoded.
- **Prompt style presets** (`preferences/promptStyles.js`): Wave, Powerline, Pill, Slant, Minimal. A preset defines `group.radius` (`0 | number | 'dynamic' | 'pill'`), `group.connected`, `group.rightCap` (`round | triangle | slant | square | none`), and `separator` (`wave | triangle | slash | dot | none`). Between-segment separators live in `components/Prompt/separators/` (`TriangleSeparator`, `SlashSeparator`, `DotSeparator`); `WaveSeparator` sits at the Prompt root.
- **Reading the active style:** `Prompt` subscribes via `useSyncExternalStore(subscribePromptStyle, getPromptStyleId)` against a **module-level** store in `promptStyles.js` — NOT React context. This is required because Prompt is also mounted inside xterm decoration roots created by `createRoot()` that live outside `PreferencesProvider`. `usePreferences.setPromptStyle` writes through `setPromptStyleId` to keep context and module store in sync.

**InputBar (`components/InputBar/`):**
- Textarea with auto-height resizing (no scroll, always shows full content). `Enter` submits, `Shift+Enter` inserts newline.
- Renders `<Prompt>` as row 1 above the textarea. Currently passed `segments={[]}` and `exitCode={0}` (shell data not yet wired).
- Hidden while a command is running (`running` state in `TerminalPane`); shown again when OSC 9001 exit code sequence is received.

**PromptLine (`components/PromptLine/`):**
- Legacy component that renders a `❯` chevron (red on non-zero exit). The active segment rendering path is now `Prompt/index.jsx` directly — do not wire new segments through `PromptLine`.

**TabBar (`components/TabBar/`):**
- Supports two positions: `'top'` (horizontal strip) and `'left'` (vertical sidebar).
- Toggle button switches between the two layouts.

**Preferences (`components/Preferences/` + `preferences/` + `hooks/usePreferences.jsx`):**
- `PreferencesProvider` (`hooks/usePreferences.jsx`) wraps the app. State is persisted to `localStorage` under key `term-prefs`; defaults come from `preferences/defaults.js`.
- On every prefs change: resolves the active color palette (named theme from `preferences/themes.js` OR `customColors` when `themeId === 'custom'`), calls `applyThemeToCSSVars` to write CSS vars on `body`, and mirrors `promptStyleId` into the module-level store via `setPromptStyleId` so xterm-decoration Prompts re-render.
- Preferences UI lives in `components/Preferences/`:
  - `AppearanceSection` — host section
  - `ThemeGrid` / `ThemeSwatch` — named theme picker (includes a "custom" slot that forks the current theme on selection)
  - `CustomColorPickers` — per-role color editors when `themeId === 'custom'`
  - `FontSizeControl` — clamped 11–22
  - `PromptStyleGrid` / `PromptStyleSwatch` — preview + select prompt style presets
- API exposed by `usePreferences()`: `{ prefs, activeColors, setTheme, setCustomColor, setFontFamily, setFontSize, setPromptStyle }`.
- **Important:** when adding any new pref that must be visible inside xterm decoration roots, follow the same pattern as `promptStyleId` — keep a module-level reactive store that the decoration consumer subscribes to with `useSyncExternalStore`. React context alone will not reach those roots.

**StatusBar (`components/StatusBar/`):**
- Bottom bar, currently renders a static "Terminal" label. Placeholder for future status info.

**`ansi.js`:** ANSI escape code constants (SGR colors, bold, reset, etc.) for use when writing styled output to xterm.

**Keyboard shortcuts** (defined in `App.jsx` via `useKeyboardShortcuts`):
| Shortcut | Action |
|---|---|
| `Cmd+T` | New tab |
| `Cmd+W` | Close active pane |
| `Cmd+D` | Split right |
| `Cmd+Shift+D` | Split down |
| `Cmd+N` | New window (Electron global) |

---

## WebSocket Message Protocol

Both sides use `{ "type": "...", "data": ... }`. Type constants live in `core/wire/types.go` (Go) and `app/src/renderer/src/wire.js` (JS) — always update both.

### Frontend → Go
| Type | Data |
|---|---|
| `input` | string (command text + `\n`, or raw key data) |
| `resize` | `{ cols, rows }` |
| `kill` | — |

### Go → Frontend
| Type | Data |
|---|---|
| `config` | `{ shell, promptSegments }` — sent once on connect |
| `output` | string (raw PTY bytes) |
| `cwd` | string (current working directory) — emitted by shell hook; **not yet handled on frontend** |
| `exit_code` | string (numeric exit code) — emitted by shell hook; **not yet handled on frontend** |
| `prompt` | — (signals a new prompt is ready) — **not yet emitted or handled** |
| `tui` | `"enter"` or `"exit"` — **not yet emitted or handled** |

---

## Key Design Rules

1. **Go `pipe()` is pass-through** — raw PTY bytes go straight to xterm, no parsing. `parser.go` exists for future use but is not called.
2. **xterm.js observes `rootRef`, not `xtermContainerRef`** — observing the xterm container causes a resize feedback loop.
3. **`useTerminal.js` owns all WebSocket state** — no other component talks to Go directly.
4. **Wire type constants must stay in sync** — `core/wire/types.go` and `app/src/renderer/src/wire.js` are the two sources of truth.
5. **All colors and font sizes use CSS variables** — never hardcode hex or px values. `--font-size-mono` and `--font-size-ui` are the single source of truth for font sizes. Theme switching redefines the variable set on the `body` class.
6. **Panes are flat absolute siblings** — App.jsx uses `computePaneRects` to position panes absolutely, not recursive `PaneContainer` nesting. This keeps React keys stable.
7. **No React StrictMode** — removed because double-effect invocation opens two WebSockets per pane in dev. See `main.jsx` comment.
8. **WebGL requires explicit background** — `allowTransparency` is not used with WebglAddon. Set `theme.background` from `cssVar('--bg-surface')` directly.
9. **Prompt rows must match terminal cell height** — `PromptAddon` passes the actual `cellHeight` to `<Prompt>` as `rowHeight`. Total component height must equal `promptRows * cellHeight`. Never use a fixed px value for row height in the Prompt component.

---

## Current Status

### Implemented
- Go core: PTY lifecycle, WebSocket server, shell hook injection, `__TERM_READY__` init gate
- Go parser.go: OSC + VT parser (written, not yet active in pipe)
- Electron: main process spawns Go core on launch, kills on quit; multi-tab, horizontal/vertical pane splitting, drag-to-resize dividers
- Tab bar: toggleable between top-horizontal and left-sidebar layouts
- Custom `InputBar` (auto-height textarea, no xterm for input), xterm.js `OutputArea`, `PromptLine`, `StatusBar`
- `PromptAddon` — renders React `<Prompt>` decoration above each command in xterm; sticky header overlay while output is in viewport
- `WebglAddon` — GPU-accelerated rendering; 10 000-line scrollback; smooth scrolling
- Two-line `Prompt` layout — row 1: segments (cwd/git/node) + wave separator + copy button, rows 2+: command lines
- Prompt style presets (Wave / Powerline / Pill / Slant / Minimal) with per-preset separators in `components/Prompt/separators/`
- Preferences system with persistent localStorage (`term-prefs`): theme (named + custom colors), font family, font size, prompt style — with a module-level store for prompt style so xterm-decoration Prompts stay in sync
- `InputBar` hidden while command is running (generic TUI + blocking command detection via OSC 9001)
- TUI app detection: prompt decorations hidden on alternate-screen enter; xterm focused
- Output buffering for hidden tabs (512 KB cap)
- Font sizes controlled via `--font-size-mono` / `--font-size-ui` CSS variables
- `ansi.js` — ANSI escape code constants
- **Ghost text autocomplete** — fish-shell-style inline suggestions in `InputBar`:
  - `useSharedHistory` (`hooks/useSharedHistory.js`) — module-level history array shared across all panes in the same window; persisted to `localStorage` under key `term-history`; synced across separate windows via `BroadcastChannel('term-history')`
  - Only successful commands (exit code 0) are added to history — failed commands are discarded
  - `GhostTextPlugin` (CM6 `ViewPlugin`) in `useShellEditor.js` — renders the suffix of the best `startsWith` match as a muted widget decoration after the cursor
  - Up/Down with non-empty input cycles through filtered history matches (most-recent first) without modifying the typed text; Up/Down with empty input retains full history navigation
  - Tab or Right arrow (at end of input) accepts the ghost suggestion

### Planned / TODO
- Wire `TypeCwd` + `TypeExitCode` through Go parsers → frontend → `InputBar` and `Prompt` segments
- Wire `TypePrompt` + `TypeTui` (reactivate `parser.go` in `pipe()`)
- Rich output renderers (FileList, GitStatus, JsonTree, etc.) — Go classifier + React components
- AI natural language input mode

---

# Core Principle
Write code that is easy to read, easy to change, and hard to break.

Prefer clarity over cleverness.
Optimize for long-term maintainability, not short-term speed.

---

# Component Design

- Use functional components only
- Keep components small and focused (<200 lines)
- One component = one responsibility
- Extract reusable logic into custom hooks
- Avoid deeply nested JSX → split into subcomponents

---

# State Management

- Prefer local state first
- Use global state ONLY when necessary
- Avoid prop drilling → use context or composition
- Use React Query (or equivalent) for server state
- Never mix server state and UI state

---

# Performance

- Avoid unnecessary re-renders
- Use memoization ONLY when needed (React.memo, useMemo, useCallback)
- Do NOT prematurely optimize
- Lazy load heavy components
- Avoid inline functions in large lists

---

# Data Fetching

- Use a dedicated data layer (React Query / hooks)
- No fetching inside UI components directly
- Handle loading, error, and empty states explicitly

---

# Code Structure

- Follow feature-based structure:
  /features/
    /auth/
    /dashboard/
    /billing/

- Each feature contains:
  - components/
  - hooks/
  - services/
  - types/

---

# Naming

- Use clear, descriptive names
- Avoid abbreviations
- Boolean → is/has/can (isLoading, hasError)
- Handlers → handleClick, handleSubmit

---

# Styling

- No inline styles
- Use Tailwind / CSS modules consistently
- Keep styles close to components

---

# Error Handling

- Never ignore errors
- Always handle API failures gracefully
- Show meaningful UI feedback

---

# Reusability

- Extract repeated UI into shared components
- Avoid duplication
- Prefer composition over inheritance

---

# Clean Code Rules

- No commented-out code
- No console.logs in production
- Remove dead code immediately
- Keep functions small and readable

---

# Type Safety

- Use strict TypeScript
- Avoid 'any'
- Define proper interfaces/types

---

# Testing Mindset

- Write code that is testable
- Avoid tight coupling
- Separate logic from UI

---

# When generating or modifying code

Always:
1. Refactor for clarity
2. Improve naming
3. Reduce complexity
4. Check performance implications
5. Ensure consistency with existing structure