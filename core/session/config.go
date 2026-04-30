package session

import (
	"path/filepath"
	"strings"
)

// Config holds user preferences sent to the frontend on connect.
type Config struct {
	Shell          string   `json:"shell"`
	PromptSegments []string `json:"promptSegments"`
}

// DefaultConfig is used until a settings UI exists.
// Shell hook only emits exit_code and cwd — git/node are detected by Go on cwd change.
var DefaultConfig = Config{
	Shell:          "",
	PromptSegments: []string{"cwd", "conda"},
}

// segmentEmits maps segment names to shell printf snippets injected into precmd.
// Only fast, safe operations belong here — nothing that shells out to slow commands.
var segmentEmits = map[string]string{
	"cwd":       `  printf '\033]7;%s\033\\' "$PWD"`,
	"exit_code": `  printf '\033]9001;%s\033\\' "$?"`,
	"conda":     `  printf '\033]9003;%s\033\\' "${CONDA_DEFAULT_ENV:-}"`,
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
			continue
		}
		if emit, ok := segmentEmits[seg]; ok {
			lines = append(lines, emit)
		}
	}

	// Disable echo before the next prompt so injected commands from InputBar
	// aren't echoed back into xterm. preexec / DEBUG (below) re-enables echo
	// just before the user's command runs so interactive programs like
	// `git add -p`, `read`, or `mysql` display keystrokes normally.
	lines = append(lines, "  stty -echo")

	switch filepath.Base(shell) {
	case "bash":
		lines = append(lines,
			"}",
			"PROMPT_COMMAND=_term_precmd",
			`_term_debug_trap() { [[ "$BASH_COMMAND" == "stty -echo" ]] || stty echo 2>/dev/null; }`,
			"trap '_term_debug_trap' DEBUG",
		)
	default: // zsh
		lines = append(lines,
			"}",
			"precmd_functions+=(_term_precmd)",
			"_term_preexec() { stty echo }",
			"preexec_functions+=(_term_preexec)",
		)
	}

	return strings.Join(lines, "\n")
}
