package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const historySearchSystemPrompt = `You are a shell history search assistant. Given a list of previously run
commands and a natural-language description of what the user is looking for,
identify which commands (if any) match the user's intent.

Rules:
- Only choose from the exact commands listed below. Do not invent, modify, or combine commands.
- Return up to 5 matches, most relevant first.
- Output ONLY a JSON array of strings, each exactly matching one of the listed commands. No markdown, no explanation.
- If nothing matches, output an empty JSON array: []`

// BuildHistorySearchMessages returns the message list for a history-search request.
func BuildHistorySearchMessages(query string, candidates []string) []ChatMessage {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Query: %s\n\nCommands:\n", query)
	for _, c := range candidates {
		sb.WriteString(c)
		sb.WriteString("\n")
	}
	return []ChatMessage{
		{Role: "system", Content: historySearchSystemPrompt},
		{Role: "user", Content: sb.String()},
	}
}

// SearchHistory asks the model which of the given candidate commands best
// match the natural-language query. Returns only strings that are exact
// members of candidates — any hallucinated text is dropped. Returns an
// empty (non-nil) slice, not an error, when nothing matches or the model's
// output can't be parsed as JSON.
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

	var parsed []string
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return []string{}, nil // unparsable output — treat as no matches, not an error
	}

	valid := make(map[string]bool, len(candidates))
	for _, c := range candidates {
		valid[c] = true
	}
	matches := make([]string, 0, len(parsed))
	for _, m := range parsed {
		if valid[m] {
			matches = append(matches, m)
		}
		if len(matches) >= 5 {
			break
		}
	}
	return matches, nil
}
