# Task 1 Report

**Status:** DONE  
**Commit:** c6ee72a  
**Build:** `go build ./...` — zero errors, zero warnings

## Changes made

1. **`core/wire/types.go`** — Added `TypeNLQuery`, `TypeNLResult`, `TypeNLError` constants after the existing `TypeSummarize` constant.

2. **`core/llm/nlquery.go`** (new file) — Implements `NLQuery(ctx, provider, query, cwd, shell, os)` using `BuildMessages` + `provider.StreamMessages` + `ParseFinalResponse`. Returns the first non-empty step command or an error.

3. **`core/session/session.go`** — Added `case wire.TypeNLQuery:` in the message switch after `TypeAsk`. Unmarshals `{query, cwd}`, checks provider availability, launches a goroutine with a 30s context timeout (`defer cancel()`), calls `llm.NLQuery`, and sends either `TypeNLResult` (JSON `{"command":"…"}`) or `TypeNLError` (plain string).

## Concerns

None. All constraints met: no cancel-map added (fire-and-forget), no new prompt templates, `defer cancel()` present on the goroutine.
