# Plan: LLM Backend Integration (Go Core)

## Context

Add natural language → shell command translation to the Go backend. Frontend will send a `TypeAIQuery` message (triggered when user types `|` prefix); the backend routes it to a local LLM and streams the response back. No frontend UI changes in this phase — testable entirely via WebSocket (wscat).

**Runtime strategy:**
- If **ollama** is running locally (`localhost:11434`) and the configured model exists there → use it directly
- Otherwise → spawn the **bundled `llama-server`** binary with a user-downloaded `.gguf` model
- If neither is available → `aiProvider = nil` → `TypeAIQuery` returns `TypeAIError { "no model configured" }`

Both providers speak the same OpenAI-compatible `/v1/chat/completions` API, so streaming logic is shared.sub

---

## New Package: `core/ai/`

### `core/ai/provider.go` — interface + types

```go
package ai

import "context"

type QueryRequest struct {
    Query string
    Cwd   string
    Shell string
    OS    string
}

type ResponseChunk struct {
    Token       string // non-empty during streaming
    Command     string // set in final chunk
    Explanation string // set in final chunk
    Safe        bool   // set in final chunk
    Done        bool   // true in final chunk
}

type Provider interface {
    StreamQuery(ctx context.Context, req QueryRequest) (<-chan ResponseChunk, error)
    Name() string // "ollama" or "llama-server" — for logging/config reporting
}
```

---

### `core/ai/config.go` — config + persistence

```go
package ai

type Config struct {
    Provider    string `json:"provider"`    // "ollama" | "llama-server"
    Model       string `json:"model"`       // ollama: model name; llama-server: full .gguf path
    EndpointURL string `json:"endpointURL"` // ollama: "http://localhost:11434"; llama-server: set at runtime
    Enabled     bool   `json:"enabled"`
}

var DefaultConfig = Config{
    Provider:    "ollama",
    Model:       "llama3.2",
    EndpointURL: "http://localhost:11434",
    Enabled:     true,
}

// SettingsPath returns ~/.config/term/settings.json
func SettingsPath() string

// Load reads the ai block from settings.json; falls back to DefaultConfig on missing file
func Load() Config

// Save writes the ai block back to settings.json (merges with existing content)
func Save(cfg Config) error
```

---

### `core/ai/prompt.go` — system prompt + response parser

System prompt (injected as the `system` role message):
```
You are a shell command assistant.
Shell: {{Shell}}
OS: {{OS}}
Current directory: {{Cwd}}

Respond with exactly one line of JSON and nothing else:
{"command":"<shell command>","explanation":"<one sentence>","safe":true}

Set safe=false if the command is destructive (e.g. rm -rf, DROP TABLE, mkfs, kill -9 all processes).
Do not add markdown fences, preamble, or any text outside the JSON.
```

```go
func BuildMessages(req QueryRequest) []ChatMessage
// Returns: [{role:"system", content: <prompt>}, {role:"user", content: req.Query}]

func ParseFinalResponse(raw string) (ResponseChunk, error)
// 1. Try json.Unmarshal on full string
// 2. Fallback: extract first '{' to last '}', try again
// 3. Error if both fail
```

---

### `core/ai/openai.go` — shared streaming client

Both providers delegate here. Implements the OpenAI chat completions streaming protocol.

```go
type streamClient struct {
    endpointURL string
    model       string
    httpClient  *http.Client // connect timeout 5s, read timeout 0 (streaming)
}

func newStreamClient(endpointURL, model string) *streamClient

// stream POSTs to {endpointURL}/v1/chat/completions with stream:true.
// Reads NDJSON (data: {...}\n lines), sends ResponseChunk per token.
// On stream end: calls ParseFinalResponse on accumulated text, sends Done chunk, closes ch.
// Respects ctx cancellation — stops reading, closes ch cleanly.
func (c *streamClient) stream(ctx context.Context, messages []ChatMessage) (<-chan ResponseChunk, error)
```

NDJSON parsing: each line is `data: <json>` or `data: [DONE]`. Extract `choices[0].delta.content` from each line.

---

### `core/ai/ollama.go` — OllamaProvider

```go
type OllamaProvider struct {
    client *streamClient
    model  string
}

func NewOllamaProvider(cfg Config) *OllamaProvider

// IsAvailable pings GET {endpointURL}/api/tags and checks if cfg.Model is in the list.
// Returns false (not an error) if ollama is not running or model not found.
func (p *OllamaProvider) IsAvailable() bool

func (p *OllamaProvider) Name() string { return "ollama" }
func (p *OllamaProvider) StreamQuery(ctx context.Context, req QueryRequest) (<-chan ResponseChunk, error)
```

Note: ollama's `/v1/chat/completions` is OpenAI-compatible, so `streamClient.stream()` works unchanged.

---

### `core/ai/llamaserver.go` — LlamaServerProvider

Manages the `llama-server` subprocess.

```go
type LlamaServerProvider struct {
    modelPath  string
    binaryPath string // resolved at construction time
    port       int
    cmd        *exec.Cmd
    client     *streamClient
    mu         sync.Mutex
}

func NewLlamaServerProvider(cfg Config) (*LlamaServerProvider, error)
// Resolves binary path (dev: ../llama-server, prod: filepath.Join(resourcesPath(), "llama-server"))
// Does NOT start the server yet — lazy start on first StreamQuery

func (p *LlamaServerProvider) start() error
// Picks a free port (net.Listen("tcp", ":0"))
// Spawns: llama-server --model <path> --port <port> --ctx-size 2048 --n-predict 256
// Polls GET http://127.0.0.1:{port}/health every 200ms, up to 30s timeout

func (p *LlamaServerProvider) Stop()
// Sends SIGTERM to subprocess, waits up to 5s, then SIGKILL

func (p *LlamaServerProvider) Name() string { return "llama-server" }
func (p *LlamaServerProvider) StreamQuery(ctx context.Context, req QueryRequest) (<-chan ResponseChunk, error)
// Calls start() if not yet started (lazy), then delegates to streamClient.stream()
```

Binary resolution helper:
```go
func resourcesPath() string
// In dev (go run / go build in core/): returns filepath.Dir(os.Executable()) + "/../"
// In prod (Electron packaged): reads RESOURCES_PATH env var set by Electron main process
```

---

### `core/ai/resolve.go` — provider selection at startup

```go
// Resolve returns the best available provider based on config and runtime availability.
// Returns nil if no provider is available (AI disabled).
func Resolve(cfg Config) Provider {
    if !cfg.Enabled {
        return nil
    }
    switch cfg.Provider {
    case "ollama":
        p := NewOllamaProvider(cfg)
        if p.IsAvailable() {
            return p
        }
        return nil
    case "llama-server":
        p, err := NewLlamaServerProvider(cfg)
        if err != nil {
            log.Printf("ai: llama-server unavailable: %v", err)
            return nil
        }
        return p
    }
    return nil
}
```

---

## Modified: `core/wire/types.go`

Add 5 constants:
```go
TypeAIQuery    = "ai_query"    // frontend → Go: { "id": string, "query": string, "cwd": string }
TypeAIStream   = "ai_stream"   // Go → frontend: { "id": string, "token": string }
TypeAIResponse = "ai_response" // Go → frontend: { "id": string, "command": string, "explanation": string, "safe": bool }
TypeAIError    = "ai_error"    // Go → frontend: { "id": string, "error": string }
TypeAICancel   = "ai_cancel"   // frontend → Go: { "id": string }
```

---

## Modified: `core/session/session.go`

**New fields on `Session`:**
```go
aiProvider  ai.Provider
aiCancelMap map[string]context.CancelFunc
aiMu        sync.Mutex
```

**In `New()`:**
```go
cfg := ai.Load()
s.aiProvider = ai.Resolve(cfg)
s.aiCancelMap = make(map[string]context.CancelFunc)
```

**In `Start()` message loop — two new cases:**

`TypeAIQuery`:
```go
var payload struct {
    ID    string `json:"id"`
    Query string `json:"query"`
    Cwd   string `json:"cwd"`
}
json.Unmarshal(msg.Data, &payload)
ctx, cancel := context.WithCancel(context.Background())
s.aiMu.Lock()
s.aiCancelMap[payload.ID] = cancel
s.aiMu.Unlock()
go s.handleAIQuery(ctx, payload.ID, ai.QueryRequest{
    Query: payload.Query,
    Cwd:   payload.Cwd,
    Shell: s.cfg.Shell,
    OS:    runtime.GOOS + " " + runtime.GOARCH,
})
```

`TypeAICancel`:
```go
var payload struct{ ID string `json:"id"` }
json.Unmarshal(msg.Data, &payload)
s.aiMu.Lock()
if cancel, ok := s.aiCancelMap[payload.ID]; ok {
    cancel()
    delete(s.aiCancelMap, payload.ID)
}
s.aiMu.Unlock()
```

**New `handleAIQuery` method:**
```go
func (s *Session) handleAIQuery(ctx context.Context, id string, req ai.QueryRequest) {
    defer func() {
        s.aiMu.Lock()
        delete(s.aiCancelMap, id)
        s.aiMu.Unlock()
    }()

    if s.aiProvider == nil {
        s.w.Send(wire.StringMessage(wire.TypeAIError, marshal({id, "no model configured"})))
        return
    }

    ch, err := s.aiProvider.StreamQuery(ctx, req)
    if err != nil {
        s.w.Send(wire.StringMessage(wire.TypeAIError, marshal({id, err.Error()})))
        return
    }

    for chunk := range ch {
        if chunk.Done {
            s.w.Send(TypeAIResponse, {id, chunk.Command, chunk.Explanation, chunk.Safe})
        } else {
            s.w.Send(TypeAIStream, {id, chunk.Token})
        }
    }
}
```

---

## File Summary

### New files
| File | Purpose |
|---|---|
| `core/ai/provider.go` | Interface + QueryRequest + ResponseChunk types |
| `core/ai/config.go` | Config struct, Load(), Save(), SettingsPath() |
| `core/ai/prompt.go` | BuildMessages(), ParseFinalResponse() |
| `core/ai/openai.go` | Shared OpenAI-compatible streaming HTTP client |
| `core/ai/ollama.go` | OllamaProvider + IsAvailable() |
| `core/ai/llamaserver.go` | LlamaServerProvider + subprocess lifecycle |
| `core/ai/resolve.go` | Resolve() — picks provider at startup |

### Modified files
| File | Change |
|---|---|
| `core/wire/types.go` | +5 TypeAI* constants |
| `core/session/session.go` | aiProvider + aiCancelMap fields, TypeAIQuery/TypeAICancel handlers, handleAIQuery() |

---

## Verification (via wscat — no UI needed)

```bash
# Start Go core
cd core && go build -o term-core . && ./term-core

# In another terminal
wscat -c ws://localhost:7070

# Send an AI query
{"type":"ai_query","data":{"id":"test-1","query":"show all running docker containers","cwd":"/tmp"}}

# Expected: stream of ai_stream messages, then ai_response
{"type":"ai_stream","data":{"id":"test-1","token":"{\""}}
...
{"type":"ai_response","data":{"id":"test-1","command":"docker ps","explanation":"Lists all running containers.","safe":true}}

# Cancel mid-stream
{"type":"ai_cancel","data":{"id":"test-1"}}

# With no model configured (Enabled: false in settings.json)
{"type":"ai_query","data":{"id":"test-2","query":"anything","cwd":"/"}}
# Expected:
{"type":"ai_error","data":{"id":"test-2","error":"no model configured"}}
```
