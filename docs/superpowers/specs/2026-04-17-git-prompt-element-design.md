# Git Prompt Element — Design Spec

**Date:** 2026-04-17  
**Status:** Approved

---

## Context

The terminal prompt currently shows cwd and exit code. This spec adds a **git context element** — the first in a planned series of context-aware prompt segments (git, docker, k8s, etc.). The goal is to surface the most actionable git state at a glance, directly in the prompt, without the user running any git commands manually.

---

## What We're Building

A git badge element that appears in prompt row 1 whenever the active directory is inside a git repo. It shows branch name, dirty state, and ahead/behind remote count. It disappears entirely in non-git directories.

### Display Format

```
[⎇ main • ↑2 ↓1]
```

| Part | Shown when | Color |
|---|---|---|
| Branch icon (⎇ SVG) | Always | `var(--accent)` |
| Branch name | Always | `var(--text-primary)`, truncated at ~20 chars |
| Dirty dot (•) | Uncommitted changes exist | `var(--accent)` |
| ↑n | Ahead count > 0 | `var(--text-muted)` |
| ↓n | Behind count > 0 | `var(--text-muted)` |

### Click Behavior

- **InputBar prompt** → executes `git status\n` in the active shell
- **xterm decoration prompt** (historical) → copies branch name to clipboard

---

## Data Flow

```
Shell precmd hook (config.go)
  → runs git commands, emits OSC 9002;branch|dirty|ahead|behind
  ↓
session/parser.go parseOSC()
  → intercepts OSC 9002, parses into GitInfo struct
  → wire.Send(TypeGit, gitInfo)
  ↓
WebSocket → useTerminal.js
  → case TypeGit → callbacksRef.current.onGit(data)
  ↓
TerminalPane
  → onGit callback → stores git state, calls onGitDecoration
  ↓
OutputArea
  → threads onGitDecoration to PromptAddon
  ↓
PromptAddon
  → stores gitData on current command
  → re-renders <Prompt gitData={...} />
```

If not in a git repo, the hook emits nothing → no `TypeGit` message → `gitData` is `null` → `GitSegment` is not rendered.

---

## Shell Hook

Added to `segmentEmits` in `core/session/config.go` under key `"git"`:

```bash
_git_info=$(
  branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
  [ -z "$branch" ] && exit 0
  dirty=$(git status --porcelain 2>/dev/null | head -1)
  [ -n "$dirty" ] && dirty=1 || dirty=0
  ahead=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
  behind=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)
  printf '%s|%s|%s|%s' "$branch" "$dirty" "$ahead" "$behind"
)
[ -n "$_git_info" ] && printf '\033]9002;%s\033\\' "$_git_info"
```

`"git"` added to `DefaultConfig.PromptSegments`.

---

## Wire Protocol

### New constant (both files must stay in sync)

**`core/wire/types.go`:**
```go
TypeGit = "git"
```

**`app/src/renderer/src/wire.js`:**
```js
export const TypeGit = 'git'
```

### OSC code: `9002`
Payload format: `branch|dirty|ahead|behind`  
Example: `main|1|2|0`

---

## Go Backend Changes

### `core/session/parser.go`
Add case for OSC code `9002` in `parseOSC()`. Parses pipe-delimited payload into:
```go
type GitInfo struct {
  Branch string `json:"branch"`
  Dirty  bool   `json:"dirty"`
  Ahead  int    `json:"ahead"`
  Behind int    `json:"behind"`
}
```

### `core/session/session.go`
Activate `parseOSC()` in `pipe()` for OSC interception. Raw PTY bytes continue to flow to xterm as `TypeOutput`; OSC 7, 9001, and 9002 are additionally intercepted and sent as typed messages (`TypeCwd`, `TypeExitCode`, `TypeGit`).

> **Note:** This activation is a planned step per CLAUDE.md. It simultaneously enables `TypeCwd` and `TypeExitCode` (previously emitted by the shell hook but silently dropped in `pipe()`). This is intentional — all three message types become live together.

---

## Frontend Components

### New: `app/src/renderer/src/components/Prompt/GitSegment.jsx`

```
Props: { branch, dirty, ahead, behind, onClick }
```

- Single pill button, `rounded-md px-2 py-2` — same as cwd element
- Branch SVG icon (16px) + branch name + conditional dirty dot + conditional ↑n ↓n
- All colors via CSS variables, no hardcoded hex
- `onClick` passed in from parent (see below)

### Modified: `app/src/renderer/src/components/Prompt/index.jsx`

- Accept `gitData` prop (`{ branch, dirty, ahead, behind } | null`)
- Accept `onGitClick` prop
- Render `<GitSegment>` between cwd button and the flex divider when `gitData` is not null
- Pass `onGitClick` as `onClick` to `GitSegment`

### Modified: `app/src/renderer/src/components/InputBar/index.jsx`

- Pass `onGitClick={() => sendInput('git status\n')}` to `<Prompt>`

### Modified: `app/src/renderer/src/addons/PromptAddon.jsx`

- Store `gitData` on each command entry alongside `cwd` and `exitCode`
- `updateLastGit(data)` method sets git data on the current command and re-renders its decoration
- Pass `onGitClick={() => navigator.clipboard.writeText(branch)}` to `<Prompt>` in decorations and sticky header

### Modified: `app/src/renderer/src/hooks/useTerminal.js`

- Add `case wire.TypeGit` in the WebSocket message handler
- Call `callbacksRef.current.onGit?.(JSON.parse(msg.data))`

### Modified: `app/src/renderer/src/components/TerminalPane/index.jsx`

- Add `onGit` callback: stores git data in state, calls `onGitDecoration` callback
- Pass `onGitDecoration` down to `OutputArea`

### Modified: `app/src/renderer/src/components/OutputArea/index.jsx`

- Accept `onGitDecoration` prop, pass through to `PromptAddon` on mount

---

## New Icon

`app/src/renderer/src/icons/GitBranchIcon.jsx` — SVG branch icon, `{ size = 16, color = 'currentColor' }` props.

---

## Verification

1. `cd` into a git repo → git element appears with branch name
2. Modify a tracked file (don't commit) → dirty dot appears
3. Commit ahead of remote → `↑1` count appears
4. `cd` to a non-git directory → git element disappears
5. Click git element in InputBar → `git status` runs in terminal
6. Click git element in an xterm decoration → branch name copied to clipboard
7. Switch themes → all git element colors update (no hardcoded colors)
8. Two panes in different repos → each shows its own git state independently
