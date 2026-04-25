package llm

import (
	"context"
	"strings"
)

// Explain sends an error explanation request and returns a plain-text description.
// Returns ("", nil) when the model has nothing useful to say about the error.
func Explain(ctx context.Context, provider Provider, req SuggestRequest) (string, error) {
	ch, err := provider.StreamMessages(ctx, BuildExplainMessages(req))
	if err != nil {
		return "", err
	}
	var acc strings.Builder
	for chunk := range ch {
		acc.WriteString(chunk.Token)
	}
	return ParseExplainResponse(acc.String()), nil
}
