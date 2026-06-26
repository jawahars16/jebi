# AI Output Analysis Panel — Design Spec

**Date:** 2026-06-13  
**Status:** Approved

---

## Summary

After a command produces significant output, jebi automatically analyzes it with a local LLM and renders a compact, scannable panel below the terminal output. The panel extracts what matters — errors with locations, key metrics, insights — and optionally offers a one-click suggested next command.

This extends the existing AI suggestion system (which fires on every command) with richer, structured output understanding for commands that produce substantial output.

---

## Trigger Conditions

Analysis fires when **all** of the following are true:

1. Command has completed (exit code received)
2. Output is ≥ 10 lines **or** ≥ 500 characters
3. The command is not an interactive session — `session.go` already tracks this via the `interactive` flag set when PTY enters raw/interactive mode (e.g. `vim`, `htop`, `ssh`)

Both successful and failed commands are eligible. Small outputs (`ls`, `echo`, `node -v`) are skipped silently.

The existing error banner (single-line explanation for non-zero exits) is **not replaced** — it stays for lightweight error cases. The analysis panel is additive and only triggers at the size threshold.

---

## LLM Call: `AnalyzeStream`

### Input

New function `llm.AnalyzeStream()` in `core/llm/analyze.go`, following the same pattern as `ExplainStream`.

Prompt includes:
- The command that was run
- Shell environment context from `detect.go` (git branch, language runtimes, docker/k8s context)
- Truncated output: **first 60 lines + last 20 lines** (avoids token bloat on large outputs; errors are usually at top or bottom)

### Output schema (JSON grammar sampling)

```json
{
  "title": "string",
  "items": [
    {
      "type": "error | metric | insight | warning",
      "text": "string",
      "detail": "string"
    }
  ],
  "action": {
    "label": "string",
    "command": "string"
  } | null
}
```

- `title` — 1 short sentence summarising the output ("3 build errors", "47/50 tests passed", "2 pods in CrashLoopBackOff")
- `items` — 1–5 extracted facts. `text` is the short label shown inline; `detail` is optional expanded context shown on click
- `action` — optional single suggested next command (e.g. `go mod tidy`, `kubectl describe pod <name>`)

### Why no `severity` field

Exit code is the authoritative signal for error vs success — the panel border color derives from that. Asking the LLM to re-classify severity adds noise without adding information.

### Grammar sampling

llama.cpp supports grammar-constrained generation. Pass a JSON grammar matching the schema above so the output is always well-formed. No defensive parsing needed on the Go side.

---

## Wire Protocol

New message type `TypeAIAnalysis` added to `core/wire/types.go`.

Payload: the JSON object above, sent as a single message once the LLM call completes. No token-by-token streaming — the full JSON must arrive intact for grammar sampling to guarantee structure. Given the small model sizes (1.5B–3.8B), generation is fast enough that a single-shot delivery is fine.

Session handling in `session.go` mirrors the existing `TypeAISuggestion` path.

---

## Frontend

### State

`TerminalPane` gets new state:
```js
const [analysisResult, setAnalysisResult] = useState(null)
// { title, items, action } | null
```

Cleared when the next command starts.

### New component: `AnalysisPanel`

Location: `app/src/renderer/src/components/AnalysisPanel/index.jsx`

Visual language matches `ExplanationPanel`:
- Slides in below terminal output (`bannerSlideIn` animation)
- Left border color: red for non-zero exit, blue/accent for zero exit
- Background: `color-mix(in srgb, var(--tab-accent) 7%, var(--bg-surface))`

Layout:
```
┌─────────────────────────────────────────────┐
│ ◉  3 build errors              [×] dismiss  │
├─────────────────────────────────────────────┤
│ ✗  undefined: TokenExpiry  auth/auth.go:42  │
│ ✗  cannot use string as int  db/conn.go:18  │
│ ⓘ  All errors in the auth package           │
├─────────────────────────────────────────────┤
│              [→ Try: go mod tidy]           │
└─────────────────────────────────────────────┘
```

Item type → icon + color:
- `error` → ✗ red
- `warning` → ⚠ yellow  
- `metric` → number badge, neutral
- `insight` → ● subtle, neutral

If `items.length > 5`, show first 4 + "show N more" expander.

`detail` field: clicking an item row expands an indented sub-row with the detail text.

`action`: renders as a pill button in the footer, same mechanic as existing suggestion chips — injects the command into the input bar on click.

### Wiring

`callbacksRef.current.onAIAnalysis = (result) => setAnalysisResult(result)`

Panel renders below `ExplanationPanel` (error banner), above the AI suggestion chips. Dismissed via ✕ button or when the next command starts.

---

## What This Does Not Do

- No per-tool classification or special-case prompts — the LLM handles all tool output generically
- No analysis on output below the size threshold
- Does not replace the existing error explanation banner
- No network calls — fully local via llama.cpp

---

## Files Touched

| File | Change |
|---|---|
| `core/llm/analyze.go` | New — `AnalyzeStream` function |
| `core/llm/prompt.go` | Add `BuildAnalyzeMessages` |
| `core/wire/types.go` | Add `TypeAIAnalysis` |
| `core/session/session.go` | Trigger analysis after command, send wire message |
| `app/src/renderer/src/components/AnalysisPanel/index.jsx` | New component |
| `app/src/renderer/src/components/TerminalPane/index.jsx` | Wire up state + render panel |
| `app/src/renderer/src/hooks/useTerminal.js` | Handle `TypeAIAnalysis` message |
