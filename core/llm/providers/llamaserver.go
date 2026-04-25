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

// LlamaServerProvider spawns and manages a llama-server subprocess, then
// routes queries through its OpenAI-compatible HTTP API.
type LlamaServerProvider struct {
	modelPath  string
	binaryPath string
	port       int
	cmd        *exec.Cmd
	client     *llm.StreamClient
	mu         sync.Mutex
	started    bool
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
		modelPath:  cfg.Model,
		binaryPath: bin,
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
		return "no model path configured — set llm.model to a .gguf file path in ~/.config/term/settings.json", false
	}
	if !fileExists(p.modelPath) {
		return "model file not found: " + p.modelPath + "\nDownload a .gguf model and set its path in ~/.config/term/settings.json: {\"llm\":{\"provider\":\"llama-server\",\"model\":\"/path/to/model.gguf\"}}", false
	}
	return "", true
}

// StreamQuery lazily starts the server on the first call, then streams the query.
func (p *LlamaServerProvider) StreamQuery(ctx context.Context, req llm.QueryRequest) (<-chan llm.ResponseChunk, error) {
	if err := p.ensureStarted(); err != nil {
		return nil, err
	}
	return p.client.Stream(ctx, llm.BuildMessages(req))
}

// StreamMessages lazily starts the server and streams using the provided messages directly.
func (p *LlamaServerProvider) StreamMessages(ctx context.Context, msgs []llm.ChatMessage) (<-chan llm.ResponseChunk, error) {
	if err := p.ensureStarted(); err != nil {
		return nil, err
	}
	return p.client.Stream(ctx, msgs)
}

// Stop sends SIGTERM to the subprocess and waits up to 5 seconds, then SIGKILLs.
func (p *LlamaServerProvider) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cmd == nil || p.cmd.Process == nil {
		return
	}
	p.cmd.Process.Signal(syscall.SIGTERM)
	done := make(chan struct{})
	go func() { p.cmd.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		p.cmd.Process.Kill()
	}
	p.cmd = nil
	p.started = false
}

func (p *LlamaServerProvider) ensureStarted() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.started {
		return nil
	}
	return p.start()
}

func (p *LlamaServerProvider) start() error {
	port, err := freePort()
	if err != nil {
		return fmt.Errorf("llama-server: could not find free port: %w", err)
	}
	p.port = port

	cmd := exec.Command(p.binaryPath,
		"--model", p.modelPath,
		"--port", fmt.Sprintf("%d", port),
		"--ctx-size", "2048",
		"--n-predict", "256",
	)
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("llama-server: failed to start: %w", err)
	}
	p.cmd = cmd

	baseURL := fmt.Sprintf("http://127.0.0.1:%d", port)
	if err := waitForReady(baseURL+"/health", 30*time.Second); err != nil {
		cmd.Process.Kill()
		return fmt.Errorf("llama-server: did not become ready: %w", err)
	}

	p.client = llm.NewStreamClient(baseURL, filepath.Base(p.modelPath))
	p.started = true
	return nil
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
		c1 := filepath.Join(filepath.Dir(exe), name)
		checked = append(checked, c1)
		if fileExists(c1) {
			return c1, nil
		}
		c2 := filepath.Join(filepath.Dir(exe), "..", name)
		checked = append(checked, c2)
		if abs, err := filepath.Abs(c2); err == nil && fileExists(abs) {
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
