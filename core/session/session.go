package session

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

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

const maxContextEntries = 20

// Session represents one terminal tab — one WebSocket connection, one PTY.
type Session struct {
	conn connection
	w    *wire.Wire
	cfg  Config
	ptm  *os.File  // PTY master — we read/write this
	cmd  *exec.Cmd // the shell process

	// size
	rows uint16
	cols uint16

	// cancelDetect cancels any in-flight git/node detection goroutine.
	cancelDetect context.CancelFunc

	// AI suggestion state — session-scoped, not persisted.
	provider       llm.Provider
	currentCwd     string
	contextEntries []llm.HistoryEntry
	cancelSuggest  context.CancelFunc
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
func New(conn connection, provider llm.Provider) (*Session, error) {
	s := &Session{
		conn:     conn,
		w:        wire.New(conn),
		cfg:      DefaultConfig,
		provider: provider,
	}
	shell := resolveShell(s.cfg)

	ptm, pts, err := pty.Open()
	if err != nil {
		return nil, err
	}
	s.ptm = ptm

	unix.IoctlSetWinsize(int(pts.Fd()), unix.TIOCSWINSZ, &unix.Winsize{Row: 24, Col: 40})

	cmd := exec.Command(shell)
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

// Close kills the shell process, releases the PTY, and closes the connection.
func (s *Session) Close() {
	if s.cancelDetect != nil {
		s.cancelDetect()
	}
	if s.cmd != nil && s.cmd.Process != nil {
		s.cmd.Process.Kill()
	}
	if s.ptm != nil {
		s.ptm.Close()
	}
	s.conn.Close()
}

// Start launches the pipe goroutine and blocks reading input from the frontend.
// Returns when the connection closes or a "kill" message is received.
func (s *Session) Start() {
	go s.pipe()
	for {
		msg, err := s.w.Receive()
		if err != nil {
			return
		}

		switch msg.Type {
		case wire.TypeInput:
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
			if s.provider == nil {
				break
			}
			var entry llm.HistoryEntry
			if err := json.Unmarshal(msg.Data, &entry); err != nil {
				break
			}
			s.contextEntries = append(s.contextEntries, entry)
			if len(s.contextEntries) > maxContextEntries {
				s.contextEntries = s.contextEntries[len(s.contextEntries)-maxContextEntries:]
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
				Entries: entries,
				Cwd:     cwd,
				Shell:   resolveShell(s.cfg),
				OS:      runtime.GOOS + "/" + runtime.GOARCH,
			}
			if entry.ExitCode != 0 {
				// Error path: explain what went wrong
				go func() {
					defer cancel()
					result, err := llm.Explain(ctx, s.provider, req)
					if err != nil || result == "" {
						return
					}
					data, _ := json.Marshal(result)
					s.w.Send(wire.Message{Type: wire.TypeAIExplanation, Data: data})
				}()
			} else if len(s.contextEntries) >= 2 {
				// Success path: suggest next command
				go func() {
					defer cancel()
					result, err := llm.Suggest(ctx, s.provider, req)
					if err != nil || result == "" {
						s.w.Send(wire.Message{Type: wire.TypeAISuggestError})
						return
					}
					data, _ := json.Marshal(result)
					s.w.Send(wire.Message{Type: wire.TypeAISuggestion, Data: data})
				}()
			} else {
				cancel()
			}

		case wire.TypeKill:
			return
		}
	}
}


const termReadyMarker = "__TERM_READY__"

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
						go s.detectEnv(ctx, cwd)
					case strings.HasPrefix(p, "9001;"):
						s.w.Send(wire.StringMessage(wire.TypeExitCode, strings.TrimPrefix(p, "9001;")))
					}
				}

				if len(cleaned) > 0 {
					s.w.Send(wire.StringMessage(wire.TypeOutput, string(cleaned)))
				}
			} else {
				pending = append(pending, data...)
				if idx := bytes.Index(pending, []byte(termReadyMarker)); idx >= 0 {
					ready = true
					after := pending[idx+len(termReadyMarker):]
					after = bytes.TrimPrefix(after, []byte("\r\n"))
					after = bytes.TrimPrefix(after, []byte("\n"))
					if len(after) > 0 {
						s.w.Send(wire.StringMessage(wire.TypeOutput, string(after)))
					}
					pending = nil
				}
			}
		}
		if err != nil {
			return
		}
	}
}
