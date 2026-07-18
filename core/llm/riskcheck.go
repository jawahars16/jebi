package llm

import (
	"context"
	"strings"
)

// RiskCheck asks the model for one short sentence describing the concrete
// consequence of running the given command in the given directory.
// Returns ("", nil) if the provider produced no usable text — callers treat
// that the same as an error (fall back silently to the static message).
func RiskCheck(ctx context.Context, provider Provider, command, cwd, shell, os string) (string, error) {
	ch, err := provider.StreamMessages(ctx, BuildRiskCheckMessages(command, cwd, shell, os))
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	for chunk := range ch {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		sb.WriteString(chunk.Token)
	}
	raw := strings.TrimSpace(sb.String())
	raw = strings.Trim(raw, "`\"")
	if i := strings.IndexByte(raw, '\n'); i >= 0 {
		raw = strings.TrimSpace(raw[:i]) // first line only — guard against rambling
	}
	return raw, nil
}
