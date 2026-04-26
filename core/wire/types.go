package wire

const (
	TypeInput    = "input"
	TypeOutput   = "output"
	TypeCwd      = "cwd"
	TypeExitCode = "exit_code"
	TypeGit      = "git"
	TypeNode     = "node"
	TypeGo       = "go"
	TypePython   = "python"
	TypeDocker   = "docker"
	TypeK8s      = "k8s"
	TypePrompt   = "prompt"
	TypeTui      = "tui"
	TypeConfig   = "config"
	TypeKill     = "kill"
	TypeResize   = "resize"

	TypeAIAppend       = "ai_append"
	TypeAISuggestion   = "ai_suggestion"
	TypeAISuggestError = "ai_suggest_error"
	TypeAIExplanation  = "ai_explanation"

	// TypeAIBannerStart begins a new streaming banner, clearing any previous one.
	// Payload: JSON {"type":"error"|"info"|"warning"|"suggestion"}
	TypeAIBannerStart = "ai_banner_start"
	// TypeAIBannerToken streams one token into the current banner.
	TypeAIBannerToken = "ai_banner_token"
	// TypeAIBannerCancel clears a partially-streamed banner (context cancelled mid-stream).
	TypeAIBannerCancel = "ai_banner_cancel"
)
