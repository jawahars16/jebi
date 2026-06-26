# Task 1: Go Backend — Wire Types + NLQuery + Session Handler

## Context
jebi is an Electron terminal app with a Go PTY backend (`core/`). AI features communicate over WebSocket using typed messages defined in `core/wire/types.go`. This task adds the backend for a new "natural language → shell command" feature.

## Files to change

### 1. `core/wire/types.go`
Add three new constants after the existing TypeAI* block:
```go
TypeNLQuery  = "nl_query"   // frontend → backend: JSON {"query": string, "cwd": string}
TypeNLResult = "nl_result"  // backend → frontend: JSON {"command": string}
TypeNLError  = "nl_error"   // backend → frontend: plain string error message
```

### 2. `core/llm/nlquery.go` (NEW FILE)
Create this file in the `llm` package:
```go
package llm

import (
    "context"
    "errors"
    "strings"
)

// NLQuery translates a natural-language query into a single shell command.
// It reuses BuildMessages (which uses systemPromptTemplate) and ParseFinalResponse.
func NLQuery(ctx context.Context, provider Provider, query, cwd, shell, os string) (string, error) {
    req := QueryRequest{
        Query: query,
        Cwd:   cwd,
        Shell: shell,
        OS:    os,
    }
    messages := BuildMessages(req)
    ch, err := provider.StreamMessages(ctx, messages)
    if err != nil {
        return "", err
    }
    var sb strings.Builder
    for chunk := range ch {
        sb.WriteString(chunk.Token)
    }
    if ctx.Err() != nil {
        return "", ctx.Err()
    }
    result, err := ParseFinalResponse(sb.String())
    if err != nil {
        return "", err
    }
    // Take first non-empty step command
    for _, step := range result.Steps {
        if strings.TrimSpace(step.Command) != "" {
            return step.Command, nil
        }
    }
    return "", errors.New("no command returned")
}
```

Note: `QueryRequest`, `BuildMessages`, `ParseFinalResponse`, `Provider`, and `ResponseChunk` all already exist in the `llm` package — do not redefine them.

### 3. `core/session/session.go`
Add a new case in the `switch msg.Type` message loop (around line 450, after the existing TypeAsk/TypeSummarize cases):

```go
case wire.TypeNLQuery:
    var payload struct {
        Query string `json:"query"`
        Cwd   string `json:"cwd"`
    }
    if err := json.Unmarshal(msg.Data, &payload); err != nil || payload.Query == "" {
        break
    }
    if s.provider == nil || !s.provider.IsAvailable() {
        s.w.Send(wire.StringMessage(wire.TypeNLError, "AI not available"))
        break
    }
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    go func() {
        defer cancel()
        cwd := payload.Cwd
        if cwd == "" {
            cwd = s.currentCwd
        }
        cmd, err := llm.NLQuery(ctx, s.provider, payload.Query, cwd, resolveShell(s.cfg), runtime.GOOS+"/"+runtime.GOARCH)
        if err != nil || cmd == "" {
            s.w.Send(wire.StringMessage(wire.TypeNLError, "Could not translate query"))
            return
        }
        data, _ := json.Marshal(map[string]string{"command": cmd})
        s.w.Send(wire.Message{Type: wire.TypeNLResult, Data: data})
    }()
```

## Constraints
- Do NOT add any context-cancellation map (unlike ask/summarize, NL queries are fire-and-forget — no cancel wire type)
- Reuse existing `llm` package functions — no new prompt templates
- The goroutine must use `defer cancel()` to avoid context leak
- `wire.StringMessage` already exists for sending plain string payloads

## Verification
```bash
cd /Users/jawahar/Work/me/jebi/.worktrees/feat-nl-command/core && go build ./...
```
Must compile with zero errors.

## Working directory
`/Users/jawahar/Work/me/jebi/.worktrees/feat-nl-command`

## Report file
Write your full report to: `/Users/jawahar/Work/me/jebi/.superpowers/sdd/task-1-report.md`
Return: status (DONE/BLOCKED/NEEDS_CONTEXT), commit hash, one-line build result, any concerns.
