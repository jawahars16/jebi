package session

import "bytes"

var tuiEnter = []byte("\x1b[?1049h")
var tuiExit = []byte("\x1b[?1049l")
var clearScreen = []byte("\x1b[2J")

func parseOSC(buf []byte) (cleaned []byte, payloads []string, leftover []byte) {
	out := make([]byte, 0, len(buf))
	i := 0
	for i < len(buf) {
		if buf[i] == 0x1b && i+1 >= len(buf) {
			return out, payloads, []byte{0x1b}
		}
		if buf[i] == 0x1b && buf[i+1] == ']' {
			i += 2
			start := i
			complete := false
			for i < len(buf) {
				if buf[i] == 0x07 {
					payloads = append(payloads, string(buf[start:i]))
					i++
					complete = true
					break
				}
				if buf[i] == 0x1b && i+1 < len(buf) && buf[i+1] == '\\' {
					payloads = append(payloads, string(buf[start:i]))
					i += 2
					complete = true
					break
				}
				i++
			}
			if !complete {
				return out, payloads, append([]byte{0x1b, ']'}, buf[start:]...)
			}
			continue
		}
		out = append(out, buf[i])
		i++
	}
	return out, payloads, nil
}

func parseVT(buf []byte) (cleaned []byte, signals []string) {
	// Detect TUI signals but do NOT strip the sequences — pass them through to xterm.
	// xterm handles alternate screen (1049h/l) natively; stripping it broke TUI exit cleanup.
	if bytes.Contains(buf, tuiEnter) {
		signals = append(signals, "tui_enter")
	}
	if bytes.Contains(buf, tuiExit) {
		signals = append(signals, "tui_exit")
	}
	// Any command that clears the full screen is a full-screen TUI app.
	if !bytes.Contains(buf, tuiEnter) && bytes.Contains(buf, clearScreen) {
		signals = append(signals, "tui_enter")
	}
	out := make([]byte, 0, len(buf))
	i := 0
	for i < len(buf) {
		if buf[i] != 0x1b {
			out = append(out, buf[i])
			i++
			continue
		}
		// ESC without a following byte — pass through.
		if i+1 >= len(buf) {
			out = append(out, buf[i])
			i++
			continue
		}
		switch buf[i+1] {
		case '=', '>', '<':
			// 2-byte ESC sequences: application keypad, normal keypad, enter ANSI mode.
			// These don't affect display; strip them.
			i += 2
		case '[':
			// CSI sequence. Need at least one more byte for the first parameter/final byte.
			if i+2 >= len(buf) {
				out = append(out, buf[i])
				i++
				continue
			}
			switch buf[i+2] {
			case '?':
				// Private mode: ESC [ ? ... — already stripped (TUI enter/exit handled above).
				i += 3
				for i < len(buf) && buf[i] >= 0x30 && buf[i] <= 0x3f {
					i++
				}
				if i < len(buf) {
					i++
				}
			case '>', '<':
				// DEC-private CSI: ESC [ > ... or ESC [ < ...
				// Covers XTMODKEYS (\x1b[>4m), Secondary DA (\x1b[>0c),
				// XTVERSION (\x1b[>0q), Kitty keyboard protocol (\x1b[<u), etc.
				// None of these affect visible display; strip them.
				i += 3
				for i < len(buf) && buf[i] >= 0x30 && buf[i] <= 0x3f {
					i++
				}
				if i < len(buf) {
					i++
				}
			default:
				// All other CSI sequences (cursor movement, SGR, erase, etc.) — pass through.
				// xterm.js needs these to render TUI output correctly.
				out = append(out, buf[i])
				i++
			}
		default:
			out = append(out, buf[i])
			i++
		}
	}
	return out, signals
}
