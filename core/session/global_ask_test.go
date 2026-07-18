package session

import (
	"strings"
	"testing"

	"terminal/core/llm"
)

func sessionWith(id, cwd string, entries []llm.HistoryEntry) *Session {
	s := &Session{id: id, currentCwd: cwd}
	s.contextEntries = entries
	return s
}

func TestBuildGlobalAskMessagesOrdersActiveFirst(t *testing.T) {
	s1 := sessionWith("s1", "/tmp/one", nil)
	s2 := sessionWith("s2", "/tmp/two", nil)
	infoByID := map[string]globalSessionInfo{
		"s1": {ID: "s1", Title: "Tab 1", Active: false},
		"s2": {ID: "s2", Title: "Tab 2", Active: true},
	}

	messages := buildGlobalAskMessages([]*Session{s1, s2}, infoByID, nil, "what's running?")

	system := messages[0].Content
	idx1 := strings.Index(system, "Tab 1")
	idx2 := strings.Index(system, "Tab 2")
	if idx1 == -1 || idx2 == -1 {
		t.Fatalf("expected both tab titles in system prompt, got: %s", system)
	}
	if idx2 > idx1 {
		t.Errorf("expected active session (Tab 2) to appear before Tab 1, system prompt: %s", system)
	}
	if !strings.Contains(system, "(ACTIVE)") {
		t.Errorf("expected active session marker (ACTIVE) in system prompt")
	}
}

func TestBuildGlobalAskMessagesSkipsSessionsNotInFrontendMap(t *testing.T) {
	stale := sessionWith("stale", "/tmp/stale", nil)
	known := sessionWith("known", "/tmp/known", nil)
	infoByID := map[string]globalSessionInfo{
		"known": {ID: "known", Title: "Tab 1", Active: true},
	}

	messages := buildGlobalAskMessages([]*Session{stale, known}, infoByID, nil, "hi")

	system := messages[0].Content
	if strings.Contains(system, "/tmp/stale") {
		t.Errorf("stale session (not in frontend map) leaked into system prompt: %s", system)
	}
	if !strings.Contains(system, "/tmp/known") {
		t.Errorf("known session missing from system prompt: %s", system)
	}
}

func TestBuildGlobalAskMessagesStatesReadOnlyScope(t *testing.T) {
	messages := buildGlobalAskMessages(nil, nil, nil, "hi")
	system := messages[0].Content
	if !strings.Contains(system, "cannot read or write file") {
		t.Errorf("expected explicit read-only/no-file-access statement in system prompt, got: %s", system)
	}
}

func TestBuildGlobalAskMessagesAppendsHistoryAndQuery(t *testing.T) {
	history := []llm.ChatMessage{{Role: "user", Content: "earlier question"}, {Role: "assistant", Content: "earlier answer"}}
	messages := buildGlobalAskMessages(nil, nil, history, "final question")

	if len(messages) != 4 { // system + 2 history + query
		t.Fatalf("len(messages) = %d, want 4", len(messages))
	}
	last := messages[len(messages)-1]
	if last.Role != "user" || last.Content != "final question" {
		t.Errorf("last message = %+v, want user/final question", last)
	}
}

func TestSuggestGlobalPromptsFailedCommandFirst(t *testing.T) {
	active := sessionWith("s1", "/tmp/proj", []llm.HistoryEntry{
		{Command: "npm test", ExitCode: 1, Output: "2 failing"},
	})
	infoByID := map[string]globalSessionInfo{"s1": {ID: "s1", Title: "Tab 1", Active: true}}

	prompts := suggestGlobalPrompts([]*Session{active}, infoByID, "s1")

	if len(prompts) != 3 {
		t.Fatalf("len(prompts) = %d, want 3", len(prompts))
	}
	if !strings.Contains(prompts[0], "npm test") {
		t.Errorf("prompts[0] = %q, want it to reference the failed command", prompts[0])
	}
}

func TestSuggestGlobalPromptsMultiSessionSummary(t *testing.T) {
	s1 := sessionWith("s1", "/tmp/one", []llm.HistoryEntry{{Command: "ls", ExitCode: 0}})
	s2 := sessionWith("s2", "/tmp/two", []llm.HistoryEntry{{Command: "pwd", ExitCode: 0}})
	infoByID := map[string]globalSessionInfo{
		"s1": {ID: "s1", Title: "Tab 1", Active: true},
		"s2": {ID: "s2", Title: "Tab 2", Active: false},
	}

	prompts := suggestGlobalPrompts([]*Session{s1, s2}, infoByID, "s1")

	found := false
	for _, p := range prompts {
		if strings.Contains(strings.ToLower(p), "each") {
			found = true
		}
	}
	if !found {
		t.Errorf("expected a multi-session summary prompt among %v", prompts)
	}
}

func TestSuggestGlobalPromptsFallsBackWhenNoHistory(t *testing.T) {
	empty := sessionWith("s1", "/tmp/proj", nil)
	infoByID := map[string]globalSessionInfo{"s1": {ID: "s1", Title: "Tab 1", Active: true}}

	prompts := suggestGlobalPrompts([]*Session{empty}, infoByID, "s1")

	if len(prompts) != 3 {
		t.Fatalf("len(prompts) = %d, want 3", len(prompts))
	}
	for _, p := range prompts {
		if strings.TrimSpace(p) == "" {
			t.Errorf("got empty fallback prompt among %v", prompts)
		}
	}
}
