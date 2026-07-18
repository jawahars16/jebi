package providers

import (
	"context"
	"os/exec"
	"testing"
	"time"

	"terminal/core/llm"
)

func TestLlamaServerProviderStopIfIdleStopsStartedProcess(t *testing.T) {
	cmd := exec.Command("sleep", "60")
	if err := cmd.Start(); err != nil {
		t.Fatalf("start sleep: %v", err)
	}

	now := time.Date(2026, 7, 12, 12, 0, 0, 0, time.UTC)
	cancelled := false
	p := &LlamaServerProvider{
		cmd:         cmd,
		started:     true,
		lastUsed:    now.Add(-6 * time.Minute),
		idleTimeout: 5 * time.Minute,
		idleCancel:  func() { cancelled = true },
		now:         func() time.Time { return now },
	}
	defer p.Stop()

	p.stopIfIdle()

	if p.started {
		t.Fatal("provider is still marked started after idle stop")
	}
	if p.cmd != nil {
		t.Fatal("provider still has cmd after idle stop")
	}
	if !cancelled {
		t.Fatal("idle watcher cancel was not called")
	}
}

func TestLlamaServerProviderStopIfIdleKeepsFreshProcess(t *testing.T) {
	cmd := exec.Command("sleep", "60")
	if err := cmd.Start(); err != nil {
		t.Fatalf("start sleep: %v", err)
	}

	now := time.Date(2026, 7, 12, 12, 0, 0, 0, time.UTC)
	p := &LlamaServerProvider{
		cmd:         cmd,
		started:     true,
		lastUsed:    now.Add(-4 * time.Minute),
		idleTimeout: 5 * time.Minute,
		now:         func() time.Time { return now },
	}
	defer p.Stop()

	p.stopIfIdle()

	if !p.started {
		t.Fatal("provider was stopped before idle timeout")
	}
	if p.cmd == nil {
		t.Fatal("provider cmd was cleared before idle timeout")
	}
}

func TestLlamaServerProviderMarkStreamUsedRefreshesLastUsed(t *testing.T) {
	times := []time.Time{
		time.Date(2026, 7, 12, 12, 0, 0, 0, time.UTC),
		time.Date(2026, 7, 12, 12, 1, 0, 0, time.UTC),
	}
	p := &LlamaServerProvider{
		now: func() time.Time {
			next := times[0]
			times = times[1:]
			return next
		},
	}

	in := make(chan llm.ResponseChunk, 1)
	out := p.markStreamUsed(context.Background(), in)

	in <- llm.ResponseChunk{Token: "hello"}
	close(in)

	<-out
	for range out {
	}

	if got, want := p.lastUsed, time.Date(2026, 7, 12, 12, 1, 0, 0, time.UTC); !got.Equal(want) {
		t.Fatalf("lastUsed = %s, want %s", got, want)
	}
}

func TestLlamaServerProviderMarkStreamUsedExitsWhenContextCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	p := &LlamaServerProvider{
		idleCheckInterval: time.Millisecond,
		now:               time.Now,
	}

	in := make(chan llm.ResponseChunk, 64)
	for i := 0; i < cap(in); i++ {
		in <- llm.ResponseChunk{Token: "token"}
	}

	out := p.markStreamUsed(ctx, in)
	deadline := time.Now().Add(time.Second)
	for len(out) < cap(out) && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if len(out) < cap(out) {
		t.Fatalf("stream wrapper did not fill output buffer; len=%d cap=%d", len(out), cap(out))
	}

	cancel()

	done := make(chan struct{})
	go func() {
		for range out {
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("stream wrapper did not exit after context cancellation")
	}
}
