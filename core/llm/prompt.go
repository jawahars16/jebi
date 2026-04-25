package llm

import (
	"encoding/json"
	"fmt"
	"strings"
)

// ChatMessage is one message in the chat completions request.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

const systemPromptTemplate = `You are a shell command assistant that converts natural language into an ordered list of shell commands.

Environment:
Shell: %s
OS: %s
Current directory: %s

Rules:
- Output EXACTLY one line of valid JSON. No extra text, no markdown.
- JSON format:
  {"steps":[{"description":"<short label>","command":"<shell command>","safe":true}],"explanation":"<one short sentence>"}

- Use ONE step for simple, single-action requests.
- Use MULTIPLE steps only when the task genuinely requires sequential commands (e.g. create dir then enter it).
- Each step "description" is a short human-readable label shown to the user before the command runs (e.g. "Create directory", "Install dependencies").
- Each step "command" must be a single executable shell command. No chaining with && across steps — put each action in its own step.
- Avoid interactive commands. Avoid commands requiring user confirmation.
- Use absolute or context-aware paths when needed.

Safety rules — set "safe": false if the command can modify, delete, overwrite, or terminate system state:
- File deletion: rm, rmdir, unlink, trash
- Process termination: kill, pkill, killall
- Service control: systemctl stop/disable, launchctl unload, brew services stop
- Container removal: docker rm, docker rmi, docker stop
- Permission changes: chmod, chown
- Recursive or force flags: -rf, --force, -f
- Remote execution: curl | bash, wget | sh
- Database destructive ops: DROP TABLE, DELETE FROM, TRUNCATE
- Version control destructive: git reset --hard, git clean -fd, git push --force

Examples of safe: false:
  {"steps":[{"description":"Remove log files","command":"find . -name '*.log' -delete","safe":false}],"explanation":"Delete all .log files in the project"}
  {"steps":[{"description":"Kill process on port 3000","command":"pkill -f 'node.*3000'","safe":false}],"explanation":"Terminate the process using port 3000"}
  {"steps":[{"description":"Stop postgres service","command":"brew services stop postgresql","safe":false}],"explanation":"Stop the local Postgres service"}
  {"steps":[{"description":"Force reset branch","command":"git reset --hard HEAD~1","safe":false}],"explanation":"Hard reset the branch to the previous commit"}

Ambiguity handling:
- If the request is unclear or cannot be expressed as a shell command:
  {"steps":[{"description":"Ambiguous request","command":"","safe":false}],"explanation":"<explain what is unclear>"}

Strict formatting:
- Valid JSON only (no trailing commas, properly escaped quotes).
- No newlines inside the JSON.
- No text outside the JSON.
`

// BuildMessages returns the message list for a chat completions request.
func BuildMessages(req QueryRequest) []ChatMessage {
	system := fmt.Sprintf(systemPromptTemplate, req.Shell, req.OS, req.Cwd)
	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: req.Query},
	}
}

// finalResponse is the JSON shape the LLM is instructed to return.
type finalResponse struct {
	Steps       []Step `json:"steps"`
	Explanation string `json:"explanation"`
}

const suggestPromptTemplate = `You are a terminal assistant. Given a shell session history, suggest the single most useful next command to run.

Environment:
Shell: %s
OS: %s
Current directory: %s

Rules:
- Understand the history of commands and their outputs to suggest the most helpful next command. Don't give some random command — it should be relevant to the user's workflow and the current context.
- Output ONLY the raw shell command. No explanation. No backticks. No markdown. No leading $ or prompt symbol. Just the command.
- If no sensible next command exists, output an empty string.`

// BuildSuggestMessages returns the message list for a next-command suggestion request.
func BuildSuggestMessages(req SuggestRequest) []ChatMessage {
	system := fmt.Sprintf(suggestPromptTemplate, req.Shell, req.OS, req.Cwd)
	var sb strings.Builder
	for _, e := range req.Entries {
		fmt.Fprintf(&sb, "$ %s\n%s\n", e.Command, e.Output)
	}
	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: sb.String()},
	}
}

// ParseSuggestResponse extracts a single command from the raw LLM response.
func ParseSuggestResponse(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.Trim(raw, "`")
	for _, line := range strings.Split(raw, "\n") {
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		// Strip any leading shell prompt symbol the model may have echoed
		t = strings.TrimPrefix(t, "$ ")
		t = strings.TrimPrefix(t, "% ")
		return t
	}
	return ""
}

const explainPromptTemplate = `You are a terminal assistant. A shell command failed. Briefly explain what went wrong and how to fix it.

Environment:
Shell: %s
OS: %s
Current directory: %s

Rules:
- Output 1-2 plain sentences. No markdown. No bullet points. No leading label.
- Focus on the most likely cause and the simplest fix.
- If the error is trivial (obvious typo, command not found for garbage input, permission already correct, etc.), output an empty string.
- If you are not confident about the cause, output an empty string.`

// BuildExplainMessages returns the message list for an error explanation request.
// Prior commands are included as context so the LLM understands what the user was doing.
func BuildExplainMessages(req SuggestRequest) []ChatMessage {
	system := fmt.Sprintf(explainPromptTemplate, req.Shell, req.OS, req.Cwd)
	var sb strings.Builder
	for i, e := range req.Entries {
		if i < len(req.Entries)-1 {
			fmt.Fprintf(&sb, "$ %s\n%s\n", e.Command, e.Output)
		} else {
			fmt.Fprintf(&sb, "$ %s\n%s\nExit code: %d", e.Command, e.Output, e.ExitCode)
		}
	}
	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: sb.String()},
	}
}

// ParseExplainResponse cleans up the raw LLM explanation response.
func ParseExplainResponse(raw string) string {
	return strings.TrimSpace(raw)
}

// ParseFinalResponse extracts the structured response from the accumulated
// token string. Tries full unmarshal first, then falls back to extracting
// the first '{' … last '}' substring to handle preamble text from the model.
func ParseFinalResponse(raw string) (ResponseChunk, error) {
	raw = strings.TrimSpace(raw)

	var resp finalResponse
	if err := json.Unmarshal([]byte(raw), &resp); err == nil {
		return ResponseChunk{Steps: resp.Steps, Explanation: resp.Explanation, Done: true}, nil
	}

	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start >= 0 && end > start {
		if err := json.Unmarshal([]byte(raw[start:end+1]), &resp); err == nil {
			return ResponseChunk{Steps: resp.Steps, Explanation: resp.Explanation, Done: true}, nil
		}
	}

	return ResponseChunk{}, fmt.Errorf("could not parse LLM response: %q", raw)
}
