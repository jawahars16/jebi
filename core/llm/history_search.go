package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const historySearchSystemPrompt = `Find previous shell commands that match the user's intent.

Match by the command's actual action, flags, arguments, paths, pipes, and redirects. Ignore superficial word or tool overlap.

Return up to 5 matching command indexes, best first.
Return only strong matches.
Output only a JSON array of integers, or [].`

// BuildHistorySearchMessages returns the message list for a history-search request.
func BuildHistorySearchMessages(query string, candidates []string) []ChatMessage {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Query: %s\n\nCommands:\n", query)
	for i, c := range candidates {
		fmt.Fprintf(&sb, "%d: %s\n", i, c)
	}
	return []ChatMessage{
		{Role: "system", Content: historySearchSystemPrompt},
		{Role: "user", Content: sb.String()},
	}
}

// SearchHistory asks the model which of the given candidate commands best
// match the natural-language query. The model returns 0-based indexes
// rather than reproducing command text — this uses fewer output tokens and
// avoids the model subtly altering quoting, spacing, or flags when asked to
// echo a command. Out-of-range indexes are dropped. Returns an empty
// (non-nil) slice, not an error, when nothing matches or the model's output
// can't be parsed as JSON.
func SearchHistory(ctx context.Context, provider Provider, query string, candidates []string) ([]string, error) {
	if len(candidates) == 0 {
		return []string{}, nil
	}

	ch, err := provider.StreamMessages(ctx, BuildHistorySearchMessages(query, candidates))
	if err != nil {
		return nil, err
	}
	var sb strings.Builder
	for chunk := range ch {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		sb.WriteString(chunk.Token)
	}

	raw := strings.TrimSpace(sb.String())
	raw = strings.TrimPrefix(raw, "```json\n")
	raw = strings.TrimPrefix(raw, "```\n")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}, nil
	}

	var indexes []int
	if err := json.Unmarshal([]byte(raw), &indexes); err != nil {
		return []string{}, nil // unparsable output — treat as no matches, not an error
	}

	matches := make([]string, 0, len(indexes))
	for _, idx := range indexes {
		if idx < 0 || idx >= len(candidates) {
			continue // out-of-range index — hallucinated or malformed, drop it
		}
		matches = append(matches, candidates[idx])
		if len(matches) >= 5 {
			break
		}
	}
	return matches, nil
}
