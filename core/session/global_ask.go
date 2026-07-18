package session

import (
	"fmt"
	"strings"

	"terminal/core/llm"
)

// globalSessionInfo is the frontend-supplied metadata for one open tab,
// carried in the ask_global request's "sessions" field.
type globalSessionInfo struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Active bool   `json:"active"`
}

// maxGlobalHistoryBytes caps the total rendered history text across all
// sessions so many open tabs can't blow the local model's context window.
const maxGlobalHistoryBytes = 8 * 1024

// buildGlobalAskMessages constructs the message list for an ask_global request.
// Only sessions present in infoByID are included — sessions the frontend
// doesn't know about (stale/reconnecting) are skipped. The active session
// (per infoByID) is rendered first.
func buildGlobalAskMessages(sessions []*Session, infoByID map[string]globalSessionInfo, history []llm.ChatMessage, query string) []llm.ChatMessage {
	system := "You are a terminal assistant embedded in a developer terminal called jebi.\n" +
		"You have context on ALL of the user's open terminal tabs, not just one.\n" +
		"You cannot read or write file contents, and you cannot execute commands.\n" +
		"You only see: each session's current directory, file and directory NAMES\n" +
		"(never contents), and the commands run in each session with their output\n" +
		"and exit codes.\n\n" +
		"You may:\n" +
		"- Suggest shell commands\n" +
		"- Explain command output, errors, and exit codes\n" +
		"- Compare or summarize activity across sessions\n\n" +
		"You MUST politely decline any question outside this scope by saying:\n" +
		"\"I can only help with terminal and shell questions across your sessions.\"\n\n" +
		"Be concise. Use backticks for commands and file paths. No unnecessary preamble.\n"

	ordered := orderedGlobalSnapshots(sessions, infoByID)
	system += renderGlobalSessions(ordered)

	messages := []llm.ChatMessage{{Role: "system", Content: system}}
	messages = append(messages, history...)
	messages = append(messages, llm.ChatMessage{Role: "user", Content: query})
	return messages
}

// globalSnapshot pairs a session's race-free state with its frontend metadata.
type globalSnapshot struct {
	info globalSessionInfo
	snap sessionSnapshot
}

// orderedGlobalSnapshots filters sessions to those known to the frontend and
// sorts the active one first, preserving relative order otherwise.
func orderedGlobalSnapshots(sessions []*Session, infoByID map[string]globalSessionInfo) []globalSnapshot {
	var active *globalSnapshot
	var rest []globalSnapshot
	for _, s := range sessions {
		info, ok := infoByID[s.id]
		if !ok {
			continue
		}
		gs := globalSnapshot{info: info, snap: s.snapshot()}
		if info.Active {
			gs := gs
			active = &gs
			continue
		}
		rest = append(rest, gs)
	}
	if active == nil {
		return rest
	}
	return append([]globalSnapshot{*active}, rest...)
}

// renderGlobalSessions formats each session's context, trimming oldest
// history entries (globally, across sessions) once the total rendered size
// exceeds maxGlobalHistoryBytes.
func renderGlobalSessions(ordered []globalSnapshot) string {
	if len(ordered) == 0 {
		return ""
	}
	var sb strings.Builder
	budget := maxGlobalHistoryBytes
	for _, gs := range ordered {
		label := gs.info.Title
		if gs.info.Active {
			label += " (ACTIVE)"
		}
		fmt.Fprintf(&sb, "\n## Session: %s — %s\n", label, gs.snap.cwd)
		if listing := readDir(gs.snap.cwd); len(listing) > 0 {
			sb.WriteString("Files (names only): " + strings.Join(listing, "  ") + "\n")
		}
		history := formatRecentCommandsForGlobal(gs.snap.contextEntries, &budget)
		if history != "" {
			sb.WriteString("History:\n" + history)
		}
	}
	return sb.String()
}

// formatRecentCommandsForGlobal renders entries oldest-to-newest, stopping
// once budget (shared across all sessions) is exhausted. budget is
// decremented by the byte length of each rendered entry.
func formatRecentCommandsForGlobal(entries []llm.HistoryEntry, budget *int) string {
	if len(entries) == 0 || *budget <= 0 {
		return ""
	}
	var sb strings.Builder
	for _, e := range entries {
		status := "ok"
		if e.ExitCode != 0 {
			status = fmt.Sprintf("exit %d", e.ExitCode)
		}
		output := e.Output
		const maxOutputLines = 15
		if lines := strings.Split(output, "\n"); len(lines) > maxOutputLines {
			output = strings.Join(lines[len(lines)-maxOutputLines:], "\n")
		}
		entryText := fmt.Sprintf("$ %s  [%s]\n%s\n", e.Command, status, output)
		if len(entryText) > *budget {
			break
		}
		sb.WriteString(entryText)
		*budget -= len(entryText)
	}
	return sb.String()
}

// suggestGlobalPrompts computes exactly 3 suggested prompts from live session
// state — no model call, so it's instant and doesn't wake a spun-down provider.
func suggestGlobalPrompts(sessions []*Session, infoByID map[string]globalSessionInfo, activeID string) []string {
	ordered := orderedGlobalSnapshots(sessions, infoByID)
	var prompts []string

	var active *globalSnapshot
	for i := range ordered {
		if ordered[i].info.ID == activeID {
			active = &ordered[i]
			break
		}
	}

	if active != nil && len(active.snap.contextEntries) > 0 {
		last := active.snap.contextEntries[len(active.snap.contextEntries)-1]
		if last.ExitCode != 0 {
			prompts = append(prompts, fmt.Sprintf("Why did `%s` fail with exit %d?", last.Command, last.ExitCode))
		} else {
			prompts = append(prompts, fmt.Sprintf("Explain what `%s` did", last.Command))
		}
		prompts = append(prompts, "What should I run next?")
	}

	if len(ordered) > 1 {
		prompts = append(prompts, "Summarize what each of my sessions is doing")
	}

	fallbacks := []string{
		"What does this error output mean?",
		"Suggest a command to check what's running here",
		"What's in my current directory?",
	}
	for _, f := range fallbacks {
		if len(prompts) >= 3 {
			break
		}
		prompts = append(prompts, f)
	}

	return prompts[:3]
}
