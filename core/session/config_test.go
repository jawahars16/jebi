package session

import "testing"

func TestBuildShellHookIncludesGit(t *testing.T) {
	cfg := Config{
		Shell:          "",
		PromptSegments: []string{"cwd", "git"},
	}
	hook := buildShellHook(cfg, "/bin/zsh")

	if !contains(hook, "9002") {
		t.Errorf("expected hook to contain OSC 9002 git emission, got:\n%s", hook)
	}
	if !contains(hook, "symbolic-ref") {
		t.Errorf("expected hook to contain git branch detection, got:\n%s", hook)
	}
}

func TestBuildShellHookOmitsGitWhenNotConfigured(t *testing.T) {
	cfg := Config{
		Shell:          "",
		PromptSegments: []string{"cwd"},
	}
	hook := buildShellHook(cfg, "/bin/zsh")

	if contains(hook, "9002") {
		t.Errorf("expected hook to NOT contain OSC 9002 when git not in segments, got:\n%s", hook)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsHelper(s, sub))
}

func containsHelper(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
