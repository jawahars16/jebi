package session

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

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

// detectEnv runs all registered detectors concurrently for dir and sends each
// non-empty result to the frontend. ctx is cancelled by the caller when the user
// changes directory, stopping any stale detections immediately.
func (s *Session) detectEnv(ctx context.Context, dir string) {
	type result struct {
		msgType string
		data    string
	}

	ch := make(chan result, len(detectors))
	for _, d := range detectors {
		d := d
		go func() { ch <- result{d.msgType, d.probe(ctx, dir)} }()
	}

	for range detectors {
		if r := <-ch; r.data != "" {
			s.w.Send(wire.StringMessage(r.msgType, r.data))
		}
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

// cmd runs name with args, inheriting the current environment, and returns
// trimmed stdout. Returns "" on any error (not found, non-zero exit, timeout).
func cmd(ctx context.Context, name string, args ...string) string {
	out, err := exec.CommandContext(ctx, name, args...).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
