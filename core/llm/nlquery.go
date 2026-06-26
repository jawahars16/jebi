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
	// Model signalled the input isn't a shell command request
	if result.Explanation == "not_a_command" || len(result.Steps) == 0 {
		return "", errors.New("not_a_command")
	}
	// Take first non-empty step command
	for _, step := range result.Steps {
		if strings.TrimSpace(step.Command) != "" {
			return step.Command, nil
		}
	}
	return "", errors.New("no command returned")
}
