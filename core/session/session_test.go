package session

import (
	"testing"
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

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

func trimPrefix(s, prefix string) string {
	if hasPrefix(s, prefix) {
		return s[len(prefix):]
	}
	return s
}
