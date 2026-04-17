# Git Prompt Element Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a git context badge to the terminal prompt that shows branch name, dirty state, and ahead/behind counts — disappearing entirely outside git repos.

**Architecture:** The shell's `precmd` hook emits an OSC 9002 sequence with pipe-delimited git data. Go's `pipe()` intercepts it and sends a `TypeGit` wire message. React parses it and stores git state per-command in `PromptAddon`, rendering a `GitSegment` badge in prompt row 1 for both InputBar and xterm decorations. InputBar click runs `git status`; xterm decoration click copies branch name.

**Tech Stack:** Go (OSC parsing, wire protocol), React 19, xterm.js Decoration API, CSS variables for theming.

---

## File Map

| File | Change |
|---|---|
| `core/wire/types.go` | Add `TypeGit = "git"` |
| `core/session/config.go` | Add git to `segmentEmits` + `DefaultConfig` |
| `core/session/session.go` | Add OSC 9002 routing case in `pipe()` |
| `core/session/session_test.go` | **New** — Go tests for OSC 9002 routing |
| `app/src/renderer/src/wire.js` | Add `TypeGit = 'git'` |
| `app/src/renderer/src/icons/GitBranchIcon.jsx` | **New** — SVG branch icon |
| `app/src/renderer/src/components/Prompt/GitSegment.jsx` | **New** — git badge component |
| `app/src/renderer/src/components/Prompt/index.jsx` | Accept `gitData`/`onGitClick`, render `GitSegment` |
| `app/src/renderer/src/hooks/useTerminal.js` | Add `TypeGit` case, parse payload |
| `app/src/renderer/src/components/TerminalPane/index.jsx` | Add `gitData` state + `onGit` callback |
| `app/src/renderer/src/components/OutputArea/index.jsx` | Register `onGitDecoration`, update sticky header |
| `app/src/renderer/src/addons/PromptAddon.jsx` | Add `gitData` to entries, `updateLastGit`, update all renders |
| `app/src/renderer/src/components/InputBar/index.jsx` | Accept + pass `gitData`/`onGitClick` to Prompt |

---

### Task 1: TypeGit wire constant

**Files:**
- Modify: `core/wire/types.go`
- Modify: `app/src/renderer/src/wire.js`

- [ ] **Step 1: Add TypeGit to Go wire constants**

In `core/wire/types.go`, add `TypeGit` to the const block:

```go
package wire

const (
	TypeInput    = "input"
	TypeOutput   = "output"
	TypeCwd      = "cwd"
	TypeExitCode = "exit_code"
	TypeGit      = "git"
	TypePrompt   = "prompt"
	TypeTui      = "tui"
	TypeConfig   = "config"
	TypeKill     = "kill"
	TypeResize   = "resize"
)
```

- [ ] **Step 2: Add TypeGit to JS wire constants**

In `app/src/renderer/src/wire.js`:

```js
// Message type constants — must stay in sync with core/wire/types.go
export const TypeInput    = 'input'
export const TypeOutput   = 'output'
export const TypeCwd      = 'cwd'
export const TypeExitCode = 'exit_code'
export const TypeGit      = 'git'
export const TypePrompt   = 'prompt'
export const TypeTui      = 'tui'
export const TypeConfig   = 'config'
export const TypeKill     = 'kill'
export const TypeResize   = 'resize'
```

- [ ] **Step 3: Verify Go compiles**

```bash
cd /Users/jawahar/Work/terminal/term/core && go build ./...
```

Expected: no output (clean build).

- [ ] **Step 4: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add core/wire/types.go app/src/renderer/src/wire.js
git commit -m "feat: add TypeGit wire constant"
```

---

### Task 2: Git shell hook

**Files:**
- Modify: `core/session/config.go`

- [ ] **Step 1: Write the failing test**

Create `core/session/config_test.go`:

```go
package session

import "testing"

func TestBuildShellHookIncludesGit(t *testing.T) {
	cfg := Config{
		Shell:          "",
		PromptSegments: []string{"cwd", "git"},
	}
	hook := buildShellHook(cfg, "/bin/zsh")

	if !contains(hook, "9002") {
		t.Errorf("expected hook to contain OSC 9002 git emission, got:\n%s", hook)
	}
	if !contains(hook, "symbolic-ref") {
		t.Errorf("expected hook to contain git branch detection, got:\n%s", hook)
	}
}

func TestBuildShellHookOmitsGitWhenNotConfigured(t *testing.T) {
	cfg := Config{
		Shell:          "",
		PromptSegments: []string{"cwd"},
	}
	hook := buildShellHook(cfg, "/bin/zsh")

	if contains(hook, "9002") {
		t.Errorf("expected hook to NOT contain OSC 9002 when git not in segments, got:\n%s", hook)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsHelper(s, sub))
}

func containsHelper(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/ -run TestBuildShellHook -v
```

Expected: FAIL — `9002` not found in hook output.

- [ ] **Step 3: Add git to segmentEmits and DefaultConfig**

In `core/session/config.go`, replace the `segmentEmits` map and `DefaultConfig`:

```go
// DefaultConfig is used until a settings UI exists.
var DefaultConfig = Config{
	Shell:          "",
	PromptSegments: []string{"cwd", "git"},
}

// segmentEmits maps each segment name to the shell printf that emits its OSC sequence.
var segmentEmits = map[string]string{
	"cwd":       `  printf '\033]7;%s\033\\' "$PWD"`,
	"exit_code": `  printf '\033]9001;%s\033\\' "$?"`,
	"git": `  _git_br=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
  if [ -n "$_git_br" ]; then
    _git_d=$(git status --porcelain 2>/dev/null | head -c1); [ -n "$_git_d" ] && _git_d=1 || _git_d=0
    _git_a=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
    _git_b=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)
    printf '\033]9002;%s|%s|%s|%s\033\\' "$_git_br" "$_git_d" "$_git_a" "$_git_b"
  fi`,
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/ -run TestBuildShellHook -v
```

Expected: PASS for both test cases.

- [ ] **Step 5: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add core/session/config.go core/session/config_test.go
git commit -m "feat: add git OSC 9002 shell hook to precmd"
```

---

### Task 3: OSC 9002 routing in pipe()

**Files:**
- Modify: `core/session/session.go`
- Create: `core/session/session_test.go`

- [ ] **Step 1: Write the failing test**

Create `core/session/session_test.go`:

```go
package session

import (
	"testing"
)

// TestParseOSCGitPayload verifies parseOSC extracts the OSC 9002 git payload.
func TestParseOSCGitPayload(t *testing.T) {
	// OSC 9002;main|1|2|0 ST (ST = ESC \)
	input := []byte("\x1b]9002;main|1|2|0\x1b\\some output")
	cleaned, payloads, leftover := parseOSC(input)

	if string(cleaned) != "some output" {
		t.Errorf("cleaned = %q, want %q", string(cleaned), "some output")
	}
	if len(payloads) != 1 {
		t.Fatalf("len(payloads) = %d, want 1", len(payloads))
	}
	if payloads[0] != "9002;main|1|2|0" {
		t.Errorf("payloads[0] = %q, want %q", payloads[0], "9002;main|1|2|0")
	}
	if leftover != nil {
		t.Errorf("leftover = %q, want nil", string(leftover))
	}
}

// TestParseOSCGitAndCwdTogether verifies both OSC 7 (cwd) and 9002 (git) are extracted.
func TestParseOSCGitAndCwdTogether(t *testing.T) {
	input := []byte("\x1b]7;/home/user\x1b\\\x1b]9002;main|0|0|0\x1b\\$ ")
	_, payloads, _ := parseOSC(input)

	if len(payloads) != 2 {
		t.Fatalf("len(payloads) = %d, want 2", len(payloads))
	}
	if payloads[0] != "7;/home/user" {
		t.Errorf("payloads[0] = %q, want %q", payloads[0], "7;/home/user")
	}
	if payloads[1] != "9002;main|0|0|0" {
		t.Errorf("payloads[1] = %q, want %q", payloads[1], "9002;main|0|0|0")
	}
}
```

- [ ] **Step 2: Run tests to verify they pass** (parseOSC already handles generic OSC — just verify)

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/ -run TestParseOSC -v
```

Expected: PASS — `parseOSC` already handles any OSC sequence generically.

- [ ] **Step 3: Write the failing test for TypeGit routing**

Add to `core/session/session_test.go` — this tests the routing logic we're about to add by checking the string prefix `"9002;"`:

```go
// TestGitPayloadPrefix verifies the expected prefix used for routing in pipe().
func TestGitPayloadPrefix(t *testing.T) {
	payload := "9002;main|1|2|0"
	if !hasPrefix(payload, "9002;") {
		t.Errorf("git payload %q should have prefix 9002;", payload)
	}
	trimmed := trimPrefix(payload, "9002;")
	if trimmed != "main|1|2|0" {
		t.Errorf("trimmed = %q, want %q", trimmed, "main|1|2|0")
	}
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

func trimPrefix(s, prefix string) string {
	if hasPrefix(s, prefix) {
		return s[len(prefix):]
	}
	return s
}
```

- [ ] **Step 4: Run test to verify it passes** (this is a pure logic test, no routing yet)

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/ -run TestGitPayloadPrefix -v
```

Expected: PASS.

- [ ] **Step 5: Add OSC 9002 case to pipe() in session.go**

In `core/session/session.go`, find the payload routing switch in `pipe()` (around line 183) and add the `9002` case:

```go
for _, p := range payloads {
    switch {
    case strings.HasPrefix(p, "7;"):
        s.w.Send(wire.StringMessage(wire.TypeCwd, strings.TrimPrefix(p, "7;")))
    case strings.HasPrefix(p, "9001;"):
        s.w.Send(wire.StringMessage(wire.TypeExitCode, strings.TrimPrefix(p, "9001;")))
    case strings.HasPrefix(p, "9002;"):
        s.w.Send(wire.StringMessage(wire.TypeGit, strings.TrimPrefix(p, "9002;")))
    }
}
```

- [ ] **Step 6: Build Go core to verify no compile errors**

```bash
cd /Users/jawahar/Work/terminal/term/core && go build ./...
```

Expected: no output.

- [ ] **Step 7: Run all session tests**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/ -v
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add core/session/session.go core/session/session_test.go
git commit -m "feat: route OSC 9002 git payload as TypeGit wire message"
```

---

### Task 4: GitBranchIcon SVG

**Files:**
- Create: `app/src/renderer/src/icons/GitBranchIcon.jsx`

- [ ] **Step 1: Create the icon component**

```jsx
export default function GitBranchIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={color}
      style={{ flexShrink: 0 }}
    >
      <path d="M11.75 2.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zm.75 2.75a2.25 2.25 0 1 1-1.5-2.122V5A2.5 2.5 0 0 1 8.5 7.5H5.5a1 1 0 0 0-1 1v1.128a2.25 2.25 0 1 1-1.5 0V8.5a2.5 2.5 0 0 1 2.5-2.5H8.5A1 1 0 0 0 9.5 5V4.878A2.25 2.25 0 0 1 12.5 5.25zm-8.75 7a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0z" />
    </svg>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add app/src/renderer/src/icons/GitBranchIcon.jsx
git commit -m "feat: add GitBranchIcon SVG component"
```

---

### Task 5: GitSegment component

**Files:**
- Create: `app/src/renderer/src/components/Prompt/GitSegment.jsx`

- [ ] **Step 1: Create GitSegment**

```jsx
import GitBranchIcon from '../../icons/GitBranchIcon'

// GitSegment — renders a git context badge: branch name, dirty indicator, ahead/behind counts.
// onClick behavior differs by context:
//   InputBar  → runs `git status` in the active shell
//   xterm decoration → copies branch name to clipboard
export default function GitSegment({ branch, dirty, ahead, behind, onClick }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault() }}
      title={`Branch: ${branch}${dirty ? ' (dirty)' : ''}${ahead ? ` ↑${ahead}` : ''}${behind ? ` ↓${behind}` : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-primary)',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <GitBranchIcon color="var(--accent)" size={14} />
      <span
        style={{
          maxWidth: '20ch',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {branch}
      </span>
      {dirty && (
        <span style={{ color: 'var(--accent)', lineHeight: 1 }}>•</span>
      )}
      {ahead > 0 && (
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>↑{ahead}</span>
      )}
      {behind > 0 && (
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>↓{behind}</span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add app/src/renderer/src/components/Prompt/GitSegment.jsx
git commit -m "feat: add GitSegment prompt badge component"
```

---

### Task 6: Update Prompt component

**Files:**
- Modify: `app/src/renderer/src/components/Prompt/index.jsx`

- [ ] **Step 1: Update Prompt to accept gitData/onGitClick and render GitSegment**

Replace the full content of `app/src/renderer/src/components/Prompt/index.jsx`:

```jsx
import { useState } from "react";
import FolderIcon from "../../icons/FolderIcon";
import ClipboardIcon from "../../icons/ClipboardIcon";
import GitSegment from "./GitSegment";

// Prompt — prompt header rendered in xterm decorations and InputBar.
// Used in two places:
//   1. xterm Decoration above each command's output  →  row 1: elements, rows 2+: command lines
//   2. InputBar first line                           →  row 1: elements only (textarea is row 2)
//
// rowHeight: when provided (xterm decorations), each row is fixed to that pixel height
// so prompt rows align exactly with terminal cell rows. When omitted (InputBar), rows
// use natural height with lineHeight 1.2 to match xterm's compact feel.
// Total decoration height must equal (1 + commandLines.length) * rowHeight.
export default function Prompt({ command, cwd, exitCode, rowHeight, onCopy, gitData, onGitClick }) {
  const [copied, setCopied] = useState(false);
  const hasError = exitCode > 0;
  const commandLines = command ? command.split("\n") : [];
  const rowStyle = rowHeight
    ? { height: `${rowHeight}px`, minHeight: `${rowHeight}px` }
    : { lineHeight: 1.2 };

  function handleCopy(e) {
    e.stopPropagation();
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="flex flex-col select-none w-full bg-[var(--bg-surface)]"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-mono)",
      }}
    >
      {/* Row 1: prompt elements */}
      <div className="flex items-center w-full gap-1" style={rowStyle}>
        <div
          className="flex items-center gap-1 py-2 px-2 rounded-md text-[var(--text-primary)]"
          style={{
            flexShrink: 0,
            backgroundColor: "#00000038",
            border: "1px solid #f9f9f91f",
            lineHeight: 1,
          }}
        >
          {cwd && (
            <button
              onClick={() => window.electron?.openPath(cwd)}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              title={cwd}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                padding: 0,
              }}
            >
              <FolderIcon color="var(--accent)" size={16} />
              <span
                className="ml-1 hover:text-[var(--accent)] transition-colors duration-150"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "40vw",
                }}
              >
                {shortenPath(cwd)}
              </span>
            </button>
          )}
          {gitData && (
            <GitSegment
              branch={gitData.branch}
              dirty={gitData.dirty}
              ahead={gitData.ahead}
              behind={gitData.behind}
              onClick={onGitClick}
            />
          )}
        </div>
        <div className="flex-1 h-px bg-gray-300/15" />
        {onCopy && (
          <button
            onClick={handleCopy}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "20px",
              height: "20px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: copied ? "var(--accent)" : "var(--text-muted)",
              flexShrink: 0,
              transition: "color 0.15s",
              marginRight: "20px",
            }}
            title="Copy command and output"
          >
            {copied ? (
              <span style={{ fontSize: "11px", fontWeight: "bold" }}>✓</span>
            ) : (
              <ClipboardIcon size={11} color="currentColor" />
            )}
          </button>
        )}
      </div>

      {/* Rows 2+: one row per command line (xterm decoration only) */}
      {commandLines.map((line, i) => (
        <div key={i} className="flex items-center px-3 mt-2" style={rowStyle}>
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
}

function shortenPath(p) {
  const home = "/Users/";
  const parts = p.split("/");
  if (p.startsWith(home) && parts.length >= 3) {
    return "~/" + parts.slice(3).join("/");
  }
  return p;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add app/src/renderer/src/components/Prompt/index.jsx
git commit -m "feat: render GitSegment in Prompt row 1 when gitData present"
```

---

### Task 7: Parse TypeGit in useTerminal

**Files:**
- Modify: `app/src/renderer/src/hooks/useTerminal.js`

- [ ] **Step 1: Add TypeGit case to the WebSocket message handler**

Replace the `onmessage` handler in `useTerminal.js`:

```js
ws.current.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  switch (msg.type) {
    case wire.TypeOutput:
      callbacksRef.current.onOutput?.(msg.data)
      break
    case wire.TypeCwd:
      callbacksRef.current.onCwd?.(msg.data)
      break
    case wire.TypeExitCode:
      callbacksRef.current.onExitCode?.(msg.data)
      break
    case wire.TypeGit: {
      const [branch, dirty, ahead, behind] = msg.data.split('|')
      callbacksRef.current.onGit?.({
        branch,
        dirty: dirty === '1',
        ahead: parseInt(ahead, 10) || 0,
        behind: parseInt(behind, 10) || 0,
      })
      break
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add app/src/renderer/src/hooks/useTerminal.js
git commit -m "feat: parse TypeGit wire message in useTerminal"
```

---

### Task 8: Wire gitData through TerminalPane

**Files:**
- Modify: `app/src/renderer/src/components/TerminalPane/index.jsx`

- [ ] **Step 1: Add gitData state and onGit callback**

Replace the full content of `app/src/renderer/src/components/TerminalPane/index.jsx`:

```jsx
import { useRef, useState, useCallback } from 'react'
import { useTerminal } from '../../hooks/useTerminal'
import { useSharedHistory } from '../../hooks/useSharedHistory'
import OutputArea from '../OutputArea'
import InputBar from '../InputBar'

export default function TerminalPane({
  paneId,
  isActive,
  isVisible,
  onFocus,
  onTitleChange,
  onSplitRight,
  onSplitDown,
  onClose,
}) {
  const callbacksRef = useRef({})
  const { sendInput, sendRaw, sendResize } = useTerminal(paneId, callbacksRef)
  const { push: pushHistory, navigate: navigateHistory, getAll: getHistory } = useSharedHistory()
  const [running, setRunning] = useState(false)
  const [cwd, setCwd] = useState('')
  const [exitCode, setExitCode] = useState(0)
  const [gitData, setGitData] = useState(null)
  const inputBarRef = useRef(null)
  const runningRef = useRef(false)
  const pendingCommandRef = useRef(null)

  runningRef.current = running

  callbacksRef.current.isRunning = () => runningRef.current
  callbacksRef.current.focusInput = () => inputBarRef.current?.focus()

  callbacksRef.current.onCwd = (value) => {
    setCwd(value)
    setGitData(null) // Reset on directory change; onGit re-populates if new dir is a git repo
    callbacksRef.current.currentCwd = value
    callbacksRef.current.onCwdDecoration?.(value)
  }

  // exit_code arrives before every prompt — signals command done and captures exit status.
  callbacksRef.current.onExitCode = (value) => {
    const code = Number(value)
    setExitCode(code)
    callbacksRef.current.currentExitCode = code
    callbacksRef.current.onExitCodeDecoration?.(code)
    if (code === 0 && pendingCommandRef.current) pushHistory(pendingCommandRef.current)
    pendingCommandRef.current = null
    setRunning(false)
    setTimeout(() => inputBarRef.current?.focus(), 0)
  }

  callbacksRef.current.onGit = (data) => {
    setGitData(data)
    callbacksRef.current.onGitDecoration?.(data)
  }

  const handleSubmit = useCallback((command) => {
    pendingCommandRef.current = command.trim()
    sendInput(command)
    setRunning(true)
    callbacksRef.current.focusTerm?.()
  }, [sendInput])

  function handleMouseDown() {
    if (!runningRef.current) setTimeout(() => inputBarRef.current?.focus(), 0)
  }

  return (
    <div
      className="flex-1 min-h-0 flex flex-col overflow-hidden"
      onClick={onFocus}
      onMouseDown={handleMouseDown}>
      <OutputArea
        callbacksRef={callbacksRef}
        sendRaw={sendRaw}
        sendResize={sendResize}
        isActive={isActive}
        isVisible={isVisible}
      />

      {!running && (
        <InputBar
          ref={inputBarRef}
          onSubmit={handleSubmit}
          onNavigateHistory={navigateHistory}
          getHistory={getHistory}
          cwd={cwd}
          exitCode={exitCode}
          gitData={gitData}
          onGitClick={() => handleSubmit('git status')}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add app/src/renderer/src/components/TerminalPane/index.jsx
git commit -m "feat: wire gitData state and onGit callback through TerminalPane"
```

---

### Task 9: Register onGitDecoration in OutputArea and update sticky header

**Files:**
- Modify: `app/src/renderer/src/components/OutputArea/index.jsx`

- [ ] **Step 1: Add onGitDecoration callback and update sticky header Prompt**

In `OutputArea/index.jsx`, add the `onGitDecoration` registration after `onExitCodeDecoration` (around line 167), and update the sticky header `<Prompt>` render.

After `callbacksRef.current.onExitCodeDecoration = ...` block, add:

```js
callbacksRef.current.onGitDecoration = (gitData) => {
  promptAddon.updateLastGit(gitData)
  const viewportY = term.buffer.active.viewportY
  setStickyCommand(promptAddon.getStickyCommand(viewportY))
}
```

Update the sticky header `<Prompt>` in the return JSX:

```jsx
{stickyCommand !== null && (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    }}
  >
    <Prompt
      command={stickyCommand.command}
      cwd={stickyCommand.cwd}
      exitCode={stickyCommand.exitCode}
      rowHeight={cellHeightRef.current}
      onCopy={stickyCommand.onCopy}
      gitData={stickyCommand.gitData}
      onGitClick={stickyCommand.gitData?.branch
        ? () => navigator.clipboard.writeText(stickyCommand.gitData.branch)
        : undefined}
    />
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add app/src/renderer/src/components/OutputArea/index.jsx
git commit -m "feat: register onGitDecoration and pass gitData to sticky header"
```

---

### Task 10: Update PromptAddon

**Files:**
- Modify: `app/src/renderer/src/addons/PromptAddon.jsx`

- [ ] **Step 1: Add gitData to entry, updateLastGit, and update all Prompt renders**

Replace the full content of `app/src/renderer/src/addons/PromptAddon.jsx`:

```jsx
import { createRoot } from "react-dom/client";
import Prompt from "../components/Prompt";

// Rows for the prompt elements line (➜, cwd, etc.)
const PROMPT_HEADER_ROWS = 1;

// PromptAddon — xterm.js addon that renders a React <Prompt> component
// above each command's output using xterm's Decoration + Marker APIs.
//
// How it works:
//   1. commandStart() writes a blank line to reserve space
//   2. A Marker is registered at that line (stable through scrollback)
//   3. A Decoration overlays it with a React-rendered <Prompt>
export class PromptAddon {
  constructor() {
    this._term = null;
    this._roots = [];
    this._decorations = [];
    this._elements = []; // DOM elements from onRender, for TUI visibility toggling
    this._tuiActive = false;
    this._commands = []; // { marker, command, cwd, exitCode, gitData, root, cellHeight, onCopy }
  }

  activate(terminal) {
    this._term = terminal;
  }

  dispose() {
    this._roots.forEach((r) => {
      try {
        r.unmount();
      } catch {}
    });
    this._decorations.forEach((d) => {
      try {
        d.dispose();
      } catch {}
    });
    this._roots = [];
    this._decorations = [];
    this._elements = [];
    this._commands = [];
  }

  // Returns the command whose prompt should be shown as a sticky header.
  getStickyCommand(viewportY) {
    let best = null;
    for (const entry of this._commands) {
      if (entry.marker.isDisposed) continue;
      if (entry.marker.line < viewportY) {
        if (best === null || entry.marker.line > best.marker.line) best = entry;
      }
    }
    if (!best) return null;
    return {
      command: best.command,
      cwd: best.cwd,
      exitCode: best.exitCode,
      gitData: best.gitData ?? null,
      onCopy: best.onCopy,
    };
  }

  // Reads the command's output from the xterm buffer as plain text.
  _getOutput(entry) {
    const buffer = this._term.buffer.active;
    const commandLines = entry.command ? entry.command.split("\n").length : 0;
    const promptRows = PROMPT_HEADER_ROWS + commandLines;
    const outputStart = entry.marker.line + promptRows + 1;

    const entryIndex = this._commands.indexOf(entry);
    const nextEntry = this._commands[entryIndex + 1];
    const outputEnd = nextEntry
      ? nextEntry.marker.line
      : buffer.baseY + buffer.cursorY + 1;

    const lines = [];
    for (let i = outputStart; i < outputEnd; i++) {
      const line = buffer.getLine(i);
      if (!line) break;
      lines.push(line.translateToString(true));
    }

    // Trim trailing blank lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === "")
      lines.pop();

    return lines.join("\n");
  }

  _renderEntry(entry) {
    const onGitClick = entry.gitData?.branch
      ? () => navigator.clipboard.writeText(entry.gitData.branch)
      : undefined;
    entry.root?.render(
      <Prompt
        command={entry.command}
        cwd={entry.cwd}
        exitCode={entry.exitCode}
        gitData={entry.gitData}
        onGitClick={onGitClick}
        rowHeight={entry.cellHeight}
        onCopy={entry.onCopy}
      />,
    );
  }

  // Called when TypeCwd arrives — updates the most recent decoration with the real cwd.
  updateLastCwd(cwd) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.cwd = cwd;
    this._renderEntry(entry);
  }

  // Called when TypeExitCode arrives — updates the most recent decoration with the real exit code.
  updateLastExitCode(code) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.exitCode = code;
    this._renderEntry(entry);
  }

  // Called when TypeGit arrives — updates the most recent decoration with git state.
  updateLastGit(gitData) {
    const entry = this._commands[this._commands.length - 1];
    if (!entry) return;
    entry.gitData = gitData;
    this._renderEntry(entry);
  }

  enterTui() {
    this._tuiActive = true;
    for (const el of this._elements) {
      if (el) el.style.visibility = "hidden";
    }
  }

  exitTui() {
    this._tuiActive = false;
    for (const el of this._elements) {
      if (el) el.style.visibility = "";
    }
  }

  commandStart(command, cwd = "") {
    const commandLines = command ? command.split("\n").length : 0;

    const cellHeight =
      this._term._core?._renderService?.dimensions?.css?.cell?.height ??
      (this._term.element
        ? this._term.element.offsetHeight / this._term.rows
        : 25);
    const promptRows = PROMPT_HEADER_ROWS + commandLines;

    // Reserve promptRows + 1 blank lines. The extra row's height is split between
    // top and bottom padding via CSS on the decoration element.
    const marker = this._term.registerMarker(0);
    if (!marker) return;
    this._term.write("\r\n".repeat(promptRows + 1));

    const decoration = this._term.registerDecoration({
      marker,
      height: promptRows + 1,
      layer: "top",
    });
    if (!decoration) return;

    const entry = {
      marker,
      command,
      cwd,
      exitCode: 0,
      gitData: null,
      root: null,
      cellHeight,
      onCopy: null,
    };

    // onCopy reads the buffer at call-time so it always captures the final output.
    entry.onCopy = () => {
      const output = this._getOutput(entry);
      const text = (entry.command ? `$ ${entry.command}\n` : "") + output;
      navigator.clipboard.writeText(text).catch(() => {});
    };

    // Read the container's left padding so the decoration can bleed back to the true left edge.
    const termContainer = this._term.element?.parentElement;
    const paddingLeft = termContainer
      ? parseInt(getComputedStyle(termContainer).paddingLeft) || 0
      : 0;

    // Split the extra reserved row between top and bottom padding.
    const paddingTop = Math.round(cellHeight * 0.5);

    decoration.onRender((el) => {
      el.style.marginLeft = `-${paddingLeft}px`;
      el.style.width = `calc(100% + ${paddingLeft}px)`;
      el.style.paddingTop = `${paddingTop}px`;
      el.style.boxSizing = "border-box";
      el.style.overflow = "hidden";
      el.style.backgroundColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--bg-surface")
          .trim() || "#141416";
      if (this._tuiActive) el.style.visibility = "hidden";
      if (!el._reactRoot) {
        this._elements.push(el);
        const root = createRoot(el);
        el._reactRoot = root;
        entry.root = root;
        this._roots.push(root);
        this._renderEntry(entry);
      }
    });

    this._decorations.push(decoration);
    this._commands.push(entry);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add app/src/renderer/src/addons/PromptAddon.jsx
git commit -m "feat: add gitData to PromptAddon entries and updateLastGit method"
```

---

### Task 11: Update InputBar

**Files:**
- Modify: `app/src/renderer/src/components/InputBar/index.jsx`

- [ ] **Step 1: Accept gitData/onGitClick and pass to Prompt**

Replace the full content of `app/src/renderer/src/components/InputBar/index.jsx`:

```jsx
import { useRef, forwardRef, useImperativeHandle } from 'react'
import Prompt from '../Prompt'
import { useShellEditor } from './useShellEditor'

const InputBar = forwardRef(function InputBar(
  { onSubmit, onNavigateHistory, getHistory, cwd, exitCode, gitData, onGitClick },
  ref,
) {
  // callbacksRef keeps latest prop values accessible inside the CodeMirror
  // keybinding closures without rebuilding the EditorView when props change.
  const callbacksRef = useRef({})
  callbacksRef.current.onSubmit = onSubmit
  callbacksRef.current.onNavigateHistory = onNavigateHistory
  callbacksRef.current.getHistory = getHistory

  const { editorContainerRef, viewRef } = useShellEditor(callbacksRef)

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    setValue: (text) => {
      const view = viewRef.current
      if (!view) return
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
      view.focus()
    },
  }))

  return (
    <div className="shrink-0 flex flex-col bg-[var(--bg-surface)] mt-1 pt-2 pb-2">
      <div>
        <Prompt cwd={cwd} exitCode={exitCode} gitData={gitData} onGitClick={onGitClick} />
      </div>
      <div ref={editorContainerRef} />
    </div>
  )
})

export default InputBar
```

- [ ] **Step 2: Commit**

```bash
cd /Users/jawahar/Work/terminal/term
git add app/src/renderer/src/components/InputBar/index.jsx
git commit -m "feat: pass gitData and onGitClick through InputBar to Prompt"
```

---

### Task 12: End-to-end verification

- [ ] **Step 1: Build Go core**

```bash
cd /Users/jawahar/Work/terminal/term/core
go build -o term-core .
./term-core &
```

Expected: server starts on port 7070.

- [ ] **Step 2: Start the Electron app**

```bash
cd /Users/jawahar/Work/terminal/term/app
npm run dev
```

- [ ] **Step 3: Verify git repo detection**

In the terminal pane, `cd` into any git repo (e.g. `cd /Users/jawahar/Work/terminal/term` then run any command like `ls`). After the command completes, the InputBar prompt row 1 should show the git branch badge with branch name.

- [ ] **Step 4: Verify dirty indicator**

Run `touch /tmp/dirty-test-file` (or modify a tracked file in the repo). After the next command completes, the `•` dirty dot should appear next to the branch name.

- [ ] **Step 5: Verify ahead/behind counts**

If the repo has commits ahead of origin, `↑N` should appear. Behind origin: `↓N`.

- [ ] **Step 6: Verify non-git directory**

Run `cd /tmp`. The git badge should disappear from the InputBar prompt.

- [ ] **Step 7: Verify InputBar click**

Click the git badge in the InputBar. The shell should execute `git status` and show its output.

- [ ] **Step 8: Verify xterm decoration click**

Scroll up to a past command in a git repo. Click the git badge in its xterm decoration prompt. The branch name should be copied to clipboard (verify by pasting).

- [ ] **Step 9: Verify theme colors**

Switch themes (if accessible). All git badge colors (accent branch icon, muted ahead/behind) should update without hardcoded values bleeding through.

- [ ] **Step 10: Verify split panes**

Split the terminal (`Cmd+D`). Navigate panes to different directories (one in a git repo, one not). Each pane should show its own independent git state.
