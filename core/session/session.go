package session

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"

	"terminal/core/llm"
	"terminal/core/wire"

	"github.com/creack/pty"
	"golang.org/x/sys/unix"
)

type resizeMsg struct {
	Rows uint16 `json:"rows"`
	Cols uint16 `json:"cols"`
}

// connection is what Session needs from the WebSocket — messaging via Wire,
// plus Close for lifecycle management.
type connection interface {
	ReadMessage() (messageType int, p []byte, err error)
	WriteMessage(messageType int, data []byte) error
	Close() error
}

const maxContextEntries = 10

// Session represents one terminal tab — one PTY that survives WebSocket reconnects.
type Session struct {
	id   string
	conn connection
	w    *wire.Wire
	cfg  Config
	ptm  *os.File  // PTY master — we read/write this
	cmd  *exec.Cmd // the shell process

	// size
	rows uint16
	cols uint16

	// connMu guards conn and w so pipe() and Reattach() don't race.
	connMu sync.Mutex

	// replay buffers PTY output while no client is connected.
	replay *outputRingBuffer

	// cancelDetect cancels any in-flight git/node detection goroutine.
	cancelDetect context.CancelFunc

	// AI suggestion state — session-scoped, not persisted.
	provider       llm.Provider
	currentCwd     string
	lastContextDir string // last dir for which project context banner was shown
	contextEntries []llm.HistoryEntry
	cancelSuggest  context.CancelFunc
	cancelAsk      context.CancelFunc // cancels any in-flight /ask stream
	cancelAnalyze  context.CancelFunc // cancels any in-flight analysis request

	// firstCwdSeen suppresses the project-context banner on initial shell
	// startup. The first OSC 7 message is the shell's initial cwd, not the
	// result of a user cd command; we only want the banner after real navigation.
	firstCwdSeen bool
}

// resolveShell returns cfg.Shell if set, then $SHELL, then /bin/zsh.
func resolveShell(cfg Config) string {
	if cfg.Shell != "" {
		return cfg.Shell
	}
	if s := os.Getenv("SHELL"); s != "" {
		return s
	}
	return "/bin/zsh"
}

// New creates a Session, opens a PTY, spawns the shell, and injects the shell hook.
// The caller must call Close when the session ends.
func New(conn connection, provider llm.Provider, initialCwd string) (*Session, error) {
	s := &Session{
		id:       newSessionID(),
		conn:     conn,
		w:        wire.New(conn),
		cfg:      DefaultConfig,
		provider: provider,
		replay:   newOutputRingBuffer(256 * 1024), // 256 KB replay buffer
	}
	shell := resolveShell(s.cfg)

	ptm, pts, err := pty.Open()
	if err != nil {
		return nil, err
	}
	s.ptm = ptm

	unix.IoctlSetWinsize(int(pts.Fd()), unix.TIOCSWINSZ, &unix.Winsize{Row: 24, Col: 40})

	cmd := exec.Command(shell, "-l")
	if initialCwd != "" {
		if info, err := os.Stat(initialCwd); err == nil && info.IsDir() {
			cmd.Dir = initialCwd
		}
	}
	if cmd.Dir == "" {
		if home, err := os.UserHomeDir(); err == nil {
			cmd.Dir = home
		}
	}
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)
	cmd.Stdin = pts
	cmd.Stdout = pts
	cmd.Stderr = pts
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
		Ctty:    0,
	}
	s.cmd = cmd

	if err := cmd.Start(); err != nil {
		pts.Close()
		ptm.Close()
		return nil, err
	}
	pts.Close()

	// Send config to frontend so it knows which prompt segments are active.
	cfgData, _ := json.Marshal(s.cfg)
	s.w.Send(wire.Message{Type: wire.TypeConfig, Data: cfgData})

	// Suppress echo and inject the shell hook (suppress prompt, set up precmd).
	// Then emit a marker so pipe() knows when init is complete and output is clean.
	switch filepath.Base(shell) {
	case "zsh":
		ptm.WriteString("setopt NO_ZLE; stty -echo\n")
	case "bash":
		ptm.WriteString("set +o emacs; set +o vi; stty -echo\n")
	default:
		ptm.WriteString("stty -echo\n")
	}
	ptm.WriteString(buildShellHook(s.cfg, shell) + "\n")
	// Marker is split across two printf args so it doesn't appear in the
	// echoed command text — only in the actual stdout output.
	ptm.WriteString("printf '%s%s\\n' '__TERM_' 'READY__'\n")

	return s, nil
}

// Detach drops the WebSocket without killing the PTY. The shell keeps running;
// PTY output is buffered in the replay ring for the next reconnect.
func (s *Session) Detach() {
	s.connMu.Lock()
	defer s.connMu.Unlock()
	s.conn.Close()
	s.conn = nil
	s.w = nil
}

// Reattach wires a new WebSocket into this session, flushes buffered output,
// and resumes normal operation. Called when the renderer reconnects.
func (s *Session) Reattach(conn connection) {
	s.connMu.Lock()
	s.conn = conn
	s.w = wire.New(conn)
	w := s.w
	s.connMu.Unlock()

	// Send session ID so the renderer can persist it for future reconnects.
	w.Send(wire.StringMessage(wire.TypeSessionID, s.id))

	// Replay buffered output so the terminal catches up.
	if buffered := s.replay.drain(); len(buffered) > 0 {
		w.Send(wire.StringMessage(wire.TypeOutput, string(buffered)))
	}
}

// Close kills the shell process, releases the PTY, and removes from registry.
// writeInput sends user input to the PTY. For commands longer than 900 bytes
// the kernel's canonical-mode buffer (MAX_CANON ≈ 1024 on macOS) would cause
// the shell to hang, so we route long inputs through a temp file and source it.
func (s *Session) writeInput(input string) {
	// Strip the trailing newline added by the renderer before measuring.
	cmd := strings.TrimSuffix(input, "\n")
	if len(cmd) < 900 {
		s.ptm.WriteString(input)
		return
	}
	tmp, err := os.CreateTemp("", ".jebi_cmd_*")
	if err != nil {
		s.ptm.WriteString(input) // fallback
		return
	}
	tmp.WriteString(cmd)
	tmp.Close()
	s.ptm.WriteString(fmt.Sprintf("source %s && rm -f %s\n", tmp.Name(), tmp.Name()))
}

func (s *Session) Close() {
	registry.remove(s.id)
	if s.cancelDetect != nil {
		s.cancelDetect()
	}
	if s.cmd != nil && s.cmd.Process != nil {
		s.cmd.Process.Kill()
	}
	if s.ptm != nil {
		s.ptm.Close()
	}
	s.connMu.Lock()
	if s.conn != nil {
		s.conn.Close()
	}
	s.connMu.Unlock()
}

// Start launches the pipe goroutine and blocks reading input from the frontend.
// Returns only when a "kill" message is received or the shell process exits.
// A plain WebSocket disconnect detaches the connection but keeps the PTY alive.
func (s *Session) Start() {
	// Register so reconnects can find this session.
	registry.add(s)

	// Send session ID first so the renderer can persist it.
	s.w.Send(wire.StringMessage(wire.TypeSessionID, s.id))

	// Notify the frontend whether AI assistance is available.
	if s.provider != nil && s.provider.IsAvailable() {
		payload, _ := json.Marshal(map[string]string{"status": "available", "provider": s.provider.Name()})
		s.w.Send(wire.Message{Type: wire.TypeAIStatus, Data: payload})
	} else {
		payload, _ := json.Marshal(map[string]string{"status": "unavailable", "provider": ""})
		s.w.Send(wire.Message{Type: wire.TypeAIStatus, Data: payload})
	}

	go s.pipe()
	for {
		s.connMu.Lock()
		w := s.w
		s.connMu.Unlock()
		if w == nil {
			// Detached — wait for Reattach to provide a new reader.
			time.Sleep(100 * time.Millisecond)
			continue
		}
		msg, err := w.Receive()
		if err != nil {
			// WebSocket dropped — detach and keep PTY alive.
			s.Detach()
			continue
		}

		switch msg.Type {
		case wire.TypeInput:
			var input string
			if err := json.Unmarshal(msg.Data, &input); err == nil {
				s.writeInput(input)
			}
		case wire.TypeRawInput:
			var input string
			if err := json.Unmarshal(msg.Data, &input); err == nil {
				s.ptm.WriteString(input)
			}
		case wire.TypeResize:
			var r resizeMsg
			if err := json.Unmarshal(msg.Data, &r); err == nil {
				s.rows = r.Rows
				s.cols = r.Cols
				pty.Setsize(s.ptm, &pty.Winsize{Rows: r.Rows, Cols: r.Cols})
				// s.ptm.Write([]byte("\x0c")) // Ctrl+L
			}
		case wire.TypeAIAppend:
			if s.cancelAnalyze != nil {
				s.cancelAnalyze()
				s.cancelAnalyze = nil
			}
			if s.provider == nil {
				break
			}
			var entry llm.HistoryEntry
			if err := json.Unmarshal(msg.Data, &entry); err != nil {
				break
			}
			if len(entry.Output) > 600 {
				entry.Output = "…" + entry.Output[len(entry.Output)-600:]
			}
			s.contextEntries = append(s.contextEntries, entry)
			if len(s.contextEntries) > maxContextEntries {
				s.contextEntries = s.contextEntries[len(s.contextEntries)-maxContextEntries:]
			}
			// Skip AI for trivial commands, exit 127 (command not found), and
			// exit 130 (Ctrl+C / SIGINT — user intentionally cancelled).
			if entry.ExitCode == 127 || entry.ExitCode == 130 {
				break
			}
			if strings.Contains(entry.Output, "signal: interrupt") {
				break
			}
			if entry.ExitCode == 0 && isTrivialCommand(entry.Command) {
				break
			}
			if s.cancelSuggest != nil {
				s.cancelSuggest()
			}
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			s.cancelSuggest = cancel
			entries := make([]llm.HistoryEntry, len(s.contextEntries))
			copy(entries, s.contextEntries)
			cwd := s.currentCwd
			req := llm.SuggestRequest{
				Entries:    entries,
				Cwd:        cwd,
				Shell:      resolveShell(s.cfg),
				OS:         runtime.GOOS + "/" + runtime.GOARCH,
				DirListing: readDir(cwd),
			}
			if entry.ExitCode != 0 {
				// Error path: explain what went wrong AND suggest a fix command
				go func() {
					defer cancel()
					var wg sync.WaitGroup
					wg.Add(2)
					go func() {
						defer wg.Done()
						startData, _ := json.Marshal(map[string]string{"type": "error"})
						s.w.Send(wire.Message{Type: wire.TypeAIBannerStart, Data: startData})
						done := false
						llm.ExplainStream(ctx, s.provider, req,
							func(token string) {
								data, _ := json.Marshal(token)
								s.w.Send(wire.Message{Type: wire.TypeAIBannerToken, Data: data})
							},
							func(_ string) { done = true },
						)
						// Send cancel if the stream didn't complete — covers both context
						// cancellation and provider early-close (partial response).
						if !done {
							s.w.Send(wire.Message{Type: wire.TypeAIBannerCancel})
						}
					}()
					go func() {
						defer wg.Done()
						suggestions, err := llm.Suggest(ctx, s.provider, req)
						if err != nil || len(suggestions) == 0 {
							return
						}
						data, _ := json.Marshal(suggestions)
						s.w.Send(wire.Message{Type: wire.TypeAISuggestion, Data: data})
					}()
					wg.Wait()
				}()
			} else {
				// Success path: suggest next commands (from first command onwards)
				go func() {
					defer cancel()
					suggestions, err := llm.Suggest(ctx, s.provider, req)
					if err != nil || len(suggestions) == 0 {
						s.w.Send(wire.Message{Type: wire.TypeAISuggestError})
						return
					}
					data, _ := json.Marshal(suggestions)
					s.w.Send(wire.Message{Type: wire.TypeAISuggestion, Data: data})
				}()
			}

		case wire.TypeAIAnalyze:
			if s.provider == nil {
				break
			}
			var entry struct {
				Command  string `json:"command"`
				Output   string `json:"output"`
				ExitCode int    `json:"exitCode"`
				Cwd      string `json:"cwd"`
			}
			if err := json.Unmarshal(msg.Data, &entry); err != nil {
				break
			}
			if s.cancelAnalyze != nil {
				s.cancelAnalyze()
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			s.cancelAnalyze = cancel
			req := llm.AnalyzeRequest{
				Command:  entry.Command,
				Output:   entry.Output,
				ExitCode: entry.ExitCode,
				Cwd:      entry.Cwd,
				Shell:    resolveShell(s.cfg),
				OS:       runtime.GOOS + "/" + runtime.GOARCH,
			}
			go func() {
				defer cancel()
				result, err := llm.Analyze(ctx, s.provider, req)
				if err != nil || result == nil {
					return
				}
				data, err := json.Marshal(result)
				if err != nil {
					return
				}
				s.w.Send(wire.Message{Type: wire.TypeAIAnalysis, Data: data})
			}()

		case wire.TypeSummarize:
			if s.provider == nil || len(s.contextEntries) == 0 {
				s.w.Send(wire.Message{Type: wire.TypeAIBannerCancel})
				break
			}
			if s.cancelAsk != nil {
				s.cancelAsk()
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			s.cancelAsk = cancel
			entries := make([]llm.HistoryEntry, len(s.contextEntries))
			copy(entries, s.contextEntries)
			req := llm.SuggestRequest{
				Entries:    entries,
				Cwd:        s.currentCwd,
				Shell:      resolveShell(s.cfg),
				OS:         runtime.GOOS + "/" + runtime.GOARCH,
				DirListing: readDir(s.currentCwd),
			}
			go func() {
				defer cancel()
				startData, _ := json.Marshal(map[string]string{"type": "summary"})
				s.w.Send(wire.Message{Type: wire.TypeAIBannerStart, Data: startData})
				done := false
				messages := llm.BuildSessionSummaryMessages(req)
				llm.AskStream(ctx, s.provider, messages,
					func(token string) {
						data, _ := json.Marshal(token)
						s.w.Send(wire.Message{Type: wire.TypeAIBannerToken, Data: data})
					},
					func(_ string) { done = true },
				)
				if !done {
					s.w.Send(wire.Message{Type: wire.TypeAIBannerCancel})
				}
			}()

		case wire.TypeAsk:
			var payload struct {
				History []llm.ChatMessage `json:"history"`
				Query   string            `json:"query"`
			}
			if err := json.Unmarshal(msg.Data, &payload); err != nil || s.provider == nil || !s.provider.IsAvailable() {
				s.w.Send(wire.StringMessage(wire.TypeAskError, "AI not available"))
				break
			}
			if s.cancelAsk != nil {
				s.cancelAsk()
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			s.cancelAsk = cancel
			messages := buildAskMessages(s, payload.History, payload.Query)
			go func() {
				defer cancel()
				err := llm.AskStream(ctx, s.provider, messages,
					func(token string) {
						data, _ := json.Marshal(token)
						s.w.Send(wire.Message{Type: wire.TypeAskChunk, Data: data})
					},
					func(_ string) {
						s.w.Send(wire.Message{Type: wire.TypeAskDone})
					},
				)
				if err != nil && ctx.Err() == nil {
					s.w.Send(wire.StringMessage(wire.TypeAskError, err.Error()))
				}
			}()

		case wire.TypeKill:
			return
		}
	}
}

// buildAskMessages constructs the message list for a /ask request.
// The system prompt is built server-side to enforce scope and inject fresh context.
func buildAskMessages(s *Session, history []llm.ChatMessage, query string) []llm.ChatMessage {
	system := "You are a terminal assistant embedded in a developer terminal called jebi.\n" +
		"You ONLY answer questions about:\n" +
		"- The current terminal session (commands run, their output, exit codes)\n" +
		"- The current directory and its files\n" +
		"- Shell usage, command errors, and how to fix them\n" +
		"- General terminal/shell/developer tool questions\n\n" +
		"You MUST politely decline any question outside this scope by saying:\n" +
		"\"I can only help with terminal and shell questions in this session.\"\n\n" +
		"Be concise. Use backticks for commands and file paths. No unnecessary preamble.\n\n" +
		"Current directory: " + s.currentCwd + "\n"

	if listing := readDir(s.currentCwd); len(listing) > 0 {
		system += "\nFiles in current directory: " + strings.Join(listing, "  ")
	}

	if cmds := formatRecentCommands(s.contextEntries); cmds != "" {
		system += "\n\nRecent commands:\n" + cmds
	}

	messages := []llm.ChatMessage{{Role: "system", Content: system}}
	messages = append(messages, history...)
	messages = append(messages, llm.ChatMessage{Role: "user", Content: query})
	return messages
}

// formatRecentCommands formats the last 3 history entries as a compact log.
func formatRecentCommands(entries []llm.HistoryEntry) string {
	if len(entries) == 0 {
		return ""
	}
	start := len(entries) - 3
	if start < 0 {
		start = 0
	}
	var sb strings.Builder
	for _, e := range entries[start:] {
		status := "ok"
		if e.ExitCode != 0 {
			status = fmt.Sprintf("exit %d", e.ExitCode)
		}
		fmt.Fprintf(&sb, "$ %s  [%s]\n", e.Command, status)
	}
	return sb.String()
}

var trivialCommands = map[string]bool{
	"ls": true, "ll": true, "la": true, "l": true,
	"pwd": true, "cd": true,
	"cat": true, "less": true, "more": true, "head": true, "tail": true,
	"echo": true, "printf": true,
	"clear": true, "reset": true,
	"whoami": true, "id": true, "hostname": true, "uname": true, "date": true,
	"history": true, "which": true, "type": true, "where": true,
	"exit": true, "logout": true, "q": true,
}

// isTrivialCommand returns true when the command is read-only or produces no
// meaningful follow-up — so we skip the AI suggestion call for it.
func isTrivialCommand(command string) bool {
	cmd := strings.TrimSpace(command)
	// Extract the bare command name (strip path and arguments).
	if i := strings.IndexByte(cmd, ' '); i > 0 {
		cmd = cmd[:i]
	}
	cmd = filepath.Base(cmd)
	return trivialCommands[cmd]
}

// readDir returns up to 60 entries in dir — plain names for files, name+/ for
// directories. Hidden entries and the .git directory are included but capped.
func readDir(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	const max = 60
	names := make([]string, 0, min(len(entries), max))
	for _, e := range entries {
		if e.Name() == ".git" {
			continue
		}
		name := e.Name()
		if e.IsDir() {
			name += "/"
		}
		names = append(names, name)
		if len(names) >= max {
			break
		}
	}
	return names
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

const termReadyMarker = "__TERM_READY__"

func utf8SeqLen(b byte) int {
	switch {
	case b < 0x80:
		return 1
	case b&0xe0 == 0xc0:
		return 2
	case b&0xf0 == 0xe0:
		return 3
	case b&0xf8 == 0xf0:
		return 4
	default:
		return 0
	}
}

func splitCompleteUTF8(buf []byte) (complete []byte, leftover []byte) {
	if utf8.Valid(buf) {
		return buf, nil
	}

	for i := len(buf) - 1; i >= 0 && i >= len(buf)-utf8.UTFMax; i-- {
		if !utf8.RuneStart(buf[i]) {
			continue
		}
		want := utf8SeqLen(buf[i])
		if want > 1 && len(buf)-i < want && utf8.Valid(buf[:i]) {
			return buf[:i], append([]byte(nil), buf[i:]...)
		}
		break
	}

	// The invalid bytes are not just an incomplete trailing rune. Forward them
	// so the renderer can show a replacement character instead of stalling.
	return buf, nil
}

// pipe reads PTY output, parses OSC sequences, and forwards to the frontend.
// Drops all output until the __TERM_READY__ marker appears (emitted after shell
// init completes), so startup noise never reaches xterm.
// OSC sequences are stripped from the output stream and emitted as typed messages:
//   - OSC 7  (cwd)       → TypeCwd
//   - OSC 9001 (exit code) → TypeExitCode
func (s *Session) pipe() {
	buf := make([]byte, 4096)
	ready := false
	var pending []byte
	var oscLeftover []byte
	var utf8Leftover []byte

	sendOutput := func(data []byte) {
		if len(data) == 0 {
			return
		}
		if len(utf8Leftover) > 0 {
			joined := make([]byte, 0, len(utf8Leftover)+len(data))
			joined = append(joined, utf8Leftover...)
			joined = append(joined, data...)
			data = joined
			utf8Leftover = nil
		}
		complete, leftover := splitCompleteUTF8(data)
		utf8Leftover = leftover
		if len(complete) == 0 {
			return
		}
		s.connMu.Lock()
		w := s.w
		s.connMu.Unlock()
		if w == nil {
			// No client connected — buffer output for replay on reconnect.
			s.replay.write(complete)
		} else {
			w.Send(wire.StringMessage(wire.TypeOutput, string(complete)))
		}
	}

	for {
		n, err := s.ptm.Read(buf)
		if n > 0 {
			data := buf[:n]
			if ready {
				// Prepend any incomplete OSC sequence carried over from the last read.
				if len(oscLeftover) > 0 {
					data = append(oscLeftover, data...)
					oscLeftover = nil
				}

				// Strip kitty push/pop sequences — safe to remove, xterm ignores them.
				data = kittyStripPushPop(data)

				cleaned, payloads, leftover := parseOSC(data)
				oscLeftover = leftover

				for _, p := range payloads {
					switch {
					case strings.HasPrefix(p, "7;"):
						cwd := strings.TrimPrefix(p, "7;")
						s.currentCwd = cwd
						s.w.Send(wire.StringMessage(wire.TypeCwd, cwd))
						// Cancel previous detection and start fresh for the new directory.
						if s.cancelDetect != nil {
							s.cancelDetect()
						}
						ctx, cancel := newDetectContext()
						s.cancelDetect = cancel
						// On the first CWD (shell startup), run detection so segments
						// appear immediately, but skip the AI project-context banner by
						// pre-setting lastContextDir (detectEnv skips the banner when
						// dir == lastContextDir).
						if !s.firstCwdSeen {
							s.firstCwdSeen = true
							s.lastContextDir = cwd
						}
						go s.detectEnv(ctx, cwd)
					case strings.HasPrefix(p, "9001;"):
						s.w.Send(wire.StringMessage(wire.TypeExitCode, strings.TrimPrefix(p, "9001;")))
					case strings.HasPrefix(p, "9003;"):
						env := strings.TrimPrefix(p, "9003;")
						if env != "" {
							s.w.Send(wire.StringMessage(wire.TypeConda, env))
						}
					}
				}

				sendOutput(cleaned)
			} else {
				pending = append(pending, data...)
				if idx := bytes.Index(pending, []byte(termReadyMarker)); idx >= 0 {
					ready = true
					after := pending[idx+len(termReadyMarker):]
					after = bytes.TrimPrefix(after, []byte("\r\n"))
					after = bytes.TrimPrefix(after, []byte("\n"))
					sendOutput(after)
					pending = nil
				}
			}
		}
		if err != nil {
			return
		}
	}
}
