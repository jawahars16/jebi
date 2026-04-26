package llm

import "context"

// QueryRequest is the input for each natural language query.
type QueryRequest struct {
	Query string
	Cwd   string
	Shell string
	OS    string
}

// HistoryEntry is one command + its output, used to build suggestion context.
type HistoryEntry struct {
	Command  string `json:"command"`
	Output   string `json:"output"`
	ExitCode int    `json:"exitCode"`
}

// SuggestRequest is the input for the next-command suggestion feature.
type SuggestRequest struct {
	Entries    []HistoryEntry
	Cwd        string
	Shell      string
	OS         string
	DirListing []string // file/dir names in cwd, dirs suffixed with /
}

// ProjectInfo holds structured detector results for project context summarisation.
type ProjectInfo struct {
	Dir    string
	Git    string // "branch|dirty|ahead|behind"
	Node   string // "version|packageManager"
	Go     string // "version"
	Python string // "version|venv"
	Docker string // "compose" or "dockerfile"
	K8s    string // "context|namespace"
}

// Step is one action in a multi-step plan returned by the LLM.
type Step struct {
	Description string `json:"description"` // Human-readable label shown before the command runs
	Command     string `json:"command"`
	Safe        bool   `json:"safe"`
}

// ResponseChunk is one unit of a streaming response.
// During streaming, Token is set. In the final chunk, Done is true and
// Steps/Explanation are populated.
type ResponseChunk struct {
	Token       string // streaming token (partial JSON being built)
	Steps       []Step // final: ordered list of steps to execute
	Explanation string // final: one-sentence summary
	Done        bool
}

// Provider is the interface all LLM backends must satisfy.
// IsAvailable reports whether the provider can currently serve requests.
// main.go calls IsAvailable before selecting a provider at startup.
type Provider interface {
	IsAvailable() bool
	Name() string
	StreamQuery(ctx context.Context, req QueryRequest) (<-chan ResponseChunk, error)
	StreamMessages(ctx context.Context, messages []ChatMessage) (<-chan ResponseChunk, error)
}
