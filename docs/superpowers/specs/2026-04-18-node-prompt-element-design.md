# Node.js Prompt Element — Design Spec

**Date:** 2026-04-18  
**Status:** Approved

---

## Context

Following the git prompt element, this spec adds a **Node.js context element** — the second context-aware prompt segment. It surfaces the active Node.js version and package manager when the terminal is inside a Node project, disappearing entirely outside one.

---

## What We're Building

A node badge in prompt row 1 that appears whenever a `package.json` is found in `$PWD` or any parent directory. Shows node version and detected package manager. Disappears when no `package.json` is found.

### Display Format

```
[node-icon v20.11.0 · npm]
```

| Part | Shown when | Style |
|---|---|---|
| Node icon (Phosphor `Package`) | Always | `var(--accent)` |
| Version string | Always | `var(--text-primary)`, e.g. `v20.11.0` |
| `·` separator | Always | `var(--text-muted)` |
| Package manager | Always | `var(--text-muted)`, plain text: `npm` / `yarn` / `pnpm` / `bun` |

### Click Behavior

- **InputBar prompt** → runs the package manager's list command in the active shell: `npm run` / `yarn run` / `pnpm run` / `bun run`
- **xterm decoration prompt** (historical) → copies node version to clipboard

### Positioning

Sits inside the same pill as the git badge. A thin vertical separator appears between git and node badges when both are present.

---

## Data Flow

```
Shell precmd hook (config.go)
  → walks up from $PWD for package.json
  → if not found: emits nothing → no TypeNode → badge disappears
  → if found: runs node --version, detects PM from lockfiles
  → emits OSC 9003;version|packageManager
  ↓
session/pipe() (session.go)
  → intercepts OSC 9003, sends TypeNode wire message
  ↓
WebSocket → useTerminal.js
  → case TypeNode → parses "v20.11.0|npm" → calls onNode({ version, packageManager })
  ↓
TerminalPane
  → onNode → setNodeData(data), calls onNodeDecoration(data)
  ↓
OutputArea
  → registers onNodeDecoration on callbacksRef
  → calls promptAddon.updateLastNode(data)
  ↓
PromptAddon
  → stores nodeData on current command entry
  → re-renders <Prompt nodeData={...} />
```

`nodeData` resets to `null` when `onCwd` fires — same stale-state prevention as git.

---

## Shell Hook

Added to `segmentEmits` in `core/session/config.go` under key `"node"`:

```bash
  _node_pkg=$(
    _d="$PWD"
    while [ "$_d" != "/" ] && [ "$_d" != "$HOME" ]; do
      [ -f "$_d/package.json" ] && echo "$_d" && break
      _d=$(dirname "$_d")
    done
  )
  if [ -n "$_node_pkg" ]; then
    _node_ver=$(node --version 2>/dev/null)
    if [ -n "$_node_ver" ]; then
      if [ -f "$_node_pkg/bun.lockb" ] || [ -f "$_node_pkg/bun.lock" ]; then
        _node_pm=bun
      elif [ -f "$_node_pkg/pnpm-lock.yaml" ]; then
        _node_pm=pnpm
      elif [ -f "$_node_pkg/yarn.lock" ]; then
        _node_pm=yarn
      else
        _node_pm=npm
      fi
      printf '\033]9003;%s|%s\033\\' "$_node_ver" "$_node_pm"
    fi
  fi
```

`"node"` added to `DefaultConfig.PromptSegments`.

---

## Wire Protocol

### New constant (both files must stay in sync)

**`core/wire/types.go`:**
```go
TypeNode = "node"
```

**`app/src/renderer/src/wire.js`:**
```js
export const TypeNode = 'node'
```

### OSC code: `9003`
Payload format: `version|packageManager`
Example: `v20.11.0|npm`

---

## Go Backend Changes

### `core/session/session.go`
Add case for `9003;` prefix in `pipe()` switch:
```go
case strings.HasPrefix(p, "9003;"):
    s.w.Send(wire.StringMessage(wire.TypeNode, strings.TrimPrefix(p, "9003;")))
```

### `core/session/config.go`
- Add `"node"` entry to `segmentEmits`
- Add `"node"` to `DefaultConfig.PromptSegments`

---

## Frontend Components

### New: `app/src/renderer/src/components/Prompt/NodeSegment.jsx`

```
Props: { version, packageManager, onClick }
```

- Button styled same as `GitSegment` (no border, flex, gap)
- `Package` Phosphor icon (accent color, size 14)
- Version string in `--text-primary`
- `·` + package manager name in `--text-muted`
- `onClick` passed from parent

### Modified: `app/src/renderer/src/components/Prompt/index.jsx`

- Accept `nodeData` prop (`{ version, packageManager } | null`) and `onNodeClick`
- Render vertical separator when both `gitData` and `nodeData` are present
- Render `<NodeSegment>` after git badge when `nodeData` is not null

### Modified: `app/src/renderer/src/hooks/useTerminal.js`

```js
case wire.TypeNode: {
  const [version, packageManager] = msg.data.split('|')
  callbacksRef.current.onNode?.({ version, packageManager })
  break
}
```

### Modified: `app/src/renderer/src/components/TerminalPane/index.jsx`

- Add `nodeData` state (reset to `null` in `onCwd`)
- Add `onNode` callback → `setNodeData(data)` + `callbacksRef.current.onNodeDecoration?.(data)`
- Pass `nodeData` and `onNodeClick` to `InputBar`:
  - `onNodeClick={() => handleSubmit(`${nodeData.packageManager} run`)}`

### Modified: `app/src/renderer/src/components/OutputArea/index.jsx`

- Register `onNodeDecoration` on `callbacksRef` inside useEffect
- Pass `nodeData` + `onNodeClick` to sticky header `<Prompt>`

### Modified: `app/src/renderer/src/addons/PromptAddon.jsx`

- Add `nodeData: null` to entry initialisation
- Add `updateLastNode(nodeData)` method
- In `_renderEntry()`: pass `nodeData` and `onNodeClick` — where `onNodeClick` is `() => navigator.clipboard.writeText(entry.nodeData.version)` (copy version, not run command)
- Return `nodeData` from `getStickyCommand()`; sticky header in `OutputArea` uses the same clipboard copy for `onNodeClick`

### Modified: `app/src/renderer/src/components/InputBar/index.jsx`

- Accept `nodeData` and `onNodeClick` props, pass to `<Prompt>`

---

## Verification

1. `cd` into a Node project → node badge shows version + package manager
2. `cd` into a nested subdirectory → badge still shows (walks up to `package.json`)
3. `cd` to non-Node directory → badge disappears
4. `pnpm-lock.yaml` present → shows `pnpm`; `yarn.lock` → `yarn`; `bun.lockb` → `bun`; none → `npm`
5. Click node badge in InputBar → `npm run` / `yarn run` / `pnpm run` / `bun run` fires
6. Click node badge in xterm decoration → node version copied to clipboard
7. Git + Node both present → both badges visible with `|` separator between them
8. Only one present → only that badge shows, no orphan separator
