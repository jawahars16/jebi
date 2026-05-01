# AI Feature Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `if/else` AI logic in `session.go` with a registry of self-contained `AIFeature` implementations, and ship 6 new/upgraded AI features.

**Architecture:** Each AI feature implements the `AIFeature` interface (`Trigger`, `ShouldRun`, `Run`) and lives in its own file under `session/features/`. The session handler iterates the registry on each event — adding a new feature never requires touching `session.go`. A shared `FeatureCtx` carries command history, project info, and file contents to every feature.

**Tech Stack:** Go 1.25, `terminal/core` module, no new dependencies.

**Design spec:** `docs/superpowers/specs/2026-05-01-ai-feature-registry-design.md`

---

## File Map

**Create:**
- `core/session/features/feature.go` — `AIFeature` interface, `FeatureCtx`, `Trigger` types
- `core/session/features/feature_test.go` — shared mock provider for all feature tests
- `core/session/features/registry.go` — `Registered []AIFeature` slice
- `core/session/features/suggest.go` — `SuggestFeature` (4 ranked suggestions)
- `core/session/features/suggest_test.go`
- `core/session/features/explain.go` — `ExplainFeature` (error explanation + icon)
- `core/session/features/explain_test.go`
- `core/session/features/anomaly.go` — `AnomalyFeature` (exit-0 warning detection)
- `core/session/features/anomaly_test.go`
- `core/session/features/guard.go` — `GuardFeature` (static dangerous command rules)
- `core/session/features/guard_test.go`
- `core/session/features/commitmsg.go` — `CommitMsgFeature` (suggest after `git add`)
- `core/session/features/commitmsg_test.go`
- `core/session/features/onboarding.go` — `OnboardingFeature` (project context on cd)
- `core/session/features/onboarding_test.go`
- `core/session/context.go` — `buildFeatureCtx`, `buildCwdFeatureCtx`, `readProjectFiles`
- `core/session/context_test.go`

**Modify:**
- `core/wire/types.go` — add `TypeAIMultiSuggestion`
- `core/llm/provider.go` — add `Suggestion` struct
- `core/llm/prompt.go` — add `BuildSuggestMultipleMessages`, `ParseSuggestMultipleResponse`, `BuildAnomalyMessages`, `BuildCommitMsgMessages`, `BuildOnboardingMessages` (replaces `BuildProjectContextMessages`)
- `core/llm/suggest.go` — add `SuggestMultiple()` function
- `core/session/detect.go` — extract `gatherDetectors` from `detectEnv`, remove `sendProjectContext`
- `core/session/session.go` — replace `TypeAIAppend` handler and OSC-7 dispatch with registry loop

---

## Task 1: Core types — AIFeature interface and FeatureCtx

**Files:**
- Create: `core/session/features/feature.go`
- Create: `core/session/features/feature_test.go` (mock provider, used by all later feature tests)

- [ ] **Step 1: Create feature.go**

```go
// core/session/features/feature.go
package features

import (
	"context"
	"terminal/core/llm"
	"terminal/core/wire"
)

// Trigger identifies which session event activates a feature.
type Trigger int

const (
	TriggerCommandComplete Trigger = iota // TypeAIAppend — a command finished
	TriggerCwdChange                      // OSC 7 — user cd'd into a directory
	TriggerUserQuery                      // explicit user-initiated action
)

// FeatureCtx is the shared context assembled once per event and passed to every feature.
type FeatureCtx struct {
	Provider     llm.Provider          // LLM backend for making AI calls
	Entry        llm.HistoryEntry      // the command that just completed (CommandComplete only)
	History      []llm.HistoryEntry    // full window, max 10 entries
	Cwd          string
	Shell        string
	OS           string
	DirListing   []string              // up to 60 names in cwd, dirs suffixed with /
	ProjectInfo  llm.ProjectInfo       // git, node, go, python, docker, k8s
	ProjectFiles map[string]string     // filename → truncated file content (2 KB max each)
}

// AIFeature is implemented by each AI capability.
type AIFeature interface {
	Trigger() Trigger
	ShouldRun(fc FeatureCtx) bool
	Run(ctx context.Context, fc FeatureCtx, send func(wire.Message))
}
```

- [ ] **Step 2: Create feature_test.go with mock provider (reused by all feature tests)**

```go
// core/session/features/feature_test.go
package features

import (
	"context"
	"terminal/core/llm"
)

// mockProvider streams a fixed list of tokens then closes.
type mockProvider struct {
	tokens []string
}

func (m *mockProvider) IsAvailable() bool { return true }
func (m *mockProvider) Name() string      { return "mock" }

func (m *mockProvider) StreamQuery(_ context.Context, _ llm.QueryRequest) (<-chan llm.ResponseChunk, error) {
	return m.stream(), nil
}

func (m *mockProvider) StreamMessages(_ context.Context, _ []llm.ChatMessage) (<-chan llm.ResponseChunk, error) {
	return m.stream(), nil
}

func (m *mockProvider) stream() <-chan llm.ResponseChunk {
	ch := make(chan llm.ResponseChunk, len(m.tokens)+1)
	for _, t := range m.tokens {
		ch <- llm.ResponseChunk{Token: t}
	}
	close(ch)
	return ch
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/jawahar/Work/terminal/term/core && go build ./session/features/...
```
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add core/session/features/feature.go core/session/features/feature_test.go
git commit -m "feat: add AIFeature interface and FeatureCtx"
```

---

## Task 2: Wire protocol and Suggestion type

**Files:**
- Modify: `core/wire/types.go`
- Modify: `core/llm/provider.go`

- [ ] **Step 1: Add TypeAIMultiSuggestion to wire/types.go**

Add after `TypeAIBannerCancel`:

```go
// TypeAIMultiSuggestion carries 4 ranked suggestions as JSON []Suggestion.
// Replaces TypeAISuggestion for the upgraded suggest feature.
TypeAIMultiSuggestion = "ai_multi_suggestion"
```

- [ ] **Step 2: Add Suggestion struct to llm/provider.go**

Add after the `ResponseChunk` struct:

```go
// Suggestion is one ranked command recommendation returned by SuggestMultiple.
type Suggestion struct {
	Command string `json:"command"`
	Label   string `json:"label"` // short human-readable description
	Icon    string `json:"icon"`  // git | npm | file | process | docker | python | go | generic
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/jawahar/Work/terminal/term/core && go build ./...
```
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add core/wire/types.go core/llm/provider.go
git commit -m "feat: add TypeAIMultiSuggestion wire type and Suggestion struct"
```

---

## Task 3: Project file reading and context builders

**Files:**
- Create: `core/session/context.go`
- Create: `core/session/context_test.go`

- [ ] **Step 1: Write failing tests**

```go
// core/session/context_test.go
package session

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadProjectFiles_ReadsKnownFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "README.md"), []byte("# Hello"), 0644)
	os.WriteFile(filepath.Join(dir, "package.json"), []byte(`{"name":"app"}`), 0644)

	files := readProjectFiles(dir)

	if files["README.md"] != "# Hello" {
		t.Errorf("README.md = %q, want %q", files["README.md"], "# Hello")
	}
	if files["package.json"] != `{"name":"app"}` {
		t.Errorf("package.json = %q, want %q", files["package.json"], `{"name":"app"}`)
	}
}

func TestReadProjectFiles_SkipsMissingFiles(t *testing.T) {
	dir := t.TempDir()
	files := readProjectFiles(dir)
	if len(files) != 0 {
		t.Errorf("expected empty map, got %v", files)
	}
}

func TestReadProjectFiles_TruncatesLargeFile(t *testing.T) {
	dir := t.TempDir()
	large := make([]byte, 4096)
	for i := range large {
		large[i] = 'x'
	}
	os.WriteFile(filepath.Join(dir, "README.md"), large, 0644)

	files := readProjectFiles(dir)
	if len(files["README.md"]) > projectFileMaxBytes+5 {
		t.Errorf("README.md not truncated: len=%d", len(files["README.md"]))
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/ -run TestReadProjectFiles -v
```
Expected: FAIL — `readProjectFiles` undefined, `projectFileMaxBytes` undefined.

- [ ] **Step 3: Create context.go**

```go
// core/session/context.go
package session

import (
	"os"
	"path/filepath"
	"runtime"

	"terminal/core/llm"
	"terminal/core/session/features"
)

// projectFileMaxBytes is the maximum bytes read from any single project file.
const projectFileMaxBytes = 2048

// projectFileNames is the ordered list of files to read when entering a directory.
var projectFileNames = []string{
	"README.md", "README", "readme.md",
	"package.json",
	"Makefile",
	"go.mod",
	"pyproject.toml",
	"requirements.txt",
}

// readProjectFiles reads each known project file in dir, truncating to projectFileMaxBytes.
// Missing files are silently skipped. Returns empty map when dir is empty or unreadable.
func readProjectFiles(dir string) map[string]string {
	out := make(map[string]string)
	for _, name := range projectFileNames {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		content := string(data)
		if len(content) > projectFileMaxBytes {
			content = content[:projectFileMaxBytes] + "…"
		}
		out[name] = content
	}
	return out
}

// buildFeatureCtx assembles a FeatureCtx for a TypeAIAppend event.
// ProjectFiles and ProjectInfo are not included — those are cwd-change state.
func (s *Session) buildFeatureCtx(entry llm.HistoryEntry) features.FeatureCtx {
	history := make([]llm.HistoryEntry, len(s.contextEntries))
	copy(history, s.contextEntries)
	return features.FeatureCtx{
		Provider:   s.provider,
		Entry:      entry,
		History:    history,
		Cwd:        s.currentCwd,
		Shell:      resolveShell(s.cfg),
		OS:         runtime.GOOS + "/" + runtime.GOARCH,
		DirListing: readDir(s.currentCwd),
	}
}

// buildCwdFeatureCtx assembles a FeatureCtx for a cwd-change event.
// Called after detectEnv has already populated info and sent wire messages.
func (s *Session) buildCwdFeatureCtx(cwd string, info llm.ProjectInfo) features.FeatureCtx {
	return features.FeatureCtx{
		Provider:     s.provider,
		Cwd:          cwd,
		Shell:        resolveShell(s.cfg),
		OS:           runtime.GOOS + "/" + runtime.GOARCH,
		DirListing:   readDir(cwd),
		ProjectInfo:  info,
		ProjectFiles: readProjectFiles(cwd),
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/ -run TestReadProjectFiles -v
```
Expected: PASS all three tests.

- [ ] **Step 5: Commit**

```bash
git add core/session/context.go core/session/context_test.go
git commit -m "feat: add readProjectFiles and FeatureCtx builders"
```

---

## Task 4: SuggestMultiple — 4 ranked suggestions

**Files:**
- Modify: `core/llm/prompt.go` — add `BuildSuggestMultipleMessages`, `ParseSuggestMultipleResponse`
- Modify: `core/llm/suggest.go` — add `SuggestMultiple`
- Create: `core/llm/suggest_test.go`

- [ ] **Step 1: Write failing tests**

```go
// core/llm/suggest_test.go
package llm

import (
	"strings"
	"testing"
)

func TestParseSuggestMultipleResponse_ValidJSON(t *testing.T) {
	raw := `[
		{"command":"npm run dev","label":"Start dev server","icon":"npm"},
		{"command":"git status","label":"Check git status","icon":"git"},
		{"command":"ls -la","label":"List files","icon":"file"},
		{"command":"npm test","label":"Run tests","icon":"npm"}
	]`
	suggestions, err := ParseSuggestMultipleResponse(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(suggestions) != 4 {
		t.Fatalf("len = %d, want 4", len(suggestions))
	}
	if suggestions[0].Command != "npm run dev" {
		t.Errorf("suggestions[0].Command = %q, want %q", suggestions[0].Command, "npm run dev")
	}
	if suggestions[0].Icon != "npm" {
		t.Errorf("suggestions[0].Icon = %q, want %q", suggestions[0].Icon, "npm")
	}
}

func TestParseSuggestMultipleResponse_ExtractFromNoise(t *testing.T) {
	raw := `Here are suggestions: [{"command":"ls","label":"List","icon":"file"},{"command":"pwd","label":"Print dir","icon":"file"},{"command":"cd ..","label":"Go up","icon":"file"},{"command":"cat README.md","label":"Read README","icon":"file"}]`
	suggestions, err := ParseSuggestMultipleResponse(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(suggestions) == 0 {
		t.Fatal("expected suggestions, got none")
	}
}

func TestParseSuggestMultipleResponse_InvalidJSON(t *testing.T) {
	_, err := ParseSuggestMultipleResponse("not json at all")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestBuildSuggestMultipleMessages_IncludesDirListing(t *testing.T) {
	req := SuggestRequest{
		Entries:    []HistoryEntry{{Command: "git clone https://github.com/x/y", Output: "", ExitCode: 0}},
		Cwd:        "/home/user/y",
		Shell:      "zsh",
		OS:         "darwin/arm64",
		DirListing: []string{"main.go", "go.mod", "README.md"},
	}
	msgs := BuildSuggestMultipleMessages(req)
	if len(msgs) != 2 {
		t.Fatalf("len(msgs) = %d, want 2", len(msgs))
	}
	if !strings.Contains(msgs[1].Content, "main.go") {
		t.Errorf("user message missing dir listing: %q", msgs[1].Content)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./llm/ -run TestParseSuggestMultiple -v
```
Expected: FAIL — `ParseSuggestMultipleResponse` undefined.

- [ ] **Step 3: Add prompt builder and parser to prompt.go**

Add after `ParseSuggestResponse`:

```go
const suggestMultiplePromptTemplate = `You are an expert terminal assistant. Predict the 4 most useful next shell commands, ordered by relevance.

Environment:
Shell: %s
OS: %s
Current directory: %s

Rules:
- Output ONLY a valid JSON array. No text before or after.
- Format: [{"command":"<cmd>","label":"<short description>","icon":"<icon>"},...]
- Return exactly 4 items, best first.
- icon must be one of: git, npm, file, process, docker, python, go, generic
- No destructive commands unless clearly implied by history.
- If context is unclear, return 4 generally useful commands for the directory.
- Never repeat a command that failed in history as-is.

Return only the JSON array.`

// BuildSuggestMultipleMessages builds messages for the 4-suggestion request.
func BuildSuggestMultipleMessages(req SuggestRequest) []ChatMessage {
	system := fmt.Sprintf(suggestMultiplePromptTemplate, req.Shell, req.OS, req.Cwd)
	var sb strings.Builder
	fmt.Fprintf(&sb, "Current directory: %s\n", req.Cwd)
	if len(req.DirListing) > 0 {
		fmt.Fprintf(&sb, "Files: %s\n", strings.Join(req.DirListing, "  "))
	}
	sb.WriteString("\n")
	start := len(req.Entries) - explainMaxContextEntries
	if start < 0 {
		start = 0
	}
	for _, e := range req.Entries[start:] {
		status := "ok"
		if e.ExitCode != 0 {
			status = fmt.Sprintf("exit %d", e.ExitCode)
		}
		fmt.Fprintf(&sb, "$ %s  [%s]\n%s\n", e.Command, status, truncate(e.Output, explainMaxOutputBytes))
	}
	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: sb.String()},
	}
}

// ParseSuggestMultipleResponse extracts a []Suggestion from the raw LLM response.
// Falls back to extracting the first '[' … last ']' substring to handle model preamble.
func ParseSuggestMultipleResponse(raw string) ([]Suggestion, error) {
	raw = strings.TrimSpace(raw)
	var suggestions []Suggestion
	if err := json.Unmarshal([]byte(raw), &suggestions); err == nil {
		return suggestions, nil
	}
	start := strings.Index(raw, "[")
	end := strings.LastIndex(raw, "]")
	if start >= 0 && end > start {
		if err := json.Unmarshal([]byte(raw[start:end+1]), &suggestions); err == nil {
			return suggestions, nil
		}
	}
	return nil, fmt.Errorf("could not parse multi-suggestion response: %q", raw)
}
```

- [ ] **Step 4: Add SuggestMultiple to suggest.go**

Add after the existing `Suggest` function:

```go
// SuggestMultiple returns up to 4 ranked command suggestions.
// Returns nil when the provider produces no parseable response.
func SuggestMultiple(ctx context.Context, provider Provider, req SuggestRequest) ([]Suggestion, error) {
	ch, err := provider.StreamMessages(ctx, BuildSuggestMultipleMessages(req))
	if err != nil {
		return nil, err
	}
	var acc strings.Builder
	for chunk := range ch {
		acc.WriteString(chunk.Token)
	}
	return ParseSuggestMultipleResponse(acc.String())
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./llm/ -run "TestParseSuggestMultiple|TestBuildSuggestMultiple" -v
```
Expected: PASS all four tests.

- [ ] **Step 6: Commit**

```bash
git add core/llm/prompt.go core/llm/suggest.go core/llm/suggest_test.go
git commit -m "feat: add SuggestMultiple returning 4 ranked suggestions"
```

---

## Task 5: Add remaining LLM prompts (anomaly, commit message, onboarding)

**Files:**
- Modify: `core/llm/prompt.go`

- [ ] **Step 1: Add anomaly prompt builder**

Add after `ParseSuggestMultipleResponse`:

```go
const anomalyPromptTemplate = "You are a terminal assistant. A command succeeded but its output contains warnings or deprecation notices.\n" +
	"Identify the single most important warning and describe it in 1 sentence.\n\n" +
	"Rules:\n" +
	"- One sentence only. No markdown except backticks. No bullet points.\n" +
	"- Be specific: name the package, flag, or API that is deprecated.\n" +
	"- If there is nothing genuinely actionable, output empty string.\n\n" +
	"Return only the sentence, or empty string."

// BuildAnomalyMessages builds messages to summarise a warning found in successful output.
func BuildAnomalyMessages(entry HistoryEntry) []ChatMessage {
	user := fmt.Sprintf("Command: %s\nOutput:\n%s", entry.Command, truncate(entry.Output, 800))
	return []ChatMessage{
		{Role: "system", Content: anomalyPromptTemplate},
		{Role: "user", Content: user},
	}
}
```

- [ ] **Step 2: Add commit message prompt builder**

Add after `BuildAnomalyMessages`:

```go
const commitMsgPromptTemplate = "You are a Git expert. Generate a concise, conventional commit message for the staged changes.\n\n" +
	"Rules:\n" +
	"- Format: <type>(<scope>): <subject>  (scope is optional)\n" +
	"- Types: feat, fix, refactor, docs, test, chore, style, perf\n" +
	"- Subject: imperative mood, lowercase, no period, max 72 chars\n" +
	"- No body or footer.\n" +
	"- Output only the commit message line. Nothing else.\n\n" +
	"Examples:\n" +
	"- feat(auth): add JWT refresh token support\n" +
	"- fix: handle nil pointer in config loader\n" +
	"- chore(deps): upgrade go.mod dependencies"

// BuildCommitMsgMessages builds messages to generate a commit message from a staged diff.
func BuildCommitMsgMessages(stagedDiff string) []ChatMessage {
	user := fmt.Sprintf("Staged diff:\n%s", truncate(stagedDiff, 2000))
	return []ChatMessage{
		{Role: "system", Content: commitMsgPromptTemplate},
		{Role: "user", Content: user},
	}
}
```

- [ ] **Step 3: Add onboarding prompt builder (replaces BuildProjectContextMessages)**

Add after `BuildCommitMsgMessages`. Keep `BuildProjectContextMessages` for now — it will be deleted in Task 13 after the session refactor is complete.

```go
// BuildOnboardingMessages builds messages for a project context summary that includes
// actual file contents (README, package.json, etc.) for richer, repo-specific output.
func BuildOnboardingMessages(info ProjectInfo, files map[string]string) []ChatMessage {
	var parts []string

	// Structured project info (same as BuildProjectContextMessages)
	if info.Git != "" {
		fields := strings.SplitN(info.Git, "|", 4)
		branch := fields[0]
		dirty := len(fields) > 1 && fields[1] == "1"
		s := "git branch: " + branch
		if dirty {
			s += " (uncommitted changes)"
		}
		parts = append(parts, s)
	}
	if info.Node != "" {
		fields := strings.SplitN(info.Node, "|", 2)
		s := "Node.js " + fields[0]
		if len(fields) > 1 && fields[1] != "" && fields[1] != "npm" {
			s += ", package manager: " + fields[1]
		}
		parts = append(parts, s)
	}
	if info.Go != "" {
		parts = append(parts, "Go "+info.Go)
	}
	if info.Python != "" {
		fields := strings.SplitN(info.Python, "|", 2)
		s := "Python " + fields[0]
		if len(fields) > 1 && fields[1] != "" {
			s += " (venv: " + fields[1] + " active)"
		} else {
			s += " (no venv active)"
		}
		parts = append(parts, s)
	}
	if info.Docker != "" {
		if info.Docker == "compose" {
			parts = append(parts, "Docker Compose available")
		} else {
			parts = append(parts, "Dockerfile present")
		}
	}
	if info.K8s != "" {
		fields := strings.SplitN(info.K8s, "|", 2)
		parts = append(parts, "Kubernetes context: "+fields[0])
	}

	system := "You are a terminal assistant. A user just cd'd into a project directory.\n" +
		"You will receive structured facts and optionally file contents. Write ONE short sentence surfacing something genuinely useful the user should know.\n\n" +
		"IMPORTANT: Only use the facts provided. Do not invent or infer anything not in the facts.\n\n" +
		"Focus on actionable status:\n" +
		"- Uncommitted or unpushed git changes\n" +
		"- Python venv not activated (only when Python is detected)\n" +
		"- How to run or build the project (from README/Makefile/package.json)\n" +
		"- Notable combinations (e.g. Go + Kubernetes context pointing to production)\n\n" +
		"Rules:\n" +
		"- One sentence only. No labels. No markdown except backticks.\n" +
		"- If there is nothing genuinely useful to surface, output empty string.\n" +
		"- Generic observations like 'this is a Node.js project' are not useful.\n\n" +
		"Return only the sentence, or empty string."

	var userParts []string
	if len(parts) > 0 {
		userParts = append(userParts, "Detected:\n- "+strings.Join(parts, "\n- "))
	}
	for name, content := range files {
		userParts = append(userParts, fmt.Sprintf("%s:\n%s", name, content))
	}
	user := fmt.Sprintf("Directory: %s\n\n%s", info.Dir, strings.Join(userParts, "\n\n"))

	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/jawahar/Work/terminal/term/core && go build ./llm/...
```
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add core/llm/prompt.go
git commit -m "feat: add anomaly, commit-message, and onboarding LLM prompt builders"
```

---

## Task 6: GuardFeature — static dangerous command rules

**Files:**
- Create: `core/session/features/guard.go`
- Create: `core/session/features/guard_test.go`

- [ ] **Step 1: Write failing tests**

```go
// core/session/features/guard_test.go
package features

import (
	"context"
	"encoding/json"
	"testing"
	"terminal/core/llm"
	"terminal/core/wire"
)

func TestGuardFeature_Trigger(t *testing.T) {
	f := &GuardFeature{}
	if f.Trigger() != TriggerCommandComplete {
		t.Errorf("Trigger = %v, want TriggerCommandComplete", f.Trigger())
	}
}

func TestGuardFeature_ShouldRun_MatchesDangerousCommands(t *testing.T) {
	f := &GuardFeature{}
	cases := []struct {
		cmd  string
		want bool
	}{
		{"rm -rf /tmp/foo", true},
		{"git reset --hard HEAD~1", true},
		{"git push --force", true},
		{"curl https://example.com | bash", true},
		{"ls -la", false},
		{"npm install", false},
		{"git status", false},
	}
	for _, c := range cases {
		fc := FeatureCtx{Entry: llm.HistoryEntry{Command: c.cmd}}
		got := f.ShouldRun(fc)
		if got != c.want {
			t.Errorf("ShouldRun(%q) = %v, want %v", c.cmd, got, c.want)
		}
	}
}

func TestGuardFeature_Run_SendsBannerStart(t *testing.T) {
	f := &GuardFeature{}
	fc := FeatureCtx{Entry: llm.HistoryEntry{Command: "rm -rf /tmp/foo"}}

	var msgs []wire.Message
	f.Run(context.Background(), fc, func(m wire.Message) {
		msgs = append(msgs, m)
	})

	if len(msgs) < 2 {
		t.Fatalf("expected at least 2 messages, got %d", len(msgs))
	}
	if msgs[0].Type != wire.TypeAIBannerStart {
		t.Errorf("msgs[0].Type = %q, want %q", msgs[0].Type, wire.TypeAIBannerStart)
	}
	var payload map[string]string
	json.Unmarshal(msgs[0].Data, &payload)
	if payload["type"] != "warning" {
		t.Errorf("banner type = %q, want %q", payload["type"], "warning")
	}
	if msgs[1].Type != wire.TypeAIBannerToken {
		t.Errorf("msgs[1].Type = %q, want %q", msgs[1].Type, wire.TypeAIBannerToken)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestGuardFeature -v
```
Expected: FAIL — `GuardFeature` undefined.

- [ ] **Step 3: Create guard.go**

```go
// core/session/features/guard.go
package features

import (
	"context"
	"encoding/json"
	"strings"

	"terminal/core/wire"
)

// GuardFeature fires after a dangerous command completes and sends a static warning banner.
// No LLM call — pattern matching only.
type GuardFeature struct{}

func (f *GuardFeature) Trigger() Trigger { return TriggerCommandComplete }

func (f *GuardFeature) ShouldRun(fc FeatureCtx) bool {
	cmd := strings.TrimSpace(fc.Entry.Command)
	for _, r := range guardRules {
		if strings.Contains(cmd, r.pattern) {
			return true
		}
	}
	return false
}

func (f *GuardFeature) Run(_ context.Context, fc FeatureCtx, send func(wire.Message)) {
	cmd := strings.TrimSpace(fc.Entry.Command)
	for _, r := range guardRules {
		if strings.Contains(cmd, r.pattern) {
			startData, _ := json.Marshal(map[string]string{"type": "warning", "icon": "generic"})
			send(wire.Message{Type: wire.TypeAIBannerStart, Data: startData})
			data, _ := json.Marshal(r.message)
			send(wire.Message{Type: wire.TypeAIBannerToken, Data: data})
			return
		}
	}
}

type guardRule struct {
	pattern string
	message string
}

var guardRules = []guardRule{
	{"rm -rf", "Recursive force delete — files are unrecoverable without a backup."},
	{"git reset --hard", "`git reset --hard` discards all uncommitted changes permanently."},
	{"git push --force", "`git push --force` rewrites remote history — coordinate with teammates first."},
	{"git clean -fd", "`git clean -fd` permanently deletes untracked files and directories."},
	{"DROP TABLE", "`DROP TABLE` permanently deletes the table and all its data."},
	{"TRUNCATE", "`TRUNCATE` deletes all rows in the table — this cannot be rolled back outside a transaction."},
	{"docker rm", "`docker rm` removes the container — any data not in a volume is lost."},
	{"chmod -R 777", "`chmod -R 777` makes files world-writable — a security risk on shared systems."},
	{"curl | bash", "Piping `curl` into `bash` executes remote code without review — verify the source first."},
	{"wget | sh", "Piping `wget` into `sh` executes remote code without review — verify the source first."},
	{"pkill", "`pkill` sends a signal to all matching processes — double-check the pattern before running."},
	{"killall", "`killall` terminates every process with this name — ensure no critical processes share it."},
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestGuardFeature -v
```
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add core/session/features/guard.go core/session/features/guard_test.go
git commit -m "feat: add GuardFeature with static dangerous command rules"
```

---

## Task 7: AnomalyFeature — exit-0 warning detection

**Files:**
- Create: `core/session/features/anomaly.go`
- Create: `core/session/features/anomaly_test.go`

- [ ] **Step 1: Write failing tests**

```go
// core/session/features/anomaly_test.go
package features

import (
	"context"
	"testing"
	"terminal/core/llm"
	"terminal/core/wire"
)

func TestAnomalyFeature_Trigger(t *testing.T) {
	f := &AnomalyFeature{}
	if f.Trigger() != TriggerCommandComplete {
		t.Errorf("Trigger = %v, want TriggerCommandComplete", f.Trigger())
	}
}

func TestAnomalyFeature_ShouldRun_ExitZeroWithWarning(t *testing.T) {
	f := &AnomalyFeature{}
	cases := []struct {
		output   string
		exitCode int
		want     bool
	}{
		{"npm WARN deprecated foo@1.0.0", 0, true},
		{"DeprecationWarning: Buffer() is deprecated", 0, true},
		{"warning: unused variable 'x'", 0, true},
		{"Build succeeded", 0, false},
		{"npm WARN deprecated foo@1.0.0", 1, false}, // non-zero exit → ExplainFeature handles it
		{"", 0, false},
	}
	for _, c := range cases {
		fc := FeatureCtx{Entry: llm.HistoryEntry{Output: c.output, ExitCode: c.exitCode}}
		got := f.ShouldRun(fc)
		if got != c.want {
			t.Errorf("ShouldRun(output=%q, exit=%d) = %v, want %v", c.output, c.exitCode, got, c.want)
		}
	}
}

func TestAnomalyFeature_Run_StreamsBanner(t *testing.T) {
	f := &AnomalyFeature{}
	provider := &mockProvider{tokens: []string{"Package ", "foo ", "is deprecated."}}
	fc := FeatureCtx{
		Provider: provider,
		Entry:    llm.HistoryEntry{Command: "npm install", Output: "npm WARN deprecated foo@1.0.0", ExitCode: 0},
	}

	var msgs []wire.Message
	f.Run(context.Background(), fc, func(m wire.Message) {
		msgs = append(msgs, m)
	})

	if len(msgs) == 0 {
		t.Fatal("expected messages, got none")
	}
	if msgs[0].Type != wire.TypeAIBannerStart {
		t.Errorf("msgs[0].Type = %q, want TypeAIBannerStart", msgs[0].Type)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestAnomalyFeature -v
```
Expected: FAIL — `AnomalyFeature` undefined.

- [ ] **Step 3: Create anomaly.go**

```go
// core/session/features/anomaly.go
package features

import (
	"context"
	"encoding/json"
	"strings"

	"terminal/core/llm"
	"terminal/core/wire"
)

// AnomalyFeature detects warnings in successful command output and streams a summary.
type AnomalyFeature struct{}

func (f *AnomalyFeature) Trigger() Trigger { return TriggerCommandComplete }

func (f *AnomalyFeature) ShouldRun(fc FeatureCtx) bool {
	if fc.Entry.ExitCode != 0 {
		return false
	}
	lower := strings.ToLower(fc.Entry.Output)
	for _, p := range anomalyPatterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

var anomalyPatterns = []string{
	"warn", "deprecat", "warning:", "deprecated", "notice:", "caution",
}

func (f *AnomalyFeature) Run(ctx context.Context, fc FeatureCtx, send func(wire.Message)) {
	msgs := llm.BuildAnomalyMessages(fc.Entry)
	ch, err := fc.Provider.StreamMessages(ctx, msgs)
	if err != nil {
		return
	}
	started := false
	for chunk := range ch {
		if chunk.Token == "" {
			continue
		}
		if !started {
			startData, _ := json.Marshal(map[string]string{"type": "warning", "icon": "generic"})
			send(wire.Message{Type: wire.TypeAIBannerStart, Data: startData})
			started = true
		}
		data, _ := json.Marshal(chunk.Token)
		send(wire.Message{Type: wire.TypeAIBannerToken, Data: data})
	}
	if started && ctx.Err() != nil {
		send(wire.Message{Type: wire.TypeAIBannerCancel})
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestAnomalyFeature -v
```
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add core/session/features/anomaly.go core/session/features/anomaly_test.go
git commit -m "feat: add AnomalyFeature for exit-0 warning detection"
```

---

## Task 8: ExplainFeature — error explanation with icon

**Files:**
- Create: `core/session/features/explain.go`
- Create: `core/session/features/explain_test.go`

- [ ] **Step 1: Write failing tests**

```go
// core/session/features/explain_test.go
package features

import (
	"context"
	"encoding/json"
	"testing"
	"terminal/core/llm"
	"terminal/core/wire"
)

func TestExplainFeature_Trigger(t *testing.T) {
	f := &ExplainFeature{}
	if f.Trigger() != TriggerCommandComplete {
		t.Errorf("Trigger = %v, want TriggerCommandComplete", f.Trigger())
	}
}

func TestExplainFeature_ShouldRun_OnlyOnNonZeroExit(t *testing.T) {
	f := &ExplainFeature{}
	cases := []struct {
		exitCode int
		want     bool
	}{
		{0, false},
		{1, true},
		{127, true},
		{-1, true},
	}
	for _, c := range cases {
		fc := FeatureCtx{Entry: llm.HistoryEntry{ExitCode: c.exitCode}}
		if got := f.ShouldRun(fc); got != c.want {
			t.Errorf("ShouldRun(exit=%d) = %v, want %v", c.exitCode, got, c.want)
		}
	}
}

func TestClassifyErrorIcon(t *testing.T) {
	cases := []struct {
		output string
		want   string
	}{
		{"bash: foo: command not found", "not-found"},
		{"permission denied", "permission"},
		{"Operation not permitted", "permission"},
		{"SyntaxError: unexpected token", "syntax"},
		{"connection refused", "network"},
		{"ECONNREFUSED", "network"},
		{"request timed out", "network"},
		{"some unknown error", "generic"},
	}
	for _, c := range cases {
		got := classifyErrorIcon(c.output)
		if got != c.want {
			t.Errorf("classifyErrorIcon(%q) = %q, want %q", c.output, got, c.want)
		}
	}
}

func TestExplainFeature_Run_SendsBannerWithIcon(t *testing.T) {
	f := &ExplainFeature{}
	provider := &mockProvider{tokens: []string{"Permission ", "denied."}}
	fc := FeatureCtx{
		Provider: provider,
		Entry:    llm.HistoryEntry{Command: "cat /etc/shadow", Output: "permission denied", ExitCode: 1},
		History:  []llm.HistoryEntry{{Command: "cat /etc/shadow", Output: "permission denied", ExitCode: 1}},
		Shell:    "zsh", OS: "darwin/arm64",
	}

	var msgs []wire.Message
	f.Run(context.Background(), fc, func(m wire.Message) {
		msgs = append(msgs, m)
	})

	if len(msgs) == 0 {
		t.Fatal("expected messages, got none")
	}
	if msgs[0].Type != wire.TypeAIBannerStart {
		t.Errorf("msgs[0].Type = %q, want TypeAIBannerStart", msgs[0].Type)
	}
	var payload map[string]string
	json.Unmarshal(msgs[0].Data, &payload)
	if payload["icon"] != "permission" {
		t.Errorf("icon = %q, want %q", payload["icon"], "permission")
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestExplainFeature -v
```
Expected: FAIL — `ExplainFeature` undefined.

- [ ] **Step 3: Create explain.go**

```go
// core/session/features/explain.go
package features

import (
	"context"
	"encoding/json"
	"strings"

	"terminal/core/llm"
	"terminal/core/wire"
)

// ExplainFeature streams an error explanation banner when a command fails.
// The banner start payload includes an icon field derived from the error output.
type ExplainFeature struct{}

func (f *ExplainFeature) Trigger() Trigger { return TriggerCommandComplete }

func (f *ExplainFeature) ShouldRun(fc FeatureCtx) bool {
	return fc.Entry.ExitCode != 0
}

func (f *ExplainFeature) Run(ctx context.Context, fc FeatureCtx, send func(wire.Message)) {
	req := llm.SuggestRequest{
		Entries: fc.History,
		Cwd:     fc.Cwd,
		Shell:   fc.Shell,
		OS:      fc.OS,
	}
	icon := classifyErrorIcon(fc.Entry.Output)
	startData, _ := json.Marshal(map[string]string{"type": "error", "icon": icon})
	send(wire.Message{Type: wire.TypeAIBannerStart, Data: startData})

	done := false
	llm.ExplainStream(ctx, fc.Provider, req,
		func(token string) {
			data, _ := json.Marshal(token)
			send(wire.Message{Type: wire.TypeAIBannerToken, Data: data})
		},
		func(_ string) { done = true },
	)
	if !done {
		send(wire.Message{Type: wire.TypeAIBannerCancel})
	}
}

// classifyErrorIcon returns an icon key based on static pattern matching of error output.
func classifyErrorIcon(output string) string {
	lower := strings.ToLower(output)
	switch {
	case strings.Contains(lower, "permission denied") || strings.Contains(lower, "operation not permitted"):
		return "permission"
	case strings.Contains(lower, "command not found") || strings.Contains(lower, "no such file or directory"):
		return "not-found"
	case strings.Contains(lower, "syntaxerror") || strings.Contains(lower, "syntax error") || strings.Contains(lower, "parse error"):
		return "syntax"
	case strings.Contains(lower, "connection refused") || strings.Contains(lower, "econnrefused") ||
		strings.Contains(lower, "network") || strings.Contains(lower, "timed out") || strings.Contains(lower, "timeout"):
		return "network"
	default:
		return "generic"
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run "TestExplainFeature|TestClassifyErrorIcon" -v
```
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add core/session/features/explain.go core/session/features/explain_test.go
git commit -m "feat: add ExplainFeature with static icon classification"
```

---

## Task 9: SuggestFeature — 4 ranked suggestions

**Files:**
- Create: `core/session/features/suggest.go`
- Create: `core/session/features/suggest_test.go`

- [ ] **Step 1: Write failing tests**

```go
// core/session/features/suggest_test.go
package features

import (
	"context"
	"encoding/json"
	"testing"
	"terminal/core/llm"
	"terminal/core/wire"
)

func TestSuggestFeature_Trigger(t *testing.T) {
	f := &SuggestFeature{}
	if f.Trigger() != TriggerCommandComplete {
		t.Errorf("Trigger = %v, want TriggerCommandComplete", f.Trigger())
	}
}

func TestSuggestFeature_ShouldRun_Always(t *testing.T) {
	f := &SuggestFeature{}
	cases := []int{0, 1, 127}
	for _, code := range cases {
		fc := FeatureCtx{Entry: llm.HistoryEntry{ExitCode: code}}
		if !f.ShouldRun(fc) {
			t.Errorf("ShouldRun(exit=%d) = false, want true", code)
		}
	}
}

func TestSuggestFeature_Run_SendsMultiSuggestion(t *testing.T) {
	f := &SuggestFeature{}
	rawJSON := `[{"command":"npm run dev","label":"Start dev server","icon":"npm"},{"command":"git status","label":"Git status","icon":"git"},{"command":"ls","label":"List files","icon":"file"},{"command":"cat README.md","label":"Read readme","icon":"file"}]`
	provider := &mockProvider{tokens: []string{rawJSON}}
	fc := FeatureCtx{
		Provider: provider,
		Entry:    llm.HistoryEntry{Command: "npm install", ExitCode: 0},
		History:  []llm.HistoryEntry{{Command: "npm install", ExitCode: 0}},
		Shell:    "zsh", OS: "darwin/arm64", Cwd: "/tmp",
	}

	var msgs []wire.Message
	f.Run(context.Background(), fc, func(m wire.Message) {
		msgs = append(msgs, m)
	})

	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	if msgs[0].Type != wire.TypeAIMultiSuggestion {
		t.Errorf("msgs[0].Type = %q, want %q", msgs[0].Type, wire.TypeAIMultiSuggestion)
	}
	var suggestions []llm.Suggestion
	if err := json.Unmarshal(msgs[0].Data, &suggestions); err != nil {
		t.Fatalf("failed to unmarshal suggestions: %v", err)
	}
	if len(suggestions) != 4 {
		t.Errorf("len(suggestions) = %d, want 4", len(suggestions))
	}
}

func TestSuggestFeature_Run_SilentOnParseError(t *testing.T) {
	f := &SuggestFeature{}
	provider := &mockProvider{tokens: []string{"not json"}}
	fc := FeatureCtx{
		Provider: provider,
		Entry:    llm.HistoryEntry{Command: "ls", ExitCode: 0},
		Shell:    "zsh", OS: "darwin/arm64", Cwd: "/tmp",
	}

	var msgs []wire.Message
	f.Run(context.Background(), fc, func(m wire.Message) {
		msgs = append(msgs, m)
	})

	if len(msgs) != 0 {
		t.Errorf("expected 0 messages on parse error, got %d", len(msgs))
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestSuggestFeature -v
```
Expected: FAIL — `SuggestFeature` undefined.

- [ ] **Step 3: Create suggest.go**

```go
// core/session/features/suggest.go
package features

import (
	"context"
	"encoding/json"

	"terminal/core/llm"
	"terminal/core/wire"
)

// SuggestFeature returns 4 ranked command suggestions after every command completes.
// The best suggestion also serves as ghost text; the rest are rendered as pills.
type SuggestFeature struct{}

func (f *SuggestFeature) Trigger() Trigger { return TriggerCommandComplete }

func (f *SuggestFeature) ShouldRun(_ FeatureCtx) bool { return true }

func (f *SuggestFeature) Run(ctx context.Context, fc FeatureCtx, send func(wire.Message)) {
	req := llm.SuggestRequest{
		Entries:    fc.History,
		Cwd:        fc.Cwd,
		Shell:      fc.Shell,
		OS:         fc.OS,
		DirListing: fc.DirListing,
	}
	suggestions, err := llm.SuggestMultiple(ctx, fc.Provider, req)
	if err != nil || len(suggestions) == 0 {
		return
	}
	data, err := json.Marshal(suggestions)
	if err != nil {
		return
	}
	send(wire.Message{Type: wire.TypeAIMultiSuggestion, Data: data})
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestSuggestFeature -v
```
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add core/session/features/suggest.go core/session/features/suggest_test.go
git commit -m "feat: add SuggestFeature returning 4 ranked suggestions"
```

---

## Task 10: CommitMsgFeature — suggest commit message after git add

**Files:**
- Create: `core/session/features/commitmsg.go`
- Create: `core/session/features/commitmsg_test.go`

- [ ] **Step 1: Write failing tests**

```go
// core/session/features/commitmsg_test.go
package features

import (
	"testing"
	"terminal/core/llm"
)

func TestCommitMsgFeature_Trigger(t *testing.T) {
	f := &CommitMsgFeature{}
	if f.Trigger() != TriggerCommandComplete {
		t.Errorf("Trigger = %v, want TriggerCommandComplete", f.Trigger())
	}
}

func TestCommitMsgFeature_ShouldRun(t *testing.T) {
	f := &CommitMsgFeature{}
	cases := []struct {
		cmd      string
		exitCode int
		want     bool
	}{
		{"git add .", 0, true},
		{"git add -A", 0, true},
		{"git add src/main.go", 0, true},
		{"git add .", 1, false},   // failed add
		{"git commit", 0, false},  // not a git add
		{"git status", 0, false},
		{"npm install", 0, false},
	}
	for _, c := range cases {
		fc := FeatureCtx{Entry: llm.HistoryEntry{Command: c.cmd, ExitCode: c.exitCode}}
		got := f.ShouldRun(fc)
		if got != c.want {
			t.Errorf("ShouldRun(%q, exit=%d) = %v, want %v", c.cmd, c.exitCode, got, c.want)
		}
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestCommitMsgFeature -v
```
Expected: FAIL — `CommitMsgFeature` undefined.

- [ ] **Step 3: Create commitmsg.go**

```go
// core/session/features/commitmsg.go
package features

import (
	"context"
	"encoding/json"
	"os/exec"
	"strings"

	"terminal/core/llm"
	"terminal/core/wire"
)

// CommitMsgFeature triggers after `git add` and streams a suggested commit message.
type CommitMsgFeature struct{}

func (f *CommitMsgFeature) Trigger() Trigger { return TriggerCommandComplete }

func (f *CommitMsgFeature) ShouldRun(fc FeatureCtx) bool {
	if fc.Entry.ExitCode != 0 {
		return false
	}
	cmd := strings.TrimSpace(fc.Entry.Command)
	return cmd == "git add" || strings.HasPrefix(cmd, "git add ")
}

func (f *CommitMsgFeature) Run(ctx context.Context, fc FeatureCtx, send func(wire.Message)) {
	diff := stagedDiff(ctx, fc.Cwd)
	if diff == "" {
		return
	}
	msgs := llm.BuildCommitMsgMessages(diff)
	ch, err := fc.Provider.StreamMessages(ctx, msgs)
	if err != nil {
		return
	}
	started := false
	for chunk := range ch {
		if chunk.Token == "" {
			continue
		}
		if !started {
			startData, _ := json.Marshal(map[string]string{"type": "info", "icon": "git"})
			send(wire.Message{Type: wire.TypeAIBannerStart, Data: startData})
			started = true
		}
		data, _ := json.Marshal(chunk.Token)
		send(wire.Message{Type: wire.TypeAIBannerToken, Data: data})
	}
	if started && ctx.Err() != nil {
		send(wire.Message{Type: wire.TypeAIBannerCancel})
	}
}

// stagedDiff runs `git diff --staged --stat` and returns trimmed output, capped at 2000 bytes.
func stagedDiff(ctx context.Context, dir string) string {
	out, err := exec.CommandContext(ctx, "git", "-C", dir, "diff", "--staged", "--stat").Output()
	if err != nil {
		return ""
	}
	result := strings.TrimSpace(string(out))
	if len(result) > 2000 {
		result = result[:2000] + "…"
	}
	return result
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestCommitMsgFeature -v
```
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add core/session/features/commitmsg.go core/session/features/commitmsg_test.go
git commit -m "feat: add CommitMsgFeature suggesting commit messages after git add"
```

---

## Task 11: OnboardingFeature — project context on cd

**Files:**
- Create: `core/session/features/onboarding.go`
- Create: `core/session/features/onboarding_test.go`

- [ ] **Step 1: Write failing tests**

```go
// core/session/features/onboarding_test.go
package features

import (
	"context"
	"testing"
	"terminal/core/llm"
	"terminal/core/wire"
)

func TestOnboardingFeature_Trigger(t *testing.T) {
	f := &OnboardingFeature{}
	if f.Trigger() != TriggerCwdChange {
		t.Errorf("Trigger = %v, want TriggerCwdChange", f.Trigger())
	}
}

func TestOnboardingFeature_ShouldRun_RequiresProjectSignals(t *testing.T) {
	f := &OnboardingFeature{}
	cases := []struct {
		info  llm.ProjectInfo
		files map[string]string
		want  bool
	}{
		{llm.ProjectInfo{Git: "main|0|0|0"}, nil, true},
		{llm.ProjectInfo{}, map[string]string{"README.md": "# Hi"}, true},
		{llm.ProjectInfo{}, nil, false},
		{llm.ProjectInfo{}, map[string]string{}, false},
	}
	for _, c := range cases {
		fc := FeatureCtx{ProjectInfo: c.info, ProjectFiles: c.files}
		if got := f.ShouldRun(fc); got != c.want {
			t.Errorf("ShouldRun() = %v, want %v (info=%v, files=%v)", got, c.want, c.info, c.files)
		}
	}
}

func TestOnboardingFeature_Run_StreamsBanner(t *testing.T) {
	f := &OnboardingFeature{}
	provider := &mockProvider{tokens: []string{"You have uncommitted changes."}}
	fc := FeatureCtx{
		Provider:     provider,
		Cwd:          "/tmp/myproject",
		ProjectInfo:  llm.ProjectInfo{Git: "main|1|0|0"},
		ProjectFiles: map[string]string{"README.md": "# My Project"},
	}

	var msgs []wire.Message
	f.Run(context.Background(), fc, func(m wire.Message) {
		msgs = append(msgs, m)
	})

	if len(msgs) == 0 {
		t.Fatal("expected messages, got none")
	}
	if msgs[0].Type != wire.TypeAIBannerStart {
		t.Errorf("msgs[0].Type = %q, want TypeAIBannerStart", msgs[0].Type)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestOnboardingFeature -v
```
Expected: FAIL — `OnboardingFeature` undefined.

- [ ] **Step 3: Create onboarding.go**

```go
// core/session/features/onboarding.go
package features

import (
	"context"
	"encoding/json"

	"terminal/core/llm"
	"terminal/core/wire"
)

// OnboardingFeature streams a one-sentence project summary when the user cd's into a directory.
// It uses both structured project info and actual file contents for a richer result.
type OnboardingFeature struct{}

func (f *OnboardingFeature) Trigger() Trigger { return TriggerCwdChange }

func (f *OnboardingFeature) ShouldRun(fc FeatureCtx) bool {
	if fc.ProjectInfo.Git != "" || fc.ProjectInfo.Node != "" || fc.ProjectInfo.Go != "" ||
		fc.ProjectInfo.Python != "" || fc.ProjectInfo.Docker != "" || fc.ProjectInfo.K8s != "" {
		return true
	}
	return len(fc.ProjectFiles) > 0
}

func (f *OnboardingFeature) Run(ctx context.Context, fc FeatureCtx, send func(wire.Message)) {
	msgs := llm.BuildOnboardingMessages(fc.ProjectInfo, fc.ProjectFiles)
	ch, err := fc.Provider.StreamMessages(ctx, msgs)
	if err != nil {
		return
	}
	started := false
	for chunk := range ch {
		if chunk.Token == "" {
			continue
		}
		if !started {
			startData, _ := json.Marshal(map[string]string{"type": "info"})
			send(wire.Message{Type: wire.TypeAIBannerStart, Data: startData})
			started = true
		}
		data, _ := json.Marshal(chunk.Token)
		send(wire.Message{Type: wire.TypeAIBannerToken, Data: data})
	}
	if started && ctx.Err() != nil {
		send(wire.Message{Type: wire.TypeAIBannerCancel})
	}
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/ -run TestOnboardingFeature -v
```
Expected: PASS all tests.

- [ ] **Step 5: Commit**

```bash
git add core/session/features/onboarding.go core/session/features/onboarding_test.go
git commit -m "feat: add OnboardingFeature streaming project context on cd"
```

---

## Task 12: Registry

**Files:**
- Create: `core/session/features/registry.go`

- [ ] **Step 1: Create registry.go**

```go
// core/session/features/registry.go
package features

// Registered is the ordered list of AI features dispatched on each session event.
// Add new features here — no other file needs to change.
var Registered = []AIFeature{
	&SuggestFeature{},
	&ExplainFeature{},
	&AnomalyFeature{},
	&CommitMsgFeature{},
	&OnboardingFeature{},
	&GuardFeature{},
}
```

- [ ] **Step 2: Verify all features compile**

```bash
cd /Users/jawahar/Work/terminal/term/core && go build ./session/features/...
```
Expected: no output, exit 0.

- [ ] **Step 3: Run all feature tests**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./session/features/... -v
```
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add core/session/features/registry.go
git commit -m "feat: add AI feature registry"
```

---

## Task 13: Refactor detect.go — extract gatherDetectors

**Files:**
- Modify: `core/session/detect.go`

The current `detectEnv` method does two things: runs detectors + triggers AI banner. Split it so detect.go only handles detection. The AI dispatch moves to session.go in Task 14.

- [ ] **Step 1: Add `gatherDetectors` function and update `detectEnv`**

Replace the entire `detectEnv` method and `sendProjectContext` method with:

```go
// gatherDetectors runs all registered environment detectors concurrently for dir,
// sends each non-empty result to the frontend immediately, and returns the collected ProjectInfo.
func (s *Session) gatherDetectors(ctx context.Context, dir string) llm.ProjectInfo {
	type result struct {
		msgType string
		data    string
	}

	ch := make(chan result, len(detectors))
	var wg sync.WaitGroup
	for _, d := range detectors {
		d := d
		wg.Add(1)
		go func() {
			defer wg.Done()
			ch <- result{d.msgType, d.probe(ctx, dir)}
		}()
	}
	go func() {
		wg.Wait()
		close(ch)
	}()

	info := llm.ProjectInfo{Dir: dir}
	for r := range ch {
		if r.data != "" {
			s.w.Send(wire.StringMessage(r.msgType, r.data))
		}
		switch r.msgType {
		case wire.TypeGit:
			info.Git = r.data
		case wire.TypeNode:
			info.Node = r.data
		case wire.TypeGo:
			info.Go = r.data
		case wire.TypePython:
			info.Python = r.data
		case wire.TypeDocker:
			info.Docker = r.data
		case wire.TypeK8s:
			info.K8s = r.data
		}
	}
	return info
}
```

Delete the old `detectEnv` method and `sendProjectContext` method entirely.

- [ ] **Step 2: Verify it compiles (detect.go is now referenced from nowhere until session.go is updated)**

```bash
cd /Users/jawahar/Work/terminal/term/core && go build ./session/...
```
Expected: may show "declared but not used" for `gatherDetectors` — that's fine, it will be used in Task 14.

- [ ] **Step 3: Commit**

```bash
git add core/session/detect.go
git commit -m "refactor: extract gatherDetectors from detectEnv, remove sendProjectContext"
```

---

## Task 14: Refactor session.go — replace TypeAIAppend handler and OSC-7 dispatch

**Files:**
- Modify: `core/session/session.go`

This is the final wiring step. Replace the hardcoded AI logic with registry dispatch.

- [ ] **Step 1: Replace the TypeAIAppend case in Start()**

Find the `case wire.TypeAIAppend:` block (lines ~174–251) and replace it entirely:

```go
case wire.TypeAIAppend:
    if s.provider == nil {
        break
    }
    var entry llm.HistoryEntry
    if err := json.Unmarshal(msg.Data, &entry); err != nil {
        break
    }
    if len(entry.Output) > 600 {
        entry.Output = entry.Output[:600] + "…"
    }
    s.contextEntries = append(s.contextEntries, entry)
    if len(s.contextEntries) > maxContextEntries {
        s.contextEntries = s.contextEntries[len(s.contextEntries)-maxContextEntries:]
    }
    if s.cancelSuggest != nil {
        s.cancelSuggest()
    }
    ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
    s.cancelSuggest = cancel
    fc := s.buildFeatureCtx(entry)
    for _, f := range features.Registered {
        if f.Trigger() == features.TriggerCommandComplete && f.ShouldRun(fc) {
            f := f
            go func() { f.Run(ctx, fc, s.w.Send) }()
        }
    }
```

- [ ] **Step 2: Add detectAndDispatch method to session.go**

Add after the `Close` method:

```go
// detectAndDispatch runs environment detectors for dir, then dispatches all
// TriggerCwdChange features via the registry. It is the single OSC-7 handler.
func (s *Session) detectAndDispatch(ctx context.Context, dir string) {
    info := s.gatherDetectors(ctx, dir)
    if ctx.Err() != nil || s.provider == nil || dir == s.lastContextDir {
        return
    }
    s.lastContextDir = dir
    // Strip walk-up detections that don't belong to the current directory.
    if !existsAny(dir, []string{"package.json"}) {
        info.Node = ""
    }
    if !existsAny(dir, pythonMarkers) {
        info.Python = ""
    }
    fc := s.buildCwdFeatureCtx(dir, info)
    for _, f := range features.Registered {
        if f.Trigger() == features.TriggerCwdChange && f.ShouldRun(fc) {
            f := f
            go func() { f.Run(ctx, fc, s.w.Send) }()
        }
    }
}
```

- [ ] **Step 3: Replace the OSC 7 handler in pipe()**

Find the block inside `pipe()` that handles `strings.HasPrefix(p, "7;")` and replace the `go s.detectEnv(ctx, cwd)` line with `go s.detectAndDispatch(ctx, cwd)`:

```go
case strings.HasPrefix(p, "7;"):
    cwd := strings.TrimPrefix(p, "7;")
    s.currentCwd = cwd
    s.w.Send(wire.StringMessage(wire.TypeCwd, cwd))
    if s.cancelDetect != nil {
        s.cancelDetect()
    }
    ctx, cancel := newDetectContext()
    s.cancelDetect = cancel
    if !s.firstCwdSeen {
        s.firstCwdSeen = true
        s.lastContextDir = cwd
    }
    go s.detectAndDispatch(ctx, cwd)
```

- [ ] **Step 4: Add the features import to session.go**

In the import block, add:

```go
"terminal/core/session/features"
```

- [ ] **Step 5: Remove unused imports from session.go**

The `sync` import may now be unused (it was used for `wg.Wait` in the old inline goroutine). Remove it if the compiler flags it.

- [ ] **Step 6: Delete BuildProjectContextMessages from prompt.go**

The old `BuildProjectContextMessages` function in `llm/prompt.go` is now replaced by `BuildOnboardingMessages`. Delete it:

Find and delete the entire `BuildProjectContextMessages` function (approximately lines 233–313 in the original file).

- [ ] **Step 7: Build and run all tests**

```bash
cd /Users/jawahar/Work/terminal/term/core && go build ./... && go test ./... -v
```
Expected: all packages build, all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add core/session/session.go core/llm/prompt.go
git commit -m "refactor: replace inline AI logic in session.go with feature registry dispatch"
```

---

## Task 15: Final cleanup and verification

- [ ] **Step 1: Confirm no dead code remains**

```bash
cd /Users/jawahar/Work/terminal/term/core && go vet ./...
```
Expected: no output.

- [ ] **Step 2: Run full test suite**

```bash
cd /Users/jawahar/Work/terminal/term/core && go test ./... -count=1
```
Expected: all PASS.

- [ ] **Step 3: Confirm binary builds**

```bash
cd /Users/jawahar/Work/terminal/term/core && go build -o /dev/null .
```
Expected: exit 0.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: AI feature registry refactor complete"
```

---

## Adding a New AI Feature (reference)

1. Create `core/session/features/myfeature.go` implementing `AIFeature`
2. Add a test file `core/session/features/myfeature_test.go`
3. If a new prompt is needed, add `BuildMyFeatureMessages` to `core/llm/prompt.go`
4. Append `&MyFeature{}` to `Registered` in `core/session/features/registry.go`
5. Add any new wire type to `core/wire/types.go`

No other files need to change.
