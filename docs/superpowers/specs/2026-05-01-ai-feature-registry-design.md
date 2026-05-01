# AI Feature Registry — Design Spec

**Date:** 2026-05-01  
**Status:** Approved

---

## Problem

The Go backend's AI logic is hardcoded in `session/session.go` and `session/detect.go` as `if/else` branches. Adding a new AI feature requires editing the central session handler, duplicating context assembly, and manually wiring prompts. The code does not scale beyond 2–3 features.

---

## Goal

Refactor the backend so that:
- Each AI feature is self-contained in its own file.
- Adding a new feature never requires touching `session.go`.
- All features share one command history window and one project context, assembled once per event.
- The refactor ships the first batch of 6 new/upgraded features.

---

## Architecture

### Core Trigger Types

```go
type Trigger int
const (
    TriggerCommandComplete Trigger = iota  // fired on TypeAIAppend (command finished)
    TriggerCwdChange                       // fired on OSC 7 (user cd'd)
    TriggerUserQuery                       // fired by explicit user action
)
```

### FeatureCtx — shared context passed to every feature

```go
type FeatureCtx struct {
    Entry        llm.HistoryEntry          // the command that just completed (CommandComplete only)
    History      []llm.HistoryEntry        // full shared window, max 10 entries
    Cwd          string
    Shell        string
    OS           string
    DirListing   []string                  // up to 60 file/dir names in cwd
    ProjectInfo  llm.ProjectInfo           // git, node, go, python, docker, k8s
    ProjectFiles map[string]string         // filename → truncated content (2KB max each)
}
```

`ProjectFiles` is populated from: `README.md`, `README`, `readme.md`, `package.json`, `Makefile`, `go.mod`, `pyproject.toml`, `requirements.txt`. Non-existent files are silently omitted.

### AIFeature Interface

```go
type AIFeature interface {
    Trigger() Trigger
    ShouldRun(fc FeatureCtx) bool
    Run(ctx context.Context, fc FeatureCtx, send func(wire.Message))
}
```

### Feature Registry

A package-level slice in `session/features/registry.go`:

```go
var Registered = []AIFeature{
    &SuggestFeature{},
    &ExplainFeature{},
    &AnomalyFeature{},
    &CommitMsgFeature{},
    &OnboardingFeature{},
    &GuardFeature{},
}
```

### Session Handler (session.go)

The `TypeAIAppend` and OSC 7 handlers become trigger dispatchers. They call `buildFeatureCtx` / `buildCwdFeatureCtx` once, then iterate over the registry:

```go
// TypeAIAppend
fc := buildFeatureCtx(entry, s)
ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
s.cancelSuggest = cancel
for _, f := range features.Registered {
    if f.Trigger() == TriggerCommandComplete && f.ShouldRun(fc) {
        f := f
        go func() { f.Run(ctx, fc, s.w.Send) }()
    }
}

// OSC 7
fc := buildCwdFeatureCtx(cwd, s)
ctx, cancel := newDetectContext()
s.cancelDetect = cancel
for _, f := range features.Registered {
    if f.Trigger() == TriggerCwdChange && f.ShouldRun(fc) {
        f := f
        go func() { f.Run(ctx, fc, s.w.Send) }()
    }
}
```

### Context Assembly

`buildFeatureCtx(entry, s)` assembles `FeatureCtx` once per `TypeAIAppend`:
- Copies `s.contextEntries` into `History`
- Calls `readDir(cwd)` for `DirListing`
- Attaches `s.currentCwd`, `Shell`, `OS`
- Does NOT read `ProjectFiles` (those are only needed on cwd change)

`buildCwdFeatureCtx(cwd, s)` assembles `FeatureCtx` once per OSC 7:
- Runs all env detectors concurrently (existing `detectEnv` logic)
- Reads project files (`README.md`, `package.json`, etc.) — local reads, no subprocess
- Populates `ProjectFiles`, `ProjectInfo`, `DirListing`

---

## File Layout

```
core/session/
  session.go                  // cleaned up: dispatches to registry, no feature logic
  detect.go                   // env detectors (unchanged), newDetectContext()
  context.go                  // buildFeatureCtx, buildCwdFeatureCtx, readProjectFiles
  features/
    registry.go               // Registered []AIFeature slice
    feature.go                // AIFeature interface, FeatureCtx, Trigger types
    suggest.go                // multi-suggestion feature
    explain.go                // error explanation with icon classification
    anomaly.go                // exit-0 warning/deprecation detection
    commitmsg.go              // git commit message injection
    onboarding.go             // first-visit project summary
    guard.go                  // dangerous command static-rule interception
core/llm/
  prompt.go                   // existing prompt builders (refactored per feature)
  suggest.go                  // SuggestMultiple() — returns []Suggestion
  explain.go                  // ExplainStream() — unchanged
  provider.go                 // Provider interface, HistoryEntry, SuggestRequest
  client.go                   // StreamClient — unchanged
```

---

## Feature Specs

### 1. SuggestFeature (`features/suggest.go`)

**Trigger:** `TriggerCommandComplete`  
**ShouldRun:** always (any exit code)

Calls `llm.SuggestMultiple()` which returns 4 ranked suggestions. The LLM prompt instructs JSON output:

```json
[
  {"command": "npm run dev", "label": "Start dev server", "icon": "npm"},
  {"command": "npm test",    "label": "Run tests",        "icon": "npm"},
  {"command": "git status",  "label": "Check git status", "icon": "git"},
  {"command": "ls -la",      "label": "List files",       "icon": "file"}
]
```

Wire: `TypeAIMultiSuggestion` payload `[]Suggestion`.

Frontend:
- `suggestions[0]` → ghost text in input bar
- `suggestions[1..3]` → clickable pills above input bar (clicking populates input bar, does not execute)

Icon values: `"git"`, `"npm"`, `"file"`, `"process"`, `"docker"`, `"python"`, `"go"`, `"generic"`

### 2. ExplainFeature (`features/explain.go`)

**Trigger:** `TriggerCommandComplete`  
**ShouldRun:** `entry.ExitCode != 0`

Same streaming explanation as today, but the banner start message gains an `icon` field:

```json
{"type": "error", "icon": "permission"}
```

Icon is determined by the LLM (one additional field in the prompt response):  
`"permission"` | `"not-found"` | `"syntax"` | `"network"` | `"timeout"` | `"generic"`

Wire: `TypeAIBannerStart` with `icon` field added. `TypeAIBannerToken`, `TypeAIBannerCancel` unchanged.

### 3. AnomalyFeature (`features/anomaly.go`)

**Trigger:** `TriggerCommandComplete`  
**ShouldRun:** `entry.ExitCode == 0 && output contains warning signals`

Pre-screening (no LLM cost): check output for patterns like `WARN`, `DeprecationWarning`, `deprecated`, `warning:` before making an LLM call. Only call the LLM if pre-screen passes.

LLM task: extract the most important warning in 1 sentence.

Wire: `TypeAIBannerStart` with `"type": "warning"`, then `TypeAIBannerToken` stream.

### 4. CommitMsgFeature (`features/commitmsg.go`)

**Trigger:** `TriggerCommandComplete`  
**ShouldRun:** `entry.Command` matches `git add` AND `entry.ExitCode == 0`

Triggered after `git add` completes (not after `git commit` — by then it's too late). The feature runs `git diff --staged` as a subprocess to get the staged diff, sends it to the LLM, and streams a suggested commit message as an info banner. The user sees the suggestion while they're about to type `git commit -m "..."`.

If `git diff --staged` returns empty (nothing staged), skip silently.

Wire: `TypeAIBannerStart` with `"type": "info"`, token stream of the suggested message.

### 5. OnboardingFeature (`features/onboarding.go`)

**Trigger:** `TriggerCwdChange`  
**ShouldRun:** `cwd != s.lastContextDir && ProjectFiles` contains at least one of README/package.json/Makefile

Replaces the existing `sendProjectContext`. Instead of using only structured `ProjectInfo`, this feature now also passes truncated file contents to the LLM for a richer, repo-specific onboarding sentence.

Dedup guard: `lastContextDir` — same as today, shown at most once per unique directory per session.

Wire: `TypeAIBannerStart` with `"type": "info"`, token stream.

### 6. GuardFeature (`features/guard.go`)

**Trigger:** `TriggerCommandComplete` (post-execution warning, not pre-execution block)  
**ShouldRun:** static pattern match on `entry.Command` against a hardcoded ruleset

No LLM call. Pure pattern matching. If a dangerous command was just run, send an informational banner explaining what it did and what to do if it was a mistake.

Patterns: `rm -rf`, `git reset --hard`, `git push --force`, `DROP TABLE`, `TRUNCATE`, `docker rm`, `chmod -R 777`, `curl | bash`, `wget | sh`, `pkill`, `killall`.

Wire: `TypeAIBannerStart` with `"type": "warning"`, static message (no streaming needed — use `TypeAIBannerToken` once with full text).

---

## Wire Protocol Changes

### New message types (wire/types.go)

```go
TypeAIMultiSuggestion = "ai_multi_suggestion"  // []Suggestion JSON
```

### Modified message payloads

`TypeAIBannerStart` payload gains an `icon` field:
```json
{"type": "error|warning|info", "icon": "permission|not-found|syntax|network|timeout|generic"}
```

### New types in llm/provider.go

```go
type Suggestion struct {
    Command string `json:"command"`
    Label   string `json:"label"`
    Icon    string `json:"icon"`
}
```

---

## Command History

All features share the same `[]llm.HistoryEntry` window on the session (max 10 entries, output truncated to 600 bytes). Each feature slices and formats the history differently in its prompt:

| Feature    | Entries used | Includes output | Includes exit code |
|------------|-------------|-----------------|-------------------|
| Suggest    | last 5      | yes (400 bytes) | yes               |
| Explain    | last 5      | yes (400/800 bytes) | yes           |
| Anomaly    | last 1      | yes (full)      | yes (must be 0)   |
| CommitMsg  | none (uses git diff --staged subprocess) | — | — |
| Onboarding | none        | —               | —                 |
| Guard      | last 1      | no              | no                |

---

## What Does NOT Change

- `llm/provider.go` Provider interface — unchanged
- `llm/client.go` StreamClient — unchanged  
- `session/detect.go` env detectors — unchanged, just called from `buildCwdFeatureCtx`
- Command history storage (max 10 entries, 600 byte truncation) — unchanged
- OSC sequence parsing in `pipe()` — unchanged

---

## Out of Scope

- Semantic history search (TriggerUserQuery) — requires new frontend UI; separate spec
- Persistent history across sessions — separate spec
- Pre-execution command interception (blocking Enter key) — separate spec
