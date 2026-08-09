package session

import (
	"encoding/json"
	"io"
	"sync"
	"testing"

	"terminal/core/wire"
)

// fakeConn is a minimal connection implementation for testing session
// cleanup without a real WebSocket.
type fakeConn struct {
	mu     sync.Mutex
	sent   []wire.Message
	closed bool
}

func (f *fakeConn) ReadMessage() (int, []byte, error) {
	return 0, nil, io.EOF
}

func (f *fakeConn) WriteMessage(_ int, data []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	var msg wire.Message
	if err := json.Unmarshal(data, &msg); err != nil {
		return err
	}
	f.sent = append(f.sent, msg)
	return nil
}

func (f *fakeConn) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
	return nil
}

func (f *fakeConn) messages() []wire.Message {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]wire.Message, len(f.sent))
	copy(out, f.sent)
	return out
}

func (f *fakeConn) isClosed() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.closed
}

// TestSendIsNilSafeWhenDetached proves the actual root cause fix: calling
// send() while no client is attached (s.w == nil, e.g. right after Detach())
// must not panic. Before this fix, several call sites in pipe() called
// s.w.Send(...) directly, which dereferences a nil *wire.Wire and crashes
// the whole process — taking every other tab down with it.
func TestSendIsNilSafeWhenDetached(t *testing.T) {
	s := &Session{id: "nil-send-test"}

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("send() panicked on nil w: %v", r)
		}
	}()
	s.send(wire.StringMessage(wire.TypeCwd, "/tmp"))
}

// TestCrashedNotifiesClientCleansUpAndIsIdempotent verifies crashed() sends
// exactly one TypeSessionDead notice, removes the session from the registry,
// closes the connection, and is safe to call more than once (a panic
// recovered twice, e.g. from two different goroutines, must not double up).
func TestCrashedNotifiesClientCleansUpAndIsIdempotent(t *testing.T) {
	conn := &fakeConn{}
	s := &Session{id: "crash-test-attached", conn: conn, w: wire.New(conn)}
	registry.add(s)

	s.crashed()

	if _, ok := registry.get(s.id); ok {
		t.Fatal("crashed() must remove the session from the registry")
	}
	msgs := conn.messages()
	if len(msgs) != 1 || msgs[0].Type != wire.TypeSessionDead {
		t.Fatalf("messages = %+v, want exactly one TypeSessionDead", msgs)
	}
	if !conn.isClosed() {
		t.Fatal("crashed() must close the connection")
	}
	if !s.dead {
		t.Fatal("crashed() must set dead = true")
	}

	// Calling again must be a no-op: no panic, no duplicate notification.
	s.crashed()
	if len(conn.messages()) != 1 {
		t.Fatal("crashed() must be idempotent — got a duplicate notification")
	}
}

// TestCrashedSafeWhileDetached verifies crashed() doesn't panic when there is
// no attached client (s.w == nil), and wakes a Start() loop blocked on
// attachCh so it doesn't leak forever waiting for a reattach that will never come.
func TestCrashedSafeWhileDetached(t *testing.T) {
	s := &Session{id: "crash-test-detached", attachCh: make(chan struct{})}
	registry.add(s)

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("crashed() panicked while detached: %v", r)
		}
	}()
	s.crashed()

	if _, ok := registry.get(s.id); ok {
		t.Fatal("crashed() must remove the session from the registry even while detached")
	}
	select {
	case <-s.attachCh:
	default:
		t.Fatal("crashed() must close attachCh so a blocked Start() loop wakes up")
	}
}

// TestRecoverGoroutineSwallowsPanic proves a panic in a background AI
// goroutine (guarded by recoverGoroutine) never escapes to crash the process,
// and — unlike a pipe() crash — leaves the session alive since a failed AI
// suggestion/banner doesn't mean the shell itself is broken.
func TestRecoverGoroutineSwallowsPanic(t *testing.T) {
	s := &Session{id: "recover-test"}
	done := make(chan struct{})

	go func() {
		defer close(done)
		defer s.recoverGoroutine("test")
		panic("boom")
	}()

	<-done // if recover didn't work, the whole test binary would crash instead.

	if s.dead {
		t.Fatal("recoverGoroutine must not mark the session dead — that's crashed()'s job")
	}
}
