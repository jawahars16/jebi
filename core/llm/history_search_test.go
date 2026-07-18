package llm

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestBuildHistorySearchMessagesIncludesQueryAndCandidates(t *testing.T) {
	messages := BuildHistorySearchMessages("clean up docker", []string{"docker system prune -f", "git status"})
	if len(messages) != 2 {
		t.Fatalf("len(messages) = %d, want 2", len(messages))
	}
	if messages[0].Role != "system" {
		t.Errorf("messages[0].Role = %q, want system", messages[0].Role)
	}
	user := messages[1].Content
	for _, want := range []string{"clean up docker", "docker system prune -f", "git status"} {
		if !strings.Contains(user, want) {
			t.Errorf("user message missing %q, got: %s", want, user)
		}
	}
}

func TestSearchHistoryReturnsMultipleMatches(t *testing.T) {
	candidates := []string{"docker system prune -f", "git status", "npm run build"}
	provider := &fakeRiskProvider{tokens: []string{`["docker system prune -f", "npm run build"]`}}
	got, err := SearchHistory(context.Background(), provider, "clean up docker", candidates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := []string{"docker system prune -f", "npm run build"}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestSearchHistoryDropsHallucinatedMatches(t *testing.T) {
	candidates := []string{"docker system prune -f", "git status"}
	// "docker rm -f nonexistent" was never in candidates — must be dropped.
	provider := &fakeRiskProvider{tokens: []string{`["docker system prune -f", "docker rm -f nonexistent"]`}}
	got, err := SearchHistory(context.Background(), provider, "clean up docker", candidates)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 1 || got[0] != "docker system prune -f" {
		t.Errorf("got %v, want [\"docker system prune -f\"] (hallucinated entry dropped)", got)
	}
}

func TestSearchHistoryEmptyOnBlankResponse(t *testing.T) {
	provider := &fakeRiskProvider{tokens: []string{"   \n  "}}
	got, err := SearchHistory(context.Background(), provider, "anything", []string{"ls -la"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("got %v, want empty slice", got)
	}
}

func TestSearchHistoryEmptyOnUnparsableResponse(t *testing.T) {
	provider := &fakeRiskProvider{tokens: []string{"I cannot help with that."}}
	got, err := SearchHistory(context.Background(), provider, "anything", []string{"ls -la"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("got %v, want empty slice for unparsable JSON", got)
	}
}

func TestSearchHistoryPropagatesProviderError(t *testing.T) {
	wantErr := errors.New("provider unavailable")
	provider := &fakeRiskProvider{streamErr: wantErr}
	_, err := SearchHistory(context.Background(), provider, "anything", []string{"ls -la"})
	if !errors.Is(err, wantErr) {
		t.Errorf("err = %v, want %v", err, wantErr)
	}
}

func TestSearchHistoryRespectsContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	provider := &fakeRiskProvider{tokens: []string{`["ls -la"]`}}
	_, err := SearchHistory(ctx, provider, "anything", []string{"ls -la"})
	if err == nil {
		t.Fatal("expected error from cancelled context, got nil")
	}
}

func TestSearchHistoryNoCandidatesSkipsProviderCall(t *testing.T) {
	provider := &fakeRiskProvider{streamErr: errors.New("should not be called")}
	got, err := SearchHistory(context.Background(), provider, "anything", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("got %v, want empty slice", got)
	}
}
