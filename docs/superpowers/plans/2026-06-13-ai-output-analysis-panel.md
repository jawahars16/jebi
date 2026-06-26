# AI Output Analysis Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a command with significant output completes, automatically analyze it with the local LLM and show a compact structured panel with extracted errors, metrics, and insights.

**Architecture:** The frontend detects large output (≥10 lines or ≥500 chars), applies first-60+last-20 line truncation, and sends a new `TypeAIAnalyze` wire message. The Go backend calls `llm.Analyze()` which returns a structured JSON result, then sends it back as `TypeAIAnalysis`. The frontend renders an `AnalysisPanel` component below the terminal output.

**Tech Stack:** Go (backend LLM call, wire protocol), React/JSX (AnalysisPanel component), xterm.js PromptAddon (output extraction)

---

## File Map

| File | Change |
|---|---|
| `core/wire/types.go` | Add `TypeAIAnalyze` + `TypeAIAnalysis` constants |
| `app/src/renderer/src/wire.js` | Add matching JS constants |
| `core/llm/provider.go` | Add `AnalyzeRequest`, `AnalysisItem`, `AnalysisAction`, `AnalysisResult` types |
| `core/llm/prompt.go` | Add `BuildAnalyzeMessages` |
| `core/llm/analyze.go` | New — `Analyze()` function + `ParseAnalysisResponse()` |
| `core/llm/analyze_test.go` | New — tests for `ParseAnalysisResponse` |
| `core/session/session.go` | Add `cancelAnalyze` field, handle `TypeAIAnalyze`, send `TypeAIAnalysis` |
| `app/src/renderer/src/addons/PromptAddon.jsx` | Add `getLastEntryForAnalysis()` method |
| `app/src/renderer/src/hooks/useTerminal.js` | Add `sendAIAnalyze`, handle `TypeAIAnalysis` in switch |
| `app/src/renderer/src/components/TerminalPane/index.jsx` | Add `analysisResult` state, trigger on exit, render panel |
| `app/src/renderer/src/components/AnalysisPanel/index.jsx` | New component |

---

## Task 1: Add wire type constants

**Files:**
- Modify: `core/wire/types.go`
- Modify: `app/src/renderer/src/wire.js`

- [ ] **Step 1: Add Go wire types**

In `core/wire/types.go`, add after the `TypeAskError` line:

```go
// TypeAIAnalyze is sent frontend → backend: JSON {"command":"…","output":"…","exitCode":N,"cwd":"…"}
TypeAIAnalyze = "ai_analyze"
// TypeAIAnalysis is sent backend → frontend: JSON AnalysisResult object.
TypeAIAnalysis = "ai_analysis"
```

- [ ] **Step 2: Add JS wire types**

In `app/src/renderer/src/wire.js`, add after `TypeAskError`:

```js
export const TypeAIAnalyze  = 'ai_analyze'
export const TypeAIAnalysis = 'ai_analysis'
```

- [ ] **Step 3: Verify Go builds**

```bash
cd core && go build ./...
```
Expected: no output (clean build).

- [ ] **Step 4: Commit**

```bash
git add core/wire/types.go app/src/renderer/src/wire.js
git commit -m "feat: add TypeAIAnalyze and TypeAIAnalysis wire types"
```

---

## Task 2: Add Go LLM types and prompt builder

**Files:**
- Modify: `core/llm/provider.go`
- Modify: `core/llm/prompt.go`

- [ ] **Step 1: Add types to `core/llm/provider.go`**

Add after the `ProjectInfo` struct:

```go
// AnalyzeRequest is the input for the output analysis feature.
type AnalyzeRequest struct {
	Command  string
	Output   string
	ExitCode int
	Cwd      string
	Shell    string
	OS       string
}

// AnalysisItem is one extracted fact from the analyzed output.
type AnalysisItem struct {
	Type   string `json:"type"`   // "error" | "metric" | "insight" | "warning"
	Text   string `json:"text"`
	Detail string `json:"detail"`
}

// AnalysisAction is an optional suggested next command.
type AnalysisAction struct {
	Label   string `json:"label"`
	Command string `json:"command"`
}

// AnalysisResult is the structured output from the LLM analysis.
type AnalysisResult struct {
	Title  string         `json:"title"`
	Items  []AnalysisItem `json:"items"`
	Action *AnalysisAction `json:"action"`
}
```

- [ ] **Step 2: Add `BuildAnalyzeMessages` to `core/llm/prompt.go`**

Add this constant and function at the end of the file:

```go
const analyzePromptTemplate = `You are a terminal output analyzer. Given a shell command and its output, extract what matters most.

Environment: shell=%s  os=%s  cwd=%s

Return ONLY valid JSON with this exact structure — no markdown, no explanation:
{"title":"...","items":[{"type":"...","text":"...","detail":"..."}],"action":{"label":"...","command":"..."}}

Or if no action is relevant:
{"title":"...","items":[{"type":"...","text":"...","detail":"..."}],"action":null}

Field rules:
- title: one short phrase summarising the outcome (e.g. "3 build errors", "47/50 tests passed", "2 pods failing", "12 files changed")
- items: 1 to 5 key facts. For each item:
  - type must be exactly one of: "error", "metric", "insight", "warning"
  - type "error": a failure or problem, include file:line if present in output
  - type "metric": a number or stat (e.g. "47/50 tests passed", "build time: 3.2s", "downloaded 142 packages")
  - type "warning": something that may need attention but is not a failure
  - type "insight": a useful observation or root cause hint
  - text: under 80 characters
  - detail: extra context or the raw error line (empty string if none)
- action: one suggested next command if there is an obvious next step, otherwise null
- Output ONLY the JSON. No text before or after.`

// BuildAnalyzeMessages returns the message list for an output analysis request.
func BuildAnalyzeMessages(req AnalyzeRequest) []ChatMessage {
	system := fmt.Sprintf(analyzePromptTemplate, req.Shell, req.OS, req.Cwd)
	var sb strings.Builder
	exitLabel := "exit 0"
	if req.ExitCode != 0 {
		exitLabel = fmt.Sprintf("exit %d (FAILED)", req.ExitCode)
	}
	fmt.Fprintf(&sb, "$ %s  [%s]\n\n%s", req.Command, exitLabel, req.Output)
	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: sb.String()},
	}
}
```

- [ ] **Step 3: Verify Go builds**

```bash
cd core && go build ./...
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add core/llm/provider.go core/llm/prompt.go
git commit -m "feat: add AnalysisResult types and BuildAnalyzeMessages prompt"
```

---

## Task 3: Add `Analyze()` function with tests

**Files:**
- Create: `core/llm/analyze.go`
- Create: `core/llm/analyze_test.go`

- [ ] **Step 1: Write the failing tests first**

Create `core/llm/analyze_test.go`:

```go
package llm

import (
	"strings"
	"testing"
)

func TestParseAnalysisResponse_WellFormedJSON(t *testing.T) {
	raw := `{"title":"3 build errors","items":[{"type":"error","text":"undefined: TokenExpiry","detail":"auth/auth.go:42"},{"type":"insight","text":"All errors in auth package","detail":""}],"action":{"label":"Run go mod tidy","command":"go mod tidy"}}`
	result, err := ParseAnalysisResponse(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Title != "3 build errors" {
		t.Errorf("title = %q, want %q", result.Title, "3 build errors")
	}
	if len(result.Items) != 2 {
		t.Fatalf("items len = %d, want 2", len(result.Items))
	}
	if result.Items[0].Type != "error" {
		t.Errorf("item[0].type = %q, want %q", result.Items[0].Type, "error")
	}
	if result.Action == nil || result.Action.Command != "go mod tidy" {
		t.Errorf("action.command = %v, want %q", result.Action, "go mod tidy")
	}
}

func TestParseAnalysisResponse_NullAction(t *testing.T) {
	raw := `{"title":"47/50 tests passed","items":[{"type":"metric","text":"47 passed, 3 failed","detail":""}],"action":null}`
	result, err := ParseAnalysisResponse(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Action != nil {
		t.Errorf("expected nil action, got %+v", result.Action)
	}
}

func TestParseAnalysisResponse_JSONEmbeddedInText(t *testing.T) {
	raw := `Here is the analysis:\n{"title":"build failed","items":[{"type":"error","text":"syntax error","detail":""}],"action":null}\nDone.`
	result, err := ParseAnalysisResponse(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Title != "build failed" {
		t.Errorf("title = %q, want %q", result.Title, "build failed")
	}
}

func TestParseAnalysisResponse_InvalidJSON(t *testing.T) {
	raw := "I cannot analyze this output."
	_, err := ParseAnalysisResponse(raw)
	if err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}

func TestParseAnalysisResponse_ItemsCapAt5(t *testing.T) {
	items := strings.Repeat(`{"type":"error","text":"err","detail":""},`, 7)
	items = strings.TrimSuffix(items, ",")
	raw := `{"title":"many errors","items":[` + items + `],"action":null}`
	result, err := ParseAnalysisResponse(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Items) > 5 {
		t.Errorf("items len = %d, want ≤ 5", len(result.Items))
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd core && go test ./llm/... -run TestParseAnalysisResponse -v
```
Expected: FAIL with "undefined: ParseAnalysisResponse"

- [ ] **Step 3: Create `core/llm/analyze.go`**

```go
package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// Analyze runs the output analysis LLM call and returns a structured result.
// Returns nil when the provider is unavailable or output produces no useful analysis.
func Analyze(ctx context.Context, provider Provider, req AnalyzeRequest) (*AnalysisResult, error) {
	ch, err := provider.StreamMessages(ctx, BuildAnalyzeMessages(req))
	if err != nil {
		return nil, err
	}
	var acc strings.Builder
	for chunk := range ch {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		acc.WriteString(chunk.Token)
	}
	return ParseAnalysisResponse(acc.String())
}

// ParseAnalysisResponse extracts and validates an AnalysisResult from raw LLM output.
// Tries direct unmarshal first, then falls back to extracting the first '{' … last '}' substring.
// Caps items at 5.
func ParseAnalysisResponse(raw string) (*AnalysisResult, error) {
	raw = strings.TrimSpace(raw)

	var result AnalysisResult
	if err := json.Unmarshal([]byte(raw), &result); err == nil {
		capItems(&result)
		return &result, nil
	}

	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start >= 0 && end > start {
		if err := json.Unmarshal([]byte(raw[start:end+1]), &result); err == nil {
			capItems(&result)
			return &result, nil
		}
	}

	return nil, fmt.Errorf("could not parse analysis response: %q", raw)
}

func capItems(r *AnalysisResult) {
	if len(r.Items) > 5 {
		r.Items = r.Items[:5]
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd core && go test ./llm/... -run TestParseAnalysisResponse -v
```
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add core/llm/analyze.go core/llm/analyze_test.go
git commit -m "feat: add llm.Analyze and ParseAnalysisResponse"
```

---

## Task 4: Handle `TypeAIAnalyze` in session.go

**Files:**
- Modify: `core/session/session.go`

- [ ] **Step 1: Add `cancelAnalyze` field to the Session struct**

In `core/session/session.go`, find the `cancelAsk` field declaration (around line 68) and add after it:

```go
cancelAnalyze  context.CancelFunc // cancels any in-flight analysis request
```

- [ ] **Step 2: Add the `TypeAIAnalyze` case to the message switch**

Find the `case wire.TypeAsk:` block in the message handler. Add the following case **before** it:

```go
case wire.TypeAIAnalyze:
    if s.provider == nil {
        break
    }
    var entry struct {
        Command  string `json:"command"`
        Output   string `json:"output"`
        ExitCode int    `json:"exitCode"`
        Cwd      string `json:"cwd"`
    }
    if err := json.Unmarshal(msg.Data, &entry); err != nil {
        break
    }
    if s.cancelAnalyze != nil {
        s.cancelAnalyze()
    }
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    s.cancelAnalyze = cancel
    req := llm.AnalyzeRequest{
        Command:  entry.Command,
        Output:   entry.Output,
        ExitCode: entry.ExitCode,
        Cwd:      entry.Cwd,
        Shell:    resolveShell(s.cfg),
        OS:       runtime.GOOS + "/" + runtime.GOARCH,
    }
    go func() {
        defer cancel()
        result, err := llm.Analyze(ctx, s.provider, req)
        if err != nil || result == nil {
            return
        }
        data, err := json.Marshal(result)
        if err != nil {
            return
        }
        s.w.Send(wire.Message{Type: wire.TypeAIAnalysis, Data: data})
    }()
```

- [ ] **Step 3: Verify Go builds**

```bash
cd core && go build ./...
```
Expected: no output.

- [ ] **Step 4: Run existing tests**

```bash
cd core && go test ./...
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add core/session/session.go
git commit -m "feat: handle TypeAIAnalyze in session, dispatch llm.Analyze"
```

---

## Task 5: Add `getLastEntryForAnalysis()` to PromptAddon

**Files:**
- Modify: `app/src/renderer/src/addons/PromptAddon.jsx`

- [ ] **Step 1: Add the method after `getLastEntry()`**

Find the `getLastEntry()` method (around line 104) and add the new method directly after the closing `}` of `getLastEntry`:

```js
// Returns the last completed entry with output suitable for AI analysis.
// Applies first-60 + last-20 line truncation instead of the 500-char cap used by getLastEntry.
getLastEntryForAnalysis() {
  const completed = this._commands.filter((e) => !e.running);
  const last = completed[completed.length - 1];
  if (!last) return null;
  const fullOutput = this._getOutput(last) || '';
  const lines = fullOutput.split('\n');
  let truncated;
  if (lines.length <= 80) {
    truncated = fullOutput;
  } else {
    const head = lines.slice(0, 60).join('\n');
    const tail = lines.slice(-20).join('\n');
    truncated = head + '\n…\n' + tail;
  }
  return {
    command: last.command,
    output: truncated,
    exitCode: last.exitCode ?? 0,
  };
}
```

- [ ] **Step 2: Verify the app builds**

```bash
cd app && npm run typecheck 2>/dev/null || echo "no typecheck configured"
```

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/addons/PromptAddon.jsx
git commit -m "feat: add getLastEntryForAnalysis to PromptAddon"
```

---

## Task 6: Wire `sendAIAnalyze` and handle `TypeAIAnalysis` in useTerminal.js

**Files:**
- Modify: `app/src/renderer/src/hooks/useTerminal.js`

- [ ] **Step 1: Add `sendAIAnalyze` function**

Find the `sendAIAppend` function (around line 169):

```js
const sendAIAppend = useCallback((entry) => {
  if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return
  ws.current.send(JSON.stringify({ type: wire.TypeAIAppend, data: entry }))
}, [])
```

Add directly after it:

```js
const sendAIAnalyze = useCallback((entry) => {
  if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return
  ws.current.send(JSON.stringify({ type: wire.TypeAIAnalyze, data: entry }))
}, [])
```

- [ ] **Step 2: Handle `TypeAIAnalysis` in the `onmessage` switch**

Find the `case wire.TypeAskError:` block (around line 131) and add after it, before the closing `}` of the switch:

```js
case wire.TypeAIAnalysis:
  callbacksRef.current.onAIAnalysis?.(msg.data)
  break
```

- [ ] **Step 3: Export `sendAIAnalyze` in the return value**

Find the return statement:

```js
return { sendInput, sendRaw, sendResize, sendAIAppend, sendAsk }
```

Change it to:

```js
return { sendInput, sendRaw, sendResize, sendAIAppend, sendAIAnalyze, sendAsk }
```

- [ ] **Step 4: Commit**

```bash
git add app/src/renderer/src/hooks/useTerminal.js
git commit -m "feat: add sendAIAnalyze and TypeAIAnalysis handler in useTerminal"
```

---

## Task 7: Wire up analysis state and trigger in TerminalPane

**Files:**
- Modify: `app/src/renderer/src/components/TerminalPane/index.jsx`

- [ ] **Step 1: Destructure `sendAIAnalyze` from `useTerminal`**

Find the line (around line 36):

```js
const { sendInput, sendRaw, sendResize, sendAIAppend, sendAsk } = useTerminal(paneId, callbacksRef, initialCwd);
```

Change to:

```js
const { sendInput, sendRaw, sendResize, sendAIAppend, sendAIAnalyze, sendAsk } = useTerminal(paneId, callbacksRef, initialCwd);
```

- [ ] **Step 2: Add `analysisResult` state**

Find the line:

```js
const [aiSuggestions, setAiSuggestions] = useState([]);
```

Add directly after it:

```js
const [analysisResult, setAnalysisResult] = useState(null); // { title, items, action } | null
```

- [ ] **Step 3: Register the `onAIAnalysis` callback**

Find the line:

```js
callbacksRef.current.onAISuggestError = () => { setAiSuggestions([]); };
```

Add after it:

```js
callbacksRef.current.onAIAnalysis = (result) => { setAnalysisResult(result); };
```

- [ ] **Step 4: Register `getLastEntryForAnalysis` in the OutputArea callback**

Find the line that registers `getLastEntry` (it is in the OutputArea `onReady` callback, something like):

```js
callbacksRef.current.getLastEntry = () => promptAddon.getLastEntry();
```

Add directly after it:

```js
callbacksRef.current.getLastEntryForAnalysis = () => promptAddon.getLastEntryForAnalysis();
```

- [ ] **Step 5: Trigger analysis on command completion**

Find the block that calls `sendAIAppend` (around line 171-177):

```js
setTimeout(() => {
  inputBarRef.current?.focus();
  // Send the just-completed command + output to the backend for AI suggestion.
  const entry = callbacksRef.current.getLastEntry?.();
  if (entry && prefs.aiCommandSuggestions !== false) {
    setAiSuggestions([]);
    sendAIAppend(entry);
  }
}, 0);
```

Change to:

```js
setTimeout(() => {
  inputBarRef.current?.focus();
  const entry = callbacksRef.current.getLastEntry?.();
  if (entry && prefs.aiCommandSuggestions !== false) {
    setAiSuggestions([]);
    sendAIAppend(entry);
  }
  const analysisEntry = callbacksRef.current.getLastEntryForAnalysis?.();
  if (analysisEntry && prefs.aiCommandSuggestions !== false) {
    const lineCount = analysisEntry.output.split('\n').length;
    const charCount = analysisEntry.output.length;
    if (lineCount >= 10 || charCount >= 500) {
      setAnalysisResult(null);
      sendAIAnalyze({ ...analysisEntry, cwd: callbacksRef.current.currentCwd ?? '' });
    }
  }
}, 0);
```

- [ ] **Step 6: Clear `analysisResult` when a new command starts**

Find the single `setRunning(true)` call (around line 251):

```js
setRunning(true);
```

Add directly after it:

```js
setAnalysisResult(null);
```

Note: `callbacksRef.current.currentCwd` is already kept up to date by the existing `onCwd` callback — no changes needed there.

- [ ] **Step 7: Commit**

```bash
git add app/src/renderer/src/components/TerminalPane/index.jsx
git commit -m "feat: wire analysisResult state and trigger sendAIAnalyze in TerminalPane"
```

---

## Task 8: Build the AnalysisPanel component

**Files:**
- Create: `app/src/renderer/src/components/AnalysisPanel/index.jsx`

- [ ] **Step 1: Create the component**

```jsx
const ITEM_ICONS = {
  error:   { symbol: '✕', color: '#f87171' },
  warning: { symbol: '⚠', color: '#fbbf24' },
  metric:  { symbol: '#', color: 'var(--text-muted)' },
  insight: { symbol: '●', color: 'var(--text-muted)' },
}

export default function AnalysisPanel({ result, exitCode, onDismiss, onAction }) {
  const [expanded, setExpanded] = useState(null) // index of expanded item | null
  const [showAll, setShowAll] = useState(false)

  const borderColor = exitCode !== 0 ? '#f87171' : 'var(--tab-accent)'
  const visibleItems = showAll ? result.items : result.items.slice(0, 4)
  const hiddenCount = result.items.length - 4

  return (
    <div style={{
      position: 'relative',
      borderTop: `1px solid color-mix(in srgb, ${borderColor} 30%, transparent)`,
      borderLeft: `5px solid ${borderColor}`,
      background: 'color-mix(in srgb, var(--tab-accent) 7%, var(--bg-surface))',
      animation: 'bannerSlideIn 0.2s ease-out',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-mono)',
      userSelect: 'none',
    }}>
      <style>{`
        @keyframes bannerSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: none; }
        }
        .analysis-item:hover { background: color-mix(in srgb, var(--tab-accent) 12%, transparent); }
        .analysis-expand:hover { opacity: 1 !important; }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px 4px',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: borderColor,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          {result.title}
        </span>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 14, padding: '0 2px', lineHeight: 1,
          }}
        >×</button>
      </div>

      {/* Items */}
      <div style={{ padding: '0 10px 2px' }}>
        {visibleItems.map((item, i) => {
          const icon = ITEM_ICONS[item.type] || ITEM_ICONS.insight
          const isExpanded = expanded === i
          return (
            <div key={i}>
              <div
                className="analysis-item"
                onClick={() => item.detail ? setExpanded(isExpanded ? null : i) : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '2px 4px', borderRadius: 4,
                  cursor: item.detail ? 'pointer' : 'default',
                }}
              >
                <span style={{ color: icon.color, fontSize: 11, minWidth: 10, textAlign: 'center' }}>
                  {icon.symbol}
                </span>
                <span style={{ color: 'var(--text-primary)', fontSize: 12, flex: 1 }}>
                  {item.text}
                </span>
                {item.detail && (
                  <span
                    className="analysis-expand"
                    style={{ color: 'var(--text-muted)', fontSize: 10, opacity: 0.5 }}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </span>
                )}
              </div>
              {isExpanded && item.detail && (
                <div style={{
                  marginLeft: 18, padding: '2px 4px 4px',
                  color: 'var(--text-muted)', fontSize: 11,
                  borderLeft: `2px solid color-mix(in srgb, ${borderColor} 40%, transparent)`,
                  paddingLeft: 8,
                }}>
                  {item.detail}
                </div>
              )}
            </div>
          )
        })}

        {!showAll && hiddenCount > 0 && (
          <div
            onClick={() => setShowAll(true)}
            style={{
              color: 'var(--text-muted)', fontSize: 11, padding: '2px 4px',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            +{hiddenCount} more
          </div>
        )}
      </div>

      {/* Action button */}
      {result.action && (
        <div style={{ padding: '4px 10px 8px' }}>
          <button
            onClick={() => onAction(result.action.command)}
            style={{
              background: 'none',
              border: `1px solid color-mix(in srgb, ${borderColor} 50%, transparent)`,
              borderRadius: 6,
              color: borderColor,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '3px 10px',
            }}
          >
            → {result.action.label || result.action.command}
          </button>
        </div>
      )}
    </div>
  )
}
```

Add the `useState` import at the top of the file:

```jsx
import { useState } from 'react'
```

- [ ] **Step 2: Commit**

```bash
git add app/src/renderer/src/components/AnalysisPanel/index.jsx
git commit -m "feat: add AnalysisPanel component"
```

---

## Task 9: Render AnalysisPanel in TerminalPane

**Files:**
- Modify: `app/src/renderer/src/components/TerminalPane/index.jsx`

- [ ] **Step 1: Import AnalysisPanel**

Find the existing imports at the top of `TerminalPane/index.jsx`. Add:

```js
import AnalysisPanel from "../AnalysisPanel";
```

- [ ] **Step 2: Render the panel**

Find the `ExplanationPanel` render block (around line 487):

```jsx
{banner?.text && (
  <ExplanationPanel
    text={banner.text}
    type={banner.type}
    onDismiss={() => setBanner(null)}
  />
)}
```

Add directly after it:

```jsx
{analysisResult && !running && (
  <AnalysisPanel
    result={analysisResult}
    exitCode={exitCode}
    onDismiss={() => setAnalysisResult(null)}
    onAction={(cmd) => { setAnalysisResult(null); handleSubmit(cmd); }}
  />
)}
```

- [ ] **Step 3: Start the dev server and test manually**

```bash
cd /path/to/jebi && make dev
```

Run a command with large output, e.g.:
- `go build ./...` in a project with errors
- `npm test` in a Node project
- `git log --oneline -50`

Verify: the AnalysisPanel appears below the output with a title, items, and optional action button.

- [ ] **Step 4: Test edge cases**
  - Run `ls` (small output) → panel should NOT appear
  - Run a short command like `echo hello` → panel should NOT appear
  - Run a command that produces >5 items → verify "+N more" expander works
  - Click an item with detail → verify expand/collapse works
  - Click action button → verify command is injected into input bar
  - Dismiss → verify panel disappears
  - Run next command → verify panel clears before new output appears

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/src/components/TerminalPane/index.jsx
git commit -m "feat: render AnalysisPanel in TerminalPane"
```
