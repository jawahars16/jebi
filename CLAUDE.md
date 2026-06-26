# jebi — Codebase Guide

## Architecture

- `core/` — Go PTY server (term-core binary). Manages shell sessions over WebSocket, streams output, runs AI via llama-server.
- `app/` — Electron app (electron-vite + React). Renderer = xterm.js + React UI. Main = IPC handlers, AI config, model downloads.
- `core/bin/` — Pre-built llama.cpp binaries (not committed — fetched via `make deps`).

## Platform

**Apple Silicon only — macOS 14 Sonoma or later.** Intel support was dropped. x64 targets removed from build config.

## Key commands

```bash
make deps    # download llama.cpp binaries for arm64 (from jebi-sh/llama-deps releases)
make dev     # build Go core + npm install + electron-vite dev
make build   # full release build (DMG + ZIP)
make install # copy .app to /Applications
```

## Important files

| File | Purpose |
|---|---|
| `core/session/session.go` | PTY session, WebSocket, AI dispatch |
| `core/session/detect.go` | Shell env detection (git, node, go…), context banner |
| `app/src/main/index.js` | Electron main — IPC, model registry, AI config, alias save, quit confirmation |
| `app/src/renderer/src/addons/PromptAddon.jsx` | xterm decoration system (prompt, status bar, sparkles save button) |
| `app/src/renderer/src/components/OutputArea/index.jsx` | xterm init, PTY output handling, overlay rendering |
| `app/src/renderer/src/components/TerminalPane/index.jsx` | Per-pane state, AI suggestions, input bar, close/quit confirmation |
| `app/src/renderer/src/components/SaveShortcutPopover/index.jsx` | Popover to save command as shell alias or /command |
| `app/src/renderer/src/components/ConfirmDialog/index.jsx` | Confirmation dialog for close/quit with running commands |
| `app/src/renderer/src/components/FileListPanel/index.jsx` | /ls file explorer panel |
| `app/src/renderer/src/commands/registry.js` | Slash command definitions (/ls, /ports, /run…) |
| `app/src/renderer/src/hooks/useKeyboardShortcuts.js` | Global keyboard shortcut hook — handles macOS Option key remapping via e.code |
| `app/src/renderer/src/preferences/palettes.js` | 20 dark color palettes (no named themes like Catppuccin) |
| `app/src/renderer/src/preferences/defaults.js` | Default prefs — themeId: 'navy', tabBarPosition: 'top' |
| `app/src/renderer/src/hooks/usePreferences.jsx` | Preferences context + localStorage persistence |
| `scripts/download-deps.sh` | Fetches llama binaries from jebi-sh/llama-deps release |
| `.github/workflows/release.yml` | Manual release workflow — bump version, build, publish |

## AI model registry

Defined in `app/src/main/index.js` → `MODEL_REGISTRY`. Seven models:
- Qwen3 4B (Great all-round)
- Qwen3 8B (Best quality)
- Gemma 3 4B (Balanced)
- Qwen2.5-Coder 3B (Code/terminal focus)
- Qwen2.5 1.5B (Fastest)
- Phi-3 Mini 3.8B (High quality)
- Gemma 2 2B (Balanced)

## Palette system

20 handcrafted dark color palettes in `palettes.js`. No named themes (Catppuccin etc. were removed).  
Default is `navy` (`#0c1f40`). User can change in Preferences → Appearance.  
`THEMES` in `themes.js` maps palette IDs to color objects. Fallback always uses `THEMES['navy']`.

## Keyboard shortcuts

`useKeyboardShortcuts` hook in `app/src/renderer/src/hooks/useKeyboardShortcuts.js`.  
**Important:** Uses `e.code` fallback alongside `e.key` because macOS Option key remaps numbers (⌥1 → `¡`).  
AI suggestion shortcuts: `⌘⌥1/2/3` — picks suggestion 1/2/3.

## Save-as-shortcut feature

Sparkles icon (✦✦) on prompt decoration opens `SaveShortcutPopover`.  
- Shell alias: writes to `~/.zshrc` / `~/.bashrc` / fish config (auto-detected from `$SHELL`), then sources the file automatically.  
- /command: appends to `~/.config/jebi/commands.json`, available immediately.  
IPC: `alias:save` in `app/src/main/index.js`. Shell rc basename exposed via `shellRcBasename` in preload.

## Close/quit confirmation

When a pane has a running command, closing the tab/pane or quitting shows `ConfirmDialog`.  
Electron `before-quit` → IPC `app:quit-requested` → renderer checks panes → `app:confirm-quit` / `app:cancel-quit`.

## Release process

Trigger manually via GitHub Actions → Release → Run workflow → enter version (e.g. `0.1.16`).  
Workflow: bumps package.json → builds arm64 only → publishes GitHub Release → updates `jebi-sh/homebrew-tap`.  
Homebrew formula has `depends_on macos: ">= :sonoma"` and `depends_on arch: :arm64`.

## llama deps

Binaries live in `jebi-sh/llama-deps` releases as `llama-deps-arm64.tar.gz`.  
`make deps` fetches via curl (no auth needed — public repo).  
`app/package.json` uses glob `{"from": "../core/bin/", "to": ".", "filter": ["llama-server", "*.dylib"]}` to bundle all dylibs dynamically.

## Known issues

See `KNOWN_BUGS.md` (local only, not committed).

## Marketing

Marketing assets are in `/Users/jawahar/Work/me/jebi-marketing/` (outside this repo).  
Includes screenshots, videos, PH slides, Twitter post schedule, and `CONTEXT.md` for onboarding a new session.  
Website lives at `/Users/jawahar/Work/me/website/`.
