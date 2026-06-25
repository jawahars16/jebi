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

const suggestPromptTemplate = `You are a terminal assistant. Suggest the next shell commands the user should type.

Environment: shell=%s  os=%s  cwd=%s
Platform: macOS Sonoma on Apple Silicon. Use Homebrew (brew) for installing missing tools.

CRITICAL: Every line you output must be a shell command that can be typed into a terminal and executed.
NEVER output terminal output, error messages, file contents, git output, or any text that is not a shell command.
Ask yourself: "Can I type this line into a shell prompt and press Enter?" If no, do not include it.

How to decide:
- The last 1-3 commands are your primary signal. Continue that workflow.
- If the last command failed with "command not found", the tool is not installed — use brew install <tool> as the first suggestion.
- If the last command failed with "unknown command" or wrong subcommand, suggest the correct usage.
- For other failures, suggest commands that fix the specific error.
- Never suggest a command identical to the one that just failed.
- Weight suggestions toward the project visible in the file listing: npm/npx in Node projects, go in Go projects, etc.

Format:
- 1 to 3 lines. Each line is one complete shell command.
- No numbering, no bullet points, no explanations, no blank lines.
- Always output at least 1 suggestion.

Bad output — these are terminal output, NOT commands (never output these):
  Already up-to-date.
  From github.com:org/repo
  cd0c36c..bf21455  main -> main
  Error: connection refused
  import com.example.Foo;
  warning: detached HEAD

Good output — these are actual shell commands:
  git log --oneline
  docker compose up -d
  kubectl get pods`

// BuildSuggestMessages returns the message list for a next-command suggestion request.
func BuildSuggestMessages(req SuggestRequest) []ChatMessage {
	system := fmt.Sprintf(suggestPromptTemplate, req.Shell, req.OS, req.Cwd)
	var sb strings.Builder
	fmt.Fprintf(&sb, "Current directory: %s\n", req.Cwd)
	if len(req.DirListing) > 0 {
		fmt.Fprintf(&sb, "Files (secondary context only): %s\n", strings.Join(req.DirListing, "  "))
	}
	sb.WriteString("\n")

	// Explicitly surface the last failure so small models don't miss it.
	if len(req.Entries) > 0 {
		last := req.Entries[len(req.Entries)-1]
		if last.ExitCode != 0 {
			fmt.Fprintf(&sb, "NOTE: The last command failed (exit %d). Prioritise suggestions that fix or work around this error.\n\n", last.ExitCode)
		}
	}

	start := len(req.Entries) - explainMaxContextEntries
	if start < 0 {
		start = 0
	}
	for _, e := range req.Entries[start:] {
		if e.ExitCode != 0 {
			fmt.Fprintf(&sb, "$ %s  [FAILED exit %d]\n%s\n", e.Command, e.ExitCode, truncate(e.Output, explainMaxOutputBytes))
		} else {
			fmt.Fprintf(&sb, "$ %s\n%s\n", e.Command, truncate(e.Output, explainMaxOutputBytes))
		}
	}
	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: sb.String()},
	}
}

// ParseSuggestResponse extracts up to 3 commands from the raw LLM response.
func ParseSuggestResponse(raw string) []string {
	raw = strings.TrimSpace(raw)
	raw = strings.Trim(raw, "`")
	var results []string
	for _, line := range strings.Split(raw, "\n") {
		if len(results) >= 3 {
			break
		}
		t := strings.TrimSpace(line)
		if t == "" {
			continue
		}
		// Strip markdown code fence markers the model may emit
		t = strings.Trim(t, "`")
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		// Strip any leading shell prompt symbol or shell name the model may have echoed
		t = strings.TrimPrefix(t, "$ ")
		t = strings.TrimPrefix(t, "% ")
		for _, sh := range []string{"bash ", "sh ", "zsh ", "fish "} {
			t = strings.TrimPrefix(t, sh)
		}
		// Strip trailing status suffix the model may echo from the history format
		if i := strings.LastIndex(t, "  ["); i >= 0 && strings.HasSuffix(t, "]") {
			t = strings.TrimSpace(t[:i])
		}
		// Skip anything that looks like output or explanation rather than a command
		if t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		results = append(results, t)
	}
	return results
}

var explainPromptTemplate = "You are an expert terminal assistant. A shell command failed. Explain the most likely cause and how to fix it.\n\n" +
	"Environment:\nShell: %s\nOS: %s\nCurrent directory: %s\n" +
	"Platform: macOS Sonoma on Apple Silicon. Use Homebrew (brew) for missing tools.\n\n" +
	"Focus exclusively on the command labeled [FAILED - THIS IS THE COMMAND TO EXPLAIN]. Prior commands are context only.\n\n" +
	"Rules:\n" +
	"- Output exactly 2 short sentences.\n" +
	"- First sentence: what went wrong — reference the specific error text from the output.\n" +
	"- Second sentence: the concrete fix action (e.g. 'Run `brew install git`', 'Check that the path exists', 'Add the missing flag').\n" +
	"- No markdown except backticks. No bullet points. No labels.\n" +
	"- Wrap all command names, flags, file paths, and tool names in backticks.\n" +
	"- Never prefix commands with a shell name (no `bash`, `sh`, `zsh`). The user is already in a terminal.\n" +
	"- If no useful explanation is possible, output empty string.\n\n" +
	"Good examples:\n" +
	"- \"The `git` command failed because the directory does not exist; check the path or create it first.\"\n" +
	"- \"`npm install` failed with 'ENOENT: no such file or directory' — run `npm init` first to create a package.json.\"\n" +
	"- \"Permission denied on `/usr/local/bin` — run the command with `sudo`.\"\n\n" +
	"Bad examples:\n" +
	"- Generic advice like \"something went wrong\"\n" +
	"- Multiple possible causes\n" +
	"- Repeating the command without explaining the error\n\n" +
	"Return only the explanation text."

const explainMaxContextEntries = 5
const explainMaxOutputBytes = 400
const explainMaxFailingOutputBytes = 800

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return "…" + s[len(s)-max:]
}

// BuildExplainMessages returns the message list for an error explanation request.
// Prior commands are included as context so the LLM understands what the user was doing.
func BuildExplainMessages(req SuggestRequest) []ChatMessage {
	system := fmt.Sprintf(explainPromptTemplate, req.Shell, req.OS, req.Cwd)
	var sb strings.Builder
	last := len(req.Entries) - 1

	// Include only the most recent prior commands to stay within context limits.
	contextStart := last - explainMaxContextEntries
	if contextStart < 0 {
		contextStart = 0
	}

	for i, e := range req.Entries {
		if i < contextStart {
			continue
		}
		if i < last {
			status := "PASSED"
			if e.ExitCode != 0 {
				status = "FAILED"
			}
			fmt.Fprintf(&sb, "[%s] $ %s\n%s\n", status, e.Command, truncate(e.Output, explainMaxOutputBytes))
		} else {
			fmt.Fprintf(&sb, "\n[FAILED - THIS IS THE COMMAND TO EXPLAIN] $ %s\nOutput: %s\nExit code: %d", e.Command, truncate(e.Output, explainMaxFailingOutputBytes), e.ExitCode)
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

// BuildSessionSummaryMessages returns messages for summarising the recent
// command session into a compact, useful note for the user.
func BuildSessionSummaryMessages(req SuggestRequest) []ChatMessage {
	system := fmt.Sprintf("You are an expert terminal assistant. Summarize the user's recent shell session.\n\n"+
		"Environment:\nShell: %s\nOS: %s\nCurrent directory: %s\n\n"+
		"Rules:\n"+
		"- Output 3-5 concise bullets.\n"+
		"- Focus on what changed, failures, useful next steps, and notable project state.\n"+
		"- Mention exact commands or files only when present in the provided history.\n"+
		"- Do not invent facts. If there is not enough history, say that briefly.\n"+
		"- Markdown bullets are allowed. No headings.", req.Shell, req.OS, req.Cwd)

	var sb strings.Builder
	if len(req.DirListing) > 0 {
		fmt.Fprintf(&sb, "Current directory files: %s\n\n", strings.Join(req.DirListing, "  "))
	}
	start := len(req.Entries) - explainMaxContextEntries
	if start < 0 {
		start = 0
	}
	for _, e := range req.Entries[start:] {
		if e.ExitCode != 0 {
			fmt.Fprintf(&sb, "$ %s  [exit %d]\n%s\n\n", e.Command, e.ExitCode, truncate(e.Output, explainMaxFailingOutputBytes))
		} else {
			fmt.Fprintf(&sb, "$ %s\n%s\n\n", e.Command, truncate(e.Output, explainMaxFailingOutputBytes))
		}
	}
	if len(req.Entries) == 0 {
		sb.WriteString("No completed commands are available yet.")
	}

	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: sb.String()},
	}
}

// BuildProjectContextMessages returns messages for a one-sentence project summary.
func BuildProjectContextMessages(info ProjectInfo) []ChatMessage {
	var parts []string
	if info.Git != "" {
		fields := strings.SplitN(info.Git, "|", 4)
		branch := fields[0]
		dirty := len(fields) > 1 && fields[1] == "1"
		s := "git branch: " + branch
		if dirty {
			s += " (uncommitted changes)"
		}
		parts = append(parts, s)
	}
	if info.Node != "" {
		fields := strings.SplitN(info.Node, "|", 2)
		s := "Node.js " + fields[0]
		if len(fields) > 1 && fields[1] != "" && fields[1] != "npm" {
			s += ", package manager: " + fields[1]
		}
		parts = append(parts, s)
	}
	if info.Go != "" {
		parts = append(parts, "Go "+info.Go)
	}
	if info.Python != "" {
		fields := strings.SplitN(info.Python, "|", 2)
		s := "Python " + fields[0]
		if len(fields) > 1 && fields[1] != "" {
			s += " (venv: " + fields[1] + " active)"
		} else {
			s += " (no venv active)"
		}
		parts = append(parts, s)
	}
	if info.Docker != "" {
		if info.Docker == "compose" {
			parts = append(parts, "Docker Compose available")
		} else {
			parts = append(parts, "Dockerfile present")
		}
	}
	if info.K8s != "" {
		fields := strings.SplitN(info.K8s, "|", 2)
		parts = append(parts, "Kubernetes context: "+fields[0])
	}

	detected := "- " + strings.Join(parts, "\n- ")

	system := "You are a terminal assistant. A user just cd'd into a directory.\n" +
		"You will receive structured facts about the project.\n\n" +
		"Respond with JSON only: {\"message\": \"...\", \"score\": N}\n" +
		"- message: one short sentence of genuinely useful info, or empty string\n" +
		"- score: 1-10 rating of how useful this info is to a developer right now\n\n" +
		"Score guide:\n" +
		"8-10: Immediately actionable (uncommitted changes on a feature branch, prod k8s context active)\n" +
		"5-7:  Mildly useful context\n" +
		"1-4:  Generic or obvious (\"this is a Go project\", \"node is installed\")\n\n" +
		"STRICT rules for message:\n" +
		"- Only mention concepts that belong to technologies present in the facts.\n" +
		"- Never mention Python/venv/pip unless Python is in the facts.\n" +
		"- Never mention npm/yarn unless Node is in the facts.\n" +
		"- Never mention go.mod/go build unless Go is in the facts.\n" +
		"- If nothing useful: {\"message\": \"\", \"score\": 0}\n\n" +
		"Return raw JSON only. No explanation, no markdown."

	user := fmt.Sprintf("Directory: %s\nDetected: %s", info.Dir, detected)

	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}
}

const analyzePromptTemplate = `You are a terminal output analyzer. Given a shell command and its output, extract what matters most.

Environment: shell=%s  os=%s  cwd=%s

Return ONLY valid JSON with this exact structure — no markdown, no explanation:
{"title":"...","items":[{"type":"...","text":"...","detail":"..."}],"action":{"label":"...","command":"..."}}

Or if no action is relevant:
{"title":"...","items":[{"type":"...","text":"...","detail":"..."}],"action":null}

Field rules:
- title: one short phrase summarising the outcome (e.g. "3 build errors", "47/50 tests passed", "2 pods failing", "12 files changed")
- items: 1 to 5 key facts. For each item:
  - type must be exactly one of: "error", "metric", "insight", "warning"
  - type "error": a failure or problem, include file:line if present in output
  - type "metric": a number or stat (e.g. "47/50 tests passed", "build time: 3.2s", "downloaded 142 packages")
  - type "warning": something that may need attention but is not a failure
  - type "insight": a useful observation or root cause hint
  - text: under 80 characters
  - detail: extra context or the raw error line (empty string if none)
- action: one suggested next command if there is an obvious next step, otherwise null
- Output ONLY the JSON. No text before or after.`

// BuildAnalyzeMessages returns the message list for an output analysis request.
func BuildAnalyzeMessages(req AnalyzeRequest) []ChatMessage {
	system := fmt.Sprintf(analyzePromptTemplate, req.Shell, req.OS, req.Cwd)
	var sb strings.Builder
	exitLabel := "exit 0"
	if req.ExitCode != 0 {
		exitLabel = fmt.Sprintf("exit %d (FAILED)", req.ExitCode)
	}
	fmt.Fprintf(&sb, "$ %s  [%s]\n\n%s", req.Command, exitLabel, req.Output)
	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: sb.String()},
	}
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
