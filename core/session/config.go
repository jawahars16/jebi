package session

import (
	"path/filepath"
	"slices"
	"strings"
)

// Config holds user preferences sent to the frontend on connect.
type Config struct {
	Shell          string   `json:"shell"`
	PromptSegments []string `json:"promptSegments"`
}

func (c Config) hasSegment(name string) bool {
	return slices.Contains(c.PromptSegments, name)
}

// DefaultConfig is used until a settings UI exists.
var DefaultConfig = Config{
	Shell:          "",
	PromptSegments: []string{"cwd", "git"},
}

// segmentEmits maps each segment name to the shell printf that emits its OSC sequence.
var segmentEmits = map[string]string{
	"cwd":       `  printf '\033]7;%s\033\\' "$PWD"`,
	"exit_code": `  printf '\033]9001;%s\033\\' "$?"`,
	"git": `  _git_br=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
  if [ -n "$_git_br" ]; then
    _git_d=$(git status --porcelain 2>/dev/null | head -c1); [ -n "$_git_d" ] && _git_d=1 || _git_d=0
    _git_a=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
    _git_b=$(git rev-list --count HEAD..@{u} 2>/dev/null || echo 0)
    printf '\033]9002;%s|%s|%s|%s\033\\' "$_git_br" "$_git_d" "$_git_a" "$_git_b"
  fi`,
}

// buildShellHook generates a precmd/PROMPT_COMMAND hook for the given shell.
// exit_code is always emitted first to capture $? before any other command runs.
func buildShellHook(cfg Config, shell string) string {
	var lines []string

	switch filepath.Base(shell) {
	case "bash":
		lines = append(lines, "PS1=''", "PS2=''", "_term_precmd() {")
	default: // zsh
		lines = append(lines, "PROMPT=''", "RPROMPT=''", "PROMPT_EOL_MARK=''", "_term_precmd() {")
	}

	// exit_code must come first — captures $? before anything else resets it.
	lines = append(lines, segmentEmits["exit_code"])

	for _, seg := range cfg.PromptSegments {
		if seg == "exit_code" {
			continue // already emitted above; second emission would capture wrong $?
		}
		if emit, ok := segmentEmits[seg]; ok {
			lines = append(lines, emit)
		}
	}

	switch filepath.Base(shell) {
	case "bash":
		lines = append(lines, "}", "PROMPT_COMMAND=_term_precmd")
	default: // zsh
		lines = append(lines, "}", "precmd_functions+=(_term_precmd)")
	}

	return strings.Join(lines, "\n")
}
