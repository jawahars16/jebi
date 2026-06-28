package llm

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// GhostHistoryEntry mirrors the localStorage history entry shape the frontend sends.
type GhostHistoryEntry struct {
	C  string `json:"c"`
	Ok bool   `json:"ok"`
}

// GhostRequest carries everything the LLM needs to complete a command prefix.
type GhostRequest struct {
	Prefix         string
	History        []GhostHistoryEntry // recent commands from frontend localStorage (last 30)
	SessionContext []HistoryEntry      // current session commands from s.contextEntries
}

const ghostSystemPrompt = `You are a shell autocomplete engine for macOS zsh (Apple Silicon).

Given a command prefix and shell history, predict the single most likely complete command.

Rules:
- Return ONLY the complete command. No explanation. No markdown. No backticks.
- The returned command MUST begin with the exact prefix provided.
- Return NOT_A_COMMAND if you cannot make a confident prediction.`

// BuildGhostMessages returns the message list for a ghost text completion request.
func BuildGhostMessages(req GhostRequest) []ChatMessage {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Prefix: %s\n", req.Prefix)

	if len(req.SessionContext) > 0 {
		sb.WriteString("\nSession commands (most recent):\n")
		for _, e := range req.SessionContext {
			status := "exit 0"
			if e.ExitCode != 0 {
				status = fmt.Sprintf("exit %d", e.ExitCode)
			}
			fmt.Fprintf(&sb, "$ %s [%s]\n", e.Command, status)
		}
	}

	if len(req.History) > 0 {
		sb.WriteString("\nHistory:\n")
		start := 0
		if len(req.History) > 30 {
			start = len(req.History) - 30
		}
		for _, e := range req.History[start:] {
			sb.WriteString(e.C)
			sb.WriteString("\n")
		}
	}

	return []ChatMessage{
		{Role: "system", Content: ghostSystemPrompt},
		{Role: "user", Content: sb.String()},
	}
}

// GhostComplete predicts the most likely complete command for the given prefix.
// Returns an empty string (not an error) when the model returns NOT_A_COMMAND,
// outputs a completion that doesn't start with the prefix, or has nothing useful.
func GhostComplete(ctx context.Context, provider Provider, req GhostRequest) (string, error) {
	messages := BuildGhostMessages(req)
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

	raw := strings.TrimSpace(sb.String())
	if raw == "" {
		return "", errors.New("no completion returned")
	}

	// Strip markdown fences if the model wrapped the output.
	raw = strings.TrimPrefix(raw, "```bash\n")
	raw = strings.TrimPrefix(raw, "```sh\n")
	raw = strings.TrimPrefix(raw, "```zsh\n")
	raw = strings.TrimPrefix(raw, "```\n")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.Trim(raw, "`")
	raw = strings.TrimSpace(raw)

	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if line == "NOT_A_COMMAND" {
			return "", nil
		}
		// Discard hallucinated completions that ignore the prefix.
		if !strings.HasPrefix(line, req.Prefix) {
			return "", nil
		}
		return line, nil
	}
	return "", nil
}
