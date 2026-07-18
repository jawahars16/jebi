package session

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
)

// registry keeps live sessions alive across WebSocket disconnects so the shell
// process survives system sleep, renderer reloads, and brief network drops.
var registry = &sessionRegistry{sessions: make(map[string]*Session)}

type sessionRegistry struct {
	mu       sync.Mutex
	sessions map[string]*Session
}

func (r *sessionRegistry) add(s *Session) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[s.id] = s
}

func (r *sessionRegistry) get(id string) (*Session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.sessions[id]
	return s, ok
}

func (r *sessionRegistry) remove(id string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.sessions, id)
}

// snapshot returns a copy of the currently live sessions, safe to range over
// without holding the registry lock.
func (r *sessionRegistry) snapshot() []*Session {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]*Session, 0, len(r.sessions))
	for _, s := range r.sessions {
		out = append(out, s)
	}
	return out
}

// Reattach looks up the session by id, wires in the new connection, and returns
// the session. Returns false if no live session exists for that id.
func Reattach(id string, conn interface {
	ReadMessage() (int, []byte, error)
	WriteMessage(int, []byte) error
	Close() error
}) (*Session, bool) {
	s, ok := registry.get(id)
	if !ok {
		return nil, false
	}
	s.Reattach(conn)
	return s, true
}

func newSessionID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// outputRingBuffer is a fixed-capacity circular buffer for PTY output bytes
// captured while no WebSocket is connected. On reconnect the buffered bytes
// are replayed so the user sees what happened while the tab was disconnected.
type outputRingBuffer struct {
	mu   sync.Mutex
	buf  []byte
	cap_ int
}

func newOutputRingBuffer(capacity int) *outputRingBuffer {
	return &outputRingBuffer{cap_: capacity}
}

func (b *outputRingBuffer) write(data []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.buf = append(b.buf, data...)
	if len(b.buf) > b.cap_ {
		b.buf = b.buf[len(b.buf)-b.cap_:]
	}
}

func (b *outputRingBuffer) drain() []byte {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := b.buf
	b.buf = nil
	return out
}
