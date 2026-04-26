package llm

import (
	"context"
	"strings"
)

// ExplainStream streams explanation tokens via onToken, then calls onDone with the full text.
// Calls neither if the context is cancelled before completion.
func ExplainStream(ctx context.Context, provider Provider, req SuggestRequest, onToken func(string), onDone func(string)) error {
	ch, err := provider.StreamMessages(ctx, BuildExplainMessages(req))
	if err != nil {
		return err
	}
	var acc strings.Builder
	for chunk := range ch {
		if ctx.Err() != nil {
			return nil
		}
		acc.WriteString(chunk.Token)
		onToken(chunk.Token)
	}
	if ctx.Err() != nil {
		return nil
	}
	onDone(strings.TrimSpace(acc.String()))
	return nil
}
