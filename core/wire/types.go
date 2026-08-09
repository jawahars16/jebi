package wire

const (
	TypeInput    = "input"
	TypeRawInput = "raw_input"
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

	TypeRust     = "rust"
	TypePhp      = "php"
	TypeJava     = "java"
	TypeKotlin   = "kotlin"
	TypeHaskell  = "haskell"
	TypeC        = "c"
	TypeConda    = "conda"

	TypeAIAppend       = "ai_append"
	TypeAISummary      = "ai_summary"
	TypeAIStatus       = "ai_status"
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

	// TypeAsk is sent frontend → backend: JSON {"history":[…ChatMessage],"query":"…"}
	// TypeSessionID is sent backend → frontend immediately on connect (new or resumed).
	// Payload: JSON string — the session ID the frontend must pass on reconnect.
	TypeSessionID = "session_id"

	TypeAsk = "ask"
	// TypeAskChunk is streamed backend → frontend: one token string.
	TypeAskChunk = "ask_chunk"
	// TypeAskDone signals stream complete, no payload.
	TypeAskDone = "ask_done"
	// TypeAskError signals a streaming failure: error string payload.
	TypeAskError = "ask_error"

	// TypeAIAnalyze is sent frontend → backend: JSON {"command":"…","output":"…","exitCode":N,"cwd":"…"}
	TypeAIAnalyze = "ai_analyze"
	// TypeAIAnalysis is sent backend → frontend: JSON AnalysisResult object.
	TypeAIAnalysis = "ai_analysis"

	// TypeAIRiskCheck is sent frontend → backend: JSON {"command":"…","cwd":"…","requestId":N}
	TypeAIRiskCheck = "ai_risk_check"
	// TypeAIRiskExplanation is sent backend → frontend: JSON {"requestId":N,"explanation":"…"}
	TypeAIRiskExplanation = "ai_risk_explanation"

	// TypeSummarize is sent frontend → backend to request a session summary.
	TypeSummarize = "summarize"

	TypeNLQuery  = "nl_query"   // frontend → backend: JSON {"query": string, "cwd": string}
	TypeNLResult = "nl_result"  // backend → frontend: JSON {"command": string}
	TypeNLError  = "nl_error"   // backend → frontend: plain string error message

	TypeGhostQuery  = "ghost_query"  // frontend → backend: JSON {"prefix": string, "history": [{c,ok}]}
	TypeGhostResult = "ghost_result" // backend → frontend: JSON {"suggestion": string}

	// TypeAskGlobal is sent frontend → backend on the /global socket: JSON
	// {"history":[...ChatMessage],"query":"...","sessions":[{"id","title","active"}]}
	TypeAskGlobal = "ask_global"

	// TypeAskSuggest is sent frontend → backend on the /global socket when the
	// drawer opens with an empty conversation: same "sessions" payload, no query.
	TypeAskSuggest = "ask_suggest"
	// TypeAskSuggestResult is sent backend → frontend: JSON array of exactly 3 strings.
	TypeAskSuggestResult = "ask_suggest_result"

	// TypeHistorySearch is sent frontend → backend on the /global socket: JSON
	// {"query": "...", "candidates": ["cmd1", "cmd2", ...]}
	TypeHistorySearch = "history_search"
	// TypeHistorySearchResult is sent backend → frontend: JSON {"matches": ["cmd2", "cmd7"]}
	TypeHistorySearchResult = "history_search_result"

	// TypeSessionDead is sent backend → frontend right before the connection
	// closes for good: the session crashed and its shell is gone. The
	// frontend must not silently reconnect — it should surface an error and
	// let the user explicitly start a new shell for that tab.
	TypeSessionDead = "session_dead"
)
