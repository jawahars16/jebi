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

const suggestPromptTemplate = `You are an expert terminal assistant. Your job is to predict the single most useful next shell command based on the session.

Environment:
Shell: %s
OS: %s
Current directory: %s

Decision Process (follow strictly):
1. Identify the user's goal from the recent commands (not just the last one).
2. Detect if the workflow is:
   - navigation (cd, ls)
   - development (git, build, run)
   - debugging (errors, logs)
   - file operations
3. Check if the last command failed:
   - If yes, prioritize fixing the error.
4. If no error:
   - Continue the workflow logically (next step, not random suggestion).
5. Prefer safe, minimal, and commonly used commands.

Rules:
- Output ONLY the raw shell command.
- No explanations. No markdown. No prompt symbols.
- Never prefix the command with a shell name (no bash, sh, zsh). The user is already in a terminal.
- Do NOT suggest destructive commands (rm -rf, reset, etc.) unless clearly implied.
- Do NOT repeat the last command if it failed — suggest a fix or something different instead.
- Never suggest a command that appeared with [exit N] in the history — it failed and should not be repeated as-is.
- If the last command was "command not found", output an empty string — do not guess at broken commands.
- If context is unclear or there is no confident next step, output an empty string.

Examples of good behavior:
- After "git clone ..." → suggest "cd <repo>"
- After "npm install" → suggest "npm start" or "npm run dev"
- After "cd" into a dir → suggest "ls"
- After "command not found: foo" → output empty string (no suggestion)

Return only the command. Nothing else.`

// BuildSuggestMessages returns the message list for a next-command suggestion request.
func BuildSuggestMessages(req SuggestRequest) []ChatMessage {
	system := fmt.Sprintf(suggestPromptTemplate, req.Shell, req.OS, req.Cwd)
	var sb strings.Builder
	fmt.Fprintf(&sb, "Current directory: %s\n", req.Cwd)
	if len(req.DirListing) > 0 {
		fmt.Fprintf(&sb, "Files: %s\n", strings.Join(req.DirListing, "  "))
	}
	sb.WriteString("\n")
	for _, e := range req.Entries {
		status := "ok"
		if e.ExitCode != 0 {
			status = fmt.Sprintf("exit %d", e.ExitCode)
		}
		fmt.Fprintf(&sb, "$ %s  [%s]\n%s\n", e.Command, status, e.Output)
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
		// Strip any leading shell prompt symbol or shell name the model may have echoed
		t = strings.TrimPrefix(t, "$ ")
		t = strings.TrimPrefix(t, "% ")
		for _, sh := range []string{"bash ", "sh ", "zsh ", "fish "} {
			t = strings.TrimPrefix(t, sh)
		}
		return t
	}
	return ""
}

var explainPromptTemplate = "You are an expert terminal assistant. A shell command failed. Explain the most likely cause and how to fix it.\n\n" +
	"Environment:\nShell: %s\nOS: %s\nCurrent directory: %s\n\n" +
	"Decision Process:\n" +
	"1. The command history is labeled [PASSED] or [FAILED] for each prior command.\n" +
	"2. The command marked [FAILED - THIS IS THE COMMAND TO EXPLAIN] is the one that needs explanation — focus exclusively on it.\n" +
	"3. Prior commands are context only; do NOT explain them even if they are labeled [FAILED].\n" +
	"4. Identify the most probable root cause (not multiple guesses).\n" +
	"5. Provide the simplest fix that is most likely to work.\n\n" +
	"Rules:\n" +
	"- Output 1-2 short sentences.\n" +
	"- No markdown except backticks. No bullet points. No labels.\n" +
	"- Wrap all command names, flags, file paths, and tool names in backticks (e.g. `git`, `npm install`, `--flag`).\n" +
	"- Never prefix commands with a shell name (no `bash`, `sh`, `zsh`). The user is already in a terminal.\n" +
	"- Be specific (mention command, file, or tool if relevant).\n" +
	"- If the issue is trivial (typo, empty input, obvious misuse), output empty string.\n" +
	"- If uncertain, output empty string.\n\n" +
	"Good examples:\n" +
	"- \"The `git` command failed because the directory does not exist; check the path or create it first.\"\n" +
	"- \"Permission denied indicates you need elevated privileges; try running with `sudo`.\"\n\n" +
	"Bad examples:\n" +
	"- Generic advice like \"something went wrong\"\n" +
	"- Multiple possible causes\n\n" +
	"Return only the explanation text."

// BuildExplainMessages returns the message list for an error explanation request.
// Prior commands are included as context so the LLM understands what the user was doing.
func BuildExplainMessages(req SuggestRequest) []ChatMessage {
	system := fmt.Sprintf(explainPromptTemplate, req.Shell, req.OS, req.Cwd)
	var sb strings.Builder
	last := len(req.Entries) - 1
	for i, e := range req.Entries {
		if i < last {
			status := "PASSED"
			if e.ExitCode != 0 {
				status = "FAILED"
			}
			fmt.Fprintf(&sb, "[%s] $ %s\n%s\n", status, e.Command, e.Output)
		} else {
			fmt.Fprintf(&sb, "\n[FAILED - THIS IS THE COMMAND TO EXPLAIN] $ %s\nOutput: %s\nExit code: %d", e.Command, e.Output, e.ExitCode)
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
		"You will receive structured facts about the project. Write ONE short sentence surfacing something genuinely useful the user should know.\n\n" +
		"IMPORTANT: Only use the facts provided. Do not invent or infer anything not in the facts.\n" +
		"- virtualenv / venv concerns apply ONLY when Python is detected\n" +
		"- npm / yarn / node_modules concerns apply ONLY when Node.js is detected\n" +
		"- Never mix concepts from different ecosystems\n\n" +
		"Focus on actionable status:\n" +
		"- Uncommitted or unpushed git changes\n" +
		"- Python venv not activated (only when Python is in the facts)\n" +
		"- Dirty git state on a non-main branch\n" +
		"- Notable combinations (e.g. Go + Kubernetes context pointing to production)\n\n" +
		"Rules:\n" +
		"- One sentence only. No labels. No markdown except backticks.\n" +
		"- Do NOT suggest what command to run next.\n" +
		"- If there is nothing genuinely useful to surface, output empty string.\n" +
		"- Generic observations like 'this is a Node.js project' are not useful — output empty string.\n\n" +
		"Good examples:\n" +
		"- \"Python 3.11 detected but no virtualenv is active — dependencies may not resolve.\"\n" +
		"- \"On branch `feature/auth` with 5 uncommitted files.\"\n" +
		"- \"Go service with Kubernetes context pointing to `prod-cluster`.\"\n\n" +
		"Bad examples (output empty string for these):\n" +
		"- \"This is a Next.js project.\"\n" +
		"- \"Node.js project with no virtualenv active.\"  ← wrong: virtualenv is Python only\n" +
		"- \"You can run npm run dev to start.\"\n\n" +
		"Return only the sentence, or empty string."

	user := fmt.Sprintf("Directory: %s\nDetected: %s", info.Dir, detected)

	return []ChatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
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
