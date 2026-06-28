package llm

import (
	"strings"
	"testing"
)

func TestBuildGhostMessages_containsPrefix(t *testing.T) {
	req := GhostRequest{
		Prefix: "git c",
		History: []GhostHistoryEntry{
			{C: "git commit -m \"fix: typo\"", Ok: true},
			{C: "git checkout main", Ok: true},
		},
		SessionContext: []HistoryEntry{
			{Command: "git add .", ExitCode: 0},
		},
	}
	msgs := BuildGhostMessages(req)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Role != "system" {
		t.Errorf("first message should be system, got %q", msgs[0].Role)
	}
	if msgs[1].Role != "user" {
		t.Errorf("second message should be user, got %q", msgs[1].Role)
	}
	userContent := msgs[1].Content
	if !strings.Contains(userContent, "git c") {
		t.Errorf("user message missing prefix, got: %s", userContent)
	}
	if !strings.Contains(userContent, "git commit") {
		t.Errorf("user message missing history entry, got: %s", userContent)
	}
	if !strings.Contains(userContent, "git add .") {
		t.Errorf("user message missing session context, got: %s", userContent)
	}
}

func TestBuildGhostMessages_emptyHistory(t *testing.T) {
	req := GhostRequest{Prefix: "docker "}
	msgs := BuildGhostMessages(req)
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if !strings.Contains(msgs[1].Content, "docker ") {
		t.Errorf("user message missing prefix")
	}
}

func TestBuildGhostMessages_historyTruncatedTo30(t *testing.T) {
	history := make([]GhostHistoryEntry, 40)
	for i := range history {
		history[i] = GhostHistoryEntry{C: "ls", Ok: true}
	}
	history[0].C = "very-old-command"
	history[39].C = "recent-command"
	req := GhostRequest{Prefix: "ls", History: history}
	msgs := BuildGhostMessages(req)
	userContent := msgs[1].Content
	if strings.Contains(userContent, "very-old-command") {
		t.Error("truncated history should exclude very old entries")
	}
	if !strings.Contains(userContent, "recent-command") {
		t.Error("truncated history should include recent entries")
	}
}
