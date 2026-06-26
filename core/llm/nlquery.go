package llm

import (
	"context"
	"errors"
	"strings"
)

// NLQuery translates a natural-language query into a shell command.
// Uses a dedicated plain-text prompt — the model outputs commands directly,
// one per line, without JSON wrapping.
func NLQuery(ctx context.Context, provider Provider, query, cwd, shell, os string) (string, error) {
	req := QueryRequest{
		Query: query,
		Cwd:   cwd,
		Shell: shell,
		OS:    os,
	}
	messages := BuildNLMessages(req)
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
		return "", errors.New("no command returned")
	}

	// Strip markdown code fences if the model wrapped the output.
	raw = strings.TrimPrefix(raw, "```bash\n")
	raw = strings.TrimPrefix(raw, "```sh\n")
	raw = strings.TrimPrefix(raw, "```zsh\n")
	raw = strings.TrimPrefix(raw, "```\n")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.Trim(raw, "`")
	raw = strings.TrimSpace(raw)

	// Return the first non-empty, non-comment line.
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if line == "NOT_A_COMMAND" {
			return "", errors.New("not_a_command")
		}
		return line, nil
	}

	return "", errors.New("no command returned")
}
