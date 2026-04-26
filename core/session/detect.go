package session

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"terminal/core/llm"
	"terminal/core/wire"
)

// detectTimeout is the total budget for one round of environment detection.
const detectTimeout = 5 * time.Second

// detector pairs a wire message type with a probe function.
// The probe receives the current working directory and returns a non-empty
// pipe-delimited payload when the tool is detected, or "" to send nothing.
type detector struct {
	msgType string
	probe   func(ctx context.Context, dir string) string
}

// detectors is the registry of all environment probes run on every cwd change.
// Each probe runs concurrently; order does not matter.
//
// To add a new language or tool:
//  1. Write a detectX(ctx, dir) string function below.
//  2. Add its wire type to core/wire/types.go and app/src/renderer/src/wire.js.
//  3. Append a detector{wire.TypeX, detectX} entry here.
var detectors = []detector{
	{wire.TypeGit, detectGit},
	{wire.TypeNode, detectNode},
	{wire.TypeGo, detectGo},
	{wire.TypePython, detectPython},
	{wire.TypeDocker, detectDocker},
	{wire.TypeK8s, detectK8s},
}

// detectEnv runs all registered detectors concurrently for dir, sends each
// non-empty result to the frontend immediately, then triggers an AI project
// context summary once all detectors complete.
func (s *Session) detectEnv(ctx context.Context, dir string) {
	type result struct {
		msgType string
		data    string
	}

	ch := make(chan result, len(detectors))
	var wg sync.WaitGroup
	for _, d := range detectors {
		d := d
		wg.Add(1)
		go func() {
			defer wg.Done()
			ch <- result{d.msgType, d.probe(ctx, dir)}
		}()
	}

	// Collect results and send to frontend immediately.
	info := llm.ProjectInfo{Dir: dir}
	go func() {
		wg.Wait()
		close(ch)
	}()
	for r := range ch {
		if r.data != "" {
			s.w.Send(wire.StringMessage(r.msgType, r.data))
		}
		switch r.msgType {
		case wire.TypeGit:
			info.Git = r.data
		case wire.TypeNode:
			info.Node = r.data
		case wire.TypeGo:
			info.Go = r.data
		case wire.TypePython:
			info.Python = r.data
		case wire.TypeDocker:
			info.Docker = r.data
		case wire.TypeK8s:
			info.K8s = r.data
		}
	}

	if ctx.Err() != nil || s.provider == nil || dir == s.lastContextDir {
		return
	}
	s.lastContextDir = dir
	// Strip walk-up detections that don't belong to the current directory.
	// Node and Python use findUp so they may reflect a parent project — only
	// include them if their marker files exist directly in dir.
	if !existsAny(dir, []string{"package.json"}) {
		info.Node = ""
	}
	if !existsAny(dir, pythonMarkers) {
		info.Python = ""
	}
	s.sendProjectContext(ctx, info)
}

// sendProjectContext streams a one-sentence AI project summary as an info banner.
func (s *Session) sendProjectContext(ctx context.Context, info llm.ProjectInfo) {
	// Skip bare directories with no detected project signals.
	if info.Git == "" && info.Node == "" && info.Go == "" && info.Python == "" && info.Docker == "" && info.K8s == "" {
		return
	}

	msgs := llm.BuildProjectContextMessages(info)
	ch, err := s.provider.StreamMessages(ctx, msgs)
	if err != nil {
		return
	}

	started := false
	for chunk := range ch {
		if chunk.Token == "" {
			continue
		}
		if !started {
			startData, _ := json.Marshal(map[string]string{"type": "info"})
			s.w.Send(wire.Message{Type: wire.TypeAIBannerStart, Data: startData})
			started = true
		}
		data, _ := json.Marshal(chunk.Token)
		s.w.Send(wire.Message{Type: wire.TypeAIBannerToken, Data: data})
	}
	// If context was cancelled mid-stream, clear any partial banner.
	if started && ctx.Err() != nil {
		s.w.Send(wire.Message{Type: wire.TypeAIBannerCancel})
	}
}

// newDetectContext returns a context capped at detectTimeout.
// The caller is responsible for calling the returned cancel.
func newDetectContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), detectTimeout)
}

// ── Git ──────────────────────────────────────────────────────────────────────

// detectGit returns "branch|dirty|ahead|behind", or "" when dir is not a git repo.
func detectGit(ctx context.Context, dir string) string {
	branch := git(ctx, dir, "symbolic-ref", "--short", "HEAD")
	if branch == "" {
		branch = git(ctx, dir, "rev-parse", "--short", "HEAD")
	}
	if branch == "" {
		return ""
	}

	dirty := "0"
	if git(ctx, dir, "status", "--porcelain") != "" {
		dirty = "1"
	}

	ahead := git(ctx, dir, "rev-list", "--count", "@{u}..HEAD")
	if ahead == "" {
		ahead = "0"
	}
	behind := git(ctx, dir, "rev-list", "--count", "HEAD..@{u}")
	if behind == "" {
		behind = "0"
	}

	return fmt.Sprintf("%s|%s|%s|%s", branch, dirty, ahead, behind)
}

// git runs a git -C <dir> command and returns trimmed stdout, or "".
func git(ctx context.Context, dir string, args ...string) string {
	return cmd(ctx, "git", append([]string{"-C", dir}, args...)...)
}

// ── Node ─────────────────────────────────────────────────────────────────────

// detectNode returns "version|packageManager" when dir is inside a Node project,
// or "" when no package.json is found or node is not installed / times out.
func detectNode(ctx context.Context, dir string) string {
	pkgDir := findUp(dir, "package.json")
	if pkgDir == "" {
		return ""
	}

	pm := lockFilePM(pkgDir)

	// Use a tighter budget for node --version: version managers (nvm, volta, fnm)
	// install shims that can stall. Two seconds is generous for a version lookup.
	nodeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	ver := cmd(nodeCtx, "node", "--version")
	if ver == "" {
		return ""
	}

	return fmt.Sprintf("%s|%s", ver, pm)
}

// -- Go ───────────────────────────────────────────────────────────────────────

// detectGo returns "version" when dir is inside a Go module, or "" when no go.mod
// is found or go is not installed / times out.
func detectGo(ctx context.Context, dir string) string {
	modDir := findUp(dir, "go.mod")
	if modDir == "" {
		return ""
	}

	ver := cmd(ctx, "go", "version")
	if ver == "" {
		return ""
	}

	// go version output looks like: "go version go1.18.3 darwin/amd64"
	parts := strings.Fields(ver)
	if len(parts) < 3 {
		return ""
	}
	return parts[2]
}

// ── Python ───────────────────────────────────────────────────────────────────

// pythonMarkers lists the filenames that mark a directory as a Python project.
// Walk-up stops at the nearest ancestor containing any of these.
var pythonMarkers = []string{
	"pyproject.toml",
	"requirements.txt",
	"setup.py",
	"setup.cfg",
	"Pipfile",
}

// detectPython returns "version|venv" when dir is inside a Python project, or ""
// when no marker is found or python is not installed / times out.
// venv is the basename of $VIRTUAL_ENV when set, otherwise "".
func detectPython(ctx context.Context, dir string) string {
	if findUpAny(dir, pythonMarkers) == "" {
		return ""
	}

	pyCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	// Prefer python3 — on most systems `python` is python 2 or missing entirely.
	ver := cmd(pyCtx, "python3", "--version")
	if ver == "" {
		ver = cmd(pyCtx, "python", "--version")
	}
	if ver == "" {
		return ""
	}
	// "Python 3.11.6" → "3.11.6"
	parts := strings.Fields(ver)
	if len(parts) >= 2 {
		ver = parts[1]
	}

	venv := ""
	if v := os.Getenv("VIRTUAL_ENV"); v != "" {
		venv = filepath.Base(v)
	}

	return fmt.Sprintf("%s|%s", ver, venv)
}

// ── Docker ───────────────────────────────────────────────────────────────────

// dockerMarkers lists filenames that mark a directory as a Docker project.
// Unlike Python/Node, Docker files don't have walk-up semantics — they usually
// live exactly in the directory where you want to run them. Check only `dir`.
var dockerMarkers = []struct {
	file string
	kind string
}{
	{"docker-compose.yml", "compose"},
	{"docker-compose.yaml", "compose"},
	{"compose.yml", "compose"},
	{"compose.yaml", "compose"},
	{"Dockerfile", "dockerfile"},
}

// detectDocker returns "kind" ("compose" or "dockerfile") when dir contains a
// Docker marker file, or "" otherwise. Presence is enough — we don't call out
// to the docker daemon (slow, noisy when it's not running).
func detectDocker(ctx context.Context, dir string) string {
	for _, m := range dockerMarkers {
		if exists(filepath.Join(dir, m.file)) {
			return m.kind
		}
	}
	return ""
}

// ── Kubernetes ───────────────────────────────────────────────────────────────

// k8sMarkers lists file / directory names that mark a directory as a k8s
// project. We walk up so `apps/foo/Chart.yaml` surfaces from any subdir.
var k8sMarkers = []string{
	"kustomization.yaml",
	"kustomization.yml",
	"Chart.yaml",
	"skaffold.yaml",
}

// k8sDirMarkers are directory names (not files) that indicate a k8s project.
var k8sDirMarkers = []string{
	"k8s",
	"kubernetes",
	"helm",
	"manifests",
}

// detectK8s returns "context|namespace" when dir is inside a k8s project and
// kubectl is available, or "" otherwise. namespace is "default" when unset.
func detectK8s(ctx context.Context, dir string) string {
	if findUpAny(dir, k8sMarkers) == "" && findUpAnyDir(dir, k8sDirMarkers) == "" {
		return ""
	}

	kubeCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	kctx := cmd(kubeCtx, "kubectl", "config", "current-context")
	if kctx == "" {
		return ""
	}

	ns := cmd(kubeCtx, "kubectl", "config", "view", "--minify", "-o", "jsonpath={..namespace}")
	if ns == "" {
		ns = "default"
	}

	return fmt.Sprintf("%s|%s", kctx, ns)
}

// lockFilePM detects the package manager from lock files in dir.
func lockFilePM(dir string) string {
	for _, lf := range []struct{ file, name string }{
		{"bun.lockb", "bun"},
		{"bun.lock", "bun"},
		{"pnpm-lock.yaml", "pnpm"},
		{"yarn.lock", "yarn"},
	} {
		if exists(filepath.Join(dir, lf.file)) {
			return lf.name
		}
	}
	return "npm"
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// findUp walks up from dir looking for a directory that contains filename.
// Returns the matching directory, or "" if the filesystem root is reached.
func findUp(dir, filename string) string {
	for {
		if exists(filepath.Join(dir, filename)) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// findUpAny walks up from dir looking for a directory that contains any of filenames.
// Returns the matching directory, or "" if the filesystem root is reached.
func findUpAny(dir string, filenames []string) string {
	for {
		for _, f := range filenames {
			if exists(filepath.Join(dir, f)) {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// findUpAnyDir walks up from dir looking for a directory that contains any of
// the named subdirectories. Returns the matching parent, or "".
func findUpAnyDir(dir string, dirnames []string) string {
	for {
		for _, d := range dirnames {
			p := filepath.Join(dir, d)
			if info, err := os.Stat(p); err == nil && info.IsDir() {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// exists reports whether path exists on the filesystem.
func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// existsAny reports whether dir directly contains any of the named files.
func existsAny(dir string, names []string) bool {
	for _, name := range names {
		if exists(filepath.Join(dir, name)) {
			return true
		}
	}
	return false
}

// cmd runs name with args, inheriting the current environment, and returns
// trimmed stdout. Returns "" on any error (not found, non-zero exit, timeout).
func cmd(ctx context.Context, name string, args ...string) string {
	out, err := exec.CommandContext(ctx, name, args...).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
