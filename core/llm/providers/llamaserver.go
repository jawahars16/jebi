package providers

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"

	"terminal/core/llm"
	"terminal/core/llm/config"
)

// LlamaServerIdleTimeout is how long the shared llama-server process may sit
// unused before it is stopped and later restarted lazily.
const LlamaServerIdleTimeout = 5 * time.Minute

const llamaServerIdleCheckInterval = 30 * time.Second

// LlamaServerProvider spawns and manages a llama-server subprocess, then
// routes queries through its OpenAI-compatible HTTP API.
type LlamaServerProvider struct {
	modelPath         string
	binaryPath        string
	port              int
	cmd               *exec.Cmd
	client            *llm.StreamClient
	mu                sync.Mutex
	started           bool
	lastUsed          time.Time
	idleTimeout       time.Duration
	idleCheckInterval time.Duration
	idleCancel        context.CancelFunc
	now               func() time.Time
}

// NewLlamaServerProvider validates the binary and model paths.
// The server starts lazily on the first StreamQuery call.
func NewLlamaServerProvider(cfg config.Config) (*LlamaServerProvider, error) {
	bin, err := resolveBinaryPath()
	if err != nil {
		return nil, fmt.Errorf("llama-server binary not found: %w", err)
	}
	if cfg.Model == "" {
		return nil, fmt.Errorf("llama-server: no model path configured")
	}
	return &LlamaServerProvider{
		modelPath:         cfg.Model,
		binaryPath:        bin,
		idleTimeout:       LlamaServerIdleTimeout,
		idleCheckInterval: llamaServerIdleCheckInterval,
		now:               time.Now,
	}, nil
}

func (p *LlamaServerProvider) Name() string { return "llama-server" }

// IsAvailable returns true if the binary and model file both exist on disk.
func (p *LlamaServerProvider) IsAvailable() bool {
	_, ok := p.CheckAvailability()
	return ok
}

// CheckAvailability returns (reason, ok). When ok is false, reason explains why.
func (p *LlamaServerProvider) CheckAvailability() (string, bool) {
	if !fileExists(p.binaryPath) {
		return "llama-server binary not found at: " + p.binaryPath, false
	}
	if p.modelPath == "" {
		return "no model path configured — set llm.model to a .gguf file path in ~/.config/jebi/settings.json", false
	}
	if !fileExists(p.modelPath) {
		return "model file not found: " + p.modelPath + "\nDownload a .gguf model and set its path in ~/.config/jebi/settings.json: {\"llm\":{\"provider\":\"llama-server\",\"model\":\"/path/to/model.gguf\"}}", false
	}
	return "", true
}

// StreamQuery lazily starts the server on the first call, then streams the query.
func (p *LlamaServerProvider) StreamQuery(ctx context.Context, req llm.QueryRequest) (<-chan llm.ResponseChunk, error) {
	p.markUsed()
	if err := p.ensureStarted(); err != nil {
		return nil, err
	}
	ch, err := p.client.Stream(ctx, llm.BuildMessages(req))
	if err != nil {
		return nil, err
	}
	return p.markStreamUsed(ctx, ch), nil
}

// StreamMessages lazily starts the server and streams using the provided messages directly.
func (p *LlamaServerProvider) StreamMessages(ctx context.Context, msgs []llm.ChatMessage) (<-chan llm.ResponseChunk, error) {
	p.markUsed()
	if err := p.ensureStarted(); err != nil {
		return nil, err
	}
	ch, err := p.client.Stream(ctx, msgs)
	if err != nil {
		return nil, err
	}
	return p.markStreamUsed(ctx, ch), nil
}

// Stop sends SIGTERM to the subprocess and waits up to 5 seconds, then SIGKILLs.
func (p *LlamaServerProvider) Stop() {
	p.mu.Lock()
	cmd := p.clearStartedLocked()
	p.mu.Unlock()

	stopProcess(cmd)
}

func (p *LlamaServerProvider) clearStartedLocked() *exec.Cmd {
	if p.idleCancel != nil {
		p.idleCancel()
		p.idleCancel = nil
	}
	cmd := p.cmd
	p.cmd = nil
	p.client = nil
	p.started = false
	return cmd
}

func stopProcess(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	cmd.Process.Signal(syscall.SIGTERM)
	done := make(chan struct{})
	go func() { cmd.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		cmd.Process.Kill()
	}
}

func (p *LlamaServerProvider) ensureStarted() error {
	p.mu.Lock()
	if p.started {
		p.mu.Unlock()
		return nil
	}
	waitCmd, err := p.start()
	p.mu.Unlock()

	if waitCmd != nil {
		waitCmd.Wait()
	}
	return err
}

func (p *LlamaServerProvider) start() (*exec.Cmd, error) {
	port, err := freePort()
	if err != nil {
		return nil, fmt.Errorf("llama-server: could not find free port: %w", err)
	}
	p.port = port

	cmd := exec.Command(p.binaryPath,
		"--model", p.modelPath,
		"--port", fmt.Sprintf("%d", port),
		"--ctx-size", "4096",
		"--n-predict", "512",
		"--reasoning", "off",
	)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("llama-server: failed to start: %w", err)
	}
	p.cmd = cmd

	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)
	if err := waitForReady(baseURL+"/health", 30*time.Second); err != nil {
		cmd.Process.Kill()
		p.cmd = nil
		return cmd, fmt.Errorf("llama-server: did not become ready: %w", err)
	}

	p.client = llm.NewStreamClient(baseURL, filepath.Base(p.modelPath))
	p.started = true
	p.startIdleWatcherLocked()
	return nil, nil
}

func (p *LlamaServerProvider) markUsed() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastUsed = p.currentTime()
}

func (p *LlamaServerProvider) markStreamUsed(ctx context.Context, ch <-chan llm.ResponseChunk) <-chan llm.ResponseChunk {
	out := make(chan llm.ResponseChunk, 32)
	go func() {
		defer close(out)
		completed := false
		defer func() {
			if completed {
				p.markUsed()
			}
		}()
		ticker := time.NewTicker(p.configuredIdleCheckInterval())
		defer ticker.Stop()

		for {
			select {
			case chunk, ok := <-ch:
				if !ok {
					completed = true
					return
				}
				p.markUsed()
				if !p.sendStreamChunk(ctx, ticker.C, out, chunk) {
					return
				}
			case <-ticker.C:
				p.markUsed()
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

func (p *LlamaServerProvider) sendStreamChunk(ctx context.Context, ticks <-chan time.Time, out chan<- llm.ResponseChunk, chunk llm.ResponseChunk) bool {
	for {
		select {
		case out <- chunk:
			return true
		case <-ticks:
			p.markUsed()
		case <-ctx.Done():
			return false
		}
	}
}

func (p *LlamaServerProvider) currentTime() time.Time {
	if p.now != nil {
		return p.now()
	}
	return time.Now()
}

func (p *LlamaServerProvider) configuredIdleTimeout() time.Duration {
	if p.idleTimeout > 0 {
		return p.idleTimeout
	}
	return LlamaServerIdleTimeout
}

func (p *LlamaServerProvider) configuredIdleCheckInterval() time.Duration {
	if p.idleCheckInterval > 0 {
		return p.idleCheckInterval
	}
	return llamaServerIdleCheckInterval
}

func (p *LlamaServerProvider) startIdleWatcherLocked() {
	if p.idleCancel != nil {
		p.idleCancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	p.idleCancel = cancel
	interval := p.configuredIdleCheckInterval()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				p.stopIfIdle()
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (p *LlamaServerProvider) stopIfIdle() {
	p.mu.Lock()
	if !p.started || p.cmd == nil || p.cmd.Process == nil || p.lastUsed.IsZero() {
		p.mu.Unlock()
		return
	}

	idleFor := p.currentTime().Sub(p.lastUsed)
	if idleFor <= p.configuredIdleTimeout() {
		p.mu.Unlock()
		return
	}

	cmd := p.clearStartedLocked()
	timeout := p.configuredIdleTimeout()
	p.mu.Unlock()

	stopProcess(cmd)
	log.Printf("llm: llama-server stopped after %s idle", timeout)
}

func waitForReady(healthURL string, timeout time.Duration) error {
	hc := &http.Client{Timeout: 1 * time.Second}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := hc.Get(healthURL)
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("timed out after %s", timeout)
}

func freePort() (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port, nil
}

func resolveBinaryPath() (string, error) {
	name := "llama-server"
	if runtime.GOOS == "windows" {
		name = "llama-server.exe"
	}

	var checked []string

	if resPath := os.Getenv("RESOURCES_PATH"); resPath != "" {
		c := filepath.Join(resPath, name)
		checked = append(checked, c)
		if fileExists(c) {
			return c, nil
		}
	}

	if exe, err := os.Executable(); err == nil {
		log.Printf("llm: executable path: %s", exe)
		exeDir := filepath.Dir(exe)
		// <exe_dir>/llama-server  (packaged: binary next to term-core)
		c1 := filepath.Join(exeDir, name)
		checked = append(checked, c1)
		if fileExists(c1) {
			return c1, nil
		}
		// <exe_dir>/bin/llama-server  (dev: core/bin/ layout)
		c2 := filepath.Join(exeDir, "bin", name)
		checked = append(checked, c2)
		if fileExists(c2) {
			return c2, nil
		}
		// <exe_dir>/../llama-server  (some packaged layouts)
		c3 := filepath.Join(exeDir, "..", name)
		checked = append(checked, c3)
		if abs, err := filepath.Abs(c3); err == nil && fileExists(abs) {
			return abs, nil
		}
	}

	// Dev mode: go run . executes from the source directory.
	// Check cwd/bin/ and cwd/ so the binary can live alongside term-core.
	if cwd, err := os.Getwd(); err == nil {
		c1 := filepath.Join(cwd, "bin", name)
		checked = append(checked, c1)
		if fileExists(c1) {
			return c1, nil
		}
		c2 := filepath.Join(cwd, name)
		checked = append(checked, c2)
		if fileExists(c2) {
			return c2, nil
		}
	}

	if path, err := exec.LookPath(name); err == nil {
		return path, nil
	}

	log.Printf("llm: llama-server not found, checked: %v", checked)
	return "", fmt.Errorf("%s not found in: %v", name, checked)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
