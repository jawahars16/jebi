package llm

import (
	"context"
	"strings"
)

// Suggest sends a suggestion request and returns a single command string.
// Returns ("", nil) when the model produces no useful suggestion.
func Suggest(ctx context.Context, provider Provider, req SuggestRequest) (string, error) {
	ch, err := provider.StreamMessages(ctx, BuildSuggestMessages(req))
	if err != nil {
		return "", err
	}
	var acc strings.Builder
	for chunk := range ch {
		acc.WriteString(chunk.Token)
	}
	return ParseSuggestResponse(acc.String()), nil
}
