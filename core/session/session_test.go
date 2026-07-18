package session

import (
	"strings"
	"testing"

	"terminal/core/llm"
)

// TestParseOSCGitPayload verifies parseOSC extracts the OSC 9002 git payload.
func TestParseOSCGitPayload(t *testing.T) {
	// OSC 9002;main|1|2|0 ST (ST = ESC \)
	input := []byte("\x1b]9002;main|1|2|0\x1b\\some output")
	cleaned, payloads, leftover := parseOSC(input)

	if string(cleaned) != "some output" {
		t.Errorf("cleaned = %q, want %q", string(cleaned), "some output")
	}
	if len(payloads) != 1 {
		t.Fatalf("len(payloads) = %d, want 1", len(payloads))
	}
	if payloads[0] != "9002;main|1|2|0" {
		t.Errorf("payloads[0] = %q, want %q", payloads[0], "9002;main|1|2|0")
	}
	if leftover != nil {
		t.Errorf("leftover = %q, want nil", string(leftover))
	}
}

// TestParseOSCGitAndCwdTogether verifies both OSC 7 (cwd) and 9002 (git) are extracted.
func TestParseOSCGitAndCwdTogether(t *testing.T) {
	input := []byte("\x1b]7;/home/user\x1b\\\x1b]9002;main|0|0|0\x1b\\$ ")
	_, payloads, _ := parseOSC(input)

	if len(payloads) != 2 {
		t.Fatalf("len(payloads) = %d, want 2", len(payloads))
	}
	if payloads[0] != "7;/home/user" {
		t.Errorf("payloads[0] = %q, want %q", payloads[0], "7;/home/user")
	}
	if payloads[1] != "9002;main|0|0|0" {
		t.Errorf("payloads[1] = %q, want %q", payloads[1], "9002;main|0|0|0")
	}
}

// TestGitPayloadPrefix verifies the expected prefix used for routing in pipe().
func TestGitPayloadPrefix(t *testing.T) {
	payload := "9002;main|1|2|0"
	if !hasPrefix(payload, "9002;") {
		t.Errorf("git payload %q should have prefix 9002;", payload)
	}
	trimmed := trimPrefix(payload, "9002;")
	if trimmed != "main|1|2|0" {
		t.Errorf("trimmed = %q, want %q", trimmed, "main|1|2|0")
	}
}

// TestParseOSCNodePayload verifies parseOSC extracts the OSC 9003 node payload.
func TestParseOSCNodePayload(t *testing.T) {
	input := []byte("\x1b]9003;v20.11.0|npm\x1b\\some output")
	cleaned, payloads, leftover := parseOSC(input)

	if string(cleaned) != "some output" {
		t.Errorf("cleaned = %q, want %q", string(cleaned), "some output")
	}
	if len(payloads) != 1 {
		t.Fatalf("len(payloads) = %d, want 1", len(payloads))
	}
	if payloads[0] != "9003;v20.11.0|npm" {
		t.Errorf("payloads[0] = %q, want %q", payloads[0], "9003;v20.11.0|npm")
	}
	if leftover != nil {
		t.Errorf("leftover = %q, want nil", string(leftover))
	}
}

func TestSplitCompleteUTF8BuffersTrailingPartialRune(t *testing.T) {
	full := []byte("hello ─")
	first := full[:len(full)-1]
	second := full[len(full)-1:]

	complete, leftover := splitCompleteUTF8(first)
	if string(complete) != "hello " {
		t.Fatalf("complete = %q, want %q", string(complete), "hello ")
	}
	if string(append(leftover, second...)) != "─" {
		t.Fatalf("leftover + second = %q, want %q", string(append(leftover, second...)), "─")
	}

	complete, leftover = splitCompleteUTF8(append(leftover, second...))
	if string(complete) != "─" {
		t.Fatalf("complete = %q, want %q", string(complete), "─")
	}
	if len(leftover) != 0 {
		t.Fatalf("leftover = %q, want empty", string(leftover))
	}
}

func TestGitChangeCounts(t *testing.T) {
	status := strings.Join([]string{
		"M  staged.go",
		" M modified.go",
		"AM staged-and-modified.go",
		"?? new.go",
	}, "\n")

	staged, modified, untracked := gitChangeCounts(status)
	if staged != 2 || modified != 2 || untracked != 1 {
		t.Fatalf("counts = staged:%d modified:%d untracked:%d, want staged:2 modified:2 untracked:1", staged, modified, untracked)
	}
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

func trimPrefix(s, prefix string) string {
	if hasPrefix(s, prefix) {
		return s[len(prefix):]
	}
	return s
}

// TestSessionSnapshotCopiesEntries verifies snapshot() returns a race-free
// copy of session state that isn't affected by later mutations.
func TestSessionSnapshotCopiesEntries(t *testing.T) {
	s := &Session{id: "abc123", currentCwd: "/tmp/proj"}
	s.contextEntries = []llm.HistoryEntry{{Command: "go test ./...", ExitCode: 1}}

	snap := s.snapshot()

	if snap.id != "abc123" {
		t.Errorf("id = %q, want %q", snap.id, "abc123")
	}
	if snap.cwd != "/tmp/proj" {
		t.Errorf("cwd = %q, want %q", snap.cwd, "/tmp/proj")
	}
	if len(snap.contextEntries) != 1 || snap.contextEntries[0].Command != "go test ./..." {
		t.Fatalf("contextEntries = %+v, want one entry with Command %q", snap.contextEntries, "go test ./...")
	}

	// Mutating the session afterward must not affect the snapshot (proves it's a copy).
	s.contextEntries[0].Command = "mutated"
	if snap.contextEntries[0].Command != "go test ./..." {
		t.Errorf("snapshot was mutated by later session changes — not an independent copy")
	}
}
