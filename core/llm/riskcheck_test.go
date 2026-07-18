package llm

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// fakeRiskProvider is a minimal Provider stub for testing RiskCheck without a
// real LLM backend. streamErr, if set, is returned from StreamMessages instead
// of a token channel.
type fakeRiskProvider struct {
	tokens    []string
	streamErr error
}

func (f *fakeRiskProvider) IsAvailable() bool { return true }
func (f *fakeRiskProvider) Name() string      { return "fake" }

func (f *fakeRiskProvider) StreamQuery(ctx context.Context, req QueryRequest) (<-chan ResponseChunk, error) {
	return nil, errors.New("not implemented")
}

func (f *fakeRiskProvider) StreamMessages(ctx context.Context, messages []ChatMessage) (<-chan ResponseChunk, error) {
	if f.streamErr != nil {
		return nil, f.streamErr
	}
	ch := make(chan ResponseChunk, len(f.tokens))
	for _, tok := range f.tokens {
		ch <- ResponseChunk{Token: tok}
	}
	close(ch)
	return ch, nil
}

func TestBuildRiskCheckMessagesIncludesCommandAndCwd(t *testing.T) {
	messages := BuildRiskCheckMessages("rm -rf /tmp/build", "/Users/me/project", "zsh", "darwin/arm64")
	if len(messages) != 2 {
		t.Fatalf("len(messages) = %d, want 2", len(messages))
	}
	system := messages[0].Content
	for _, want := range []string{"zsh", "darwin/arm64", "/Users/me/project"} {
		if !strings.Contains(system, want) {
			t.Errorf("system prompt missing %q, got: %s", want, system)
		}
	}
	if messages[1].Role != "user" || messages[1].Content != "rm -rf /tmp/build" {
		t.Errorf("user message = %+v, want role=user content=%q", messages[1], "rm -rf /tmp/build")
	}
}

func TestRiskCheckReturnsFirstLineOnly(t *testing.T) {
	provider := &fakeRiskProvider{tokens: []string{"This deletes everything.\nAlso some extra rambling."}}
	got, err := RiskCheck(context.Background(), provider, "rm -rf /", "/tmp", "zsh", "darwin/arm64")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "This deletes everything." {
		t.Errorf("got %q, want %q", got, "This deletes everything.")
	}
}

func TestRiskCheckTrimsQuotesAndBackticks(t *testing.T) {
	provider := &fakeRiskProvider{tokens: []string{"`This is bad`"}}
	got, err := RiskCheck(context.Background(), provider, "rm -rf /", "/tmp", "zsh", "darwin/arm64")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "This is bad" {
		t.Errorf("got %q, want %q", got, "This is bad")
	}
}

func TestRiskCheckPropagatesProviderError(t *testing.T) {
	wantErr := errors.New("provider unavailable")
	provider := &fakeRiskProvider{streamErr: wantErr}
	got, err := RiskCheck(context.Background(), provider, "rm -rf /", "/tmp", "zsh", "darwin/arm64")
	if !errors.Is(err, wantErr) {
		t.Errorf("err = %v, want %v", err, wantErr)
	}
	if got != "" {
		t.Errorf("got = %q, want empty string on error", got)
	}
}

func TestRiskCheckReturnsEmptyOnBlankResponse(t *testing.T) {
	provider := &fakeRiskProvider{tokens: []string{"   \n  "}}
	got, err := RiskCheck(context.Background(), provider, "rm -rf /", "/tmp", "zsh", "darwin/arm64")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "" {
		t.Errorf("got %q, want empty string", got)
	}
}

func TestRiskCheckRespectsContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel before any chunk is read
	provider := &fakeRiskProvider{tokens: []string{"This ", "should ", "not ", "appear."}}
	got, err := RiskCheck(ctx, provider, "rm -rf /", "/tmp", "zsh", "darwin/arm64")
	if err == nil {
		t.Fatal("expected error from cancelled context, got nil")
	}
	if got != "" {
		t.Errorf("expected empty result on cancellation, got %q", got)
	}
}
