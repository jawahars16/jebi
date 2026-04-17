package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config holds LLM provider settings, persisted in settings.json.
type Config struct {
	Provider    string `json:"provider"`    // "ollama" | "llama-server"
	Model       string `json:"model"`       // ollama: model name; llama-server: full .gguf path
	EndpointURL string `json:"endpointURL"` // ollama default: "http://localhost:11434"
	Enabled     bool   `json:"enabled"`
}

var Default = Config{
	Provider:    "llama-server",
	Model:       "/Users/jawahar/Work/terminal/term/core/bin/qwen-2.5 1.5B-instruct.gguf",
	EndpointURL: "http://localhost:11434",
	Enabled:     true,
}

// SettingsPath returns ~/.config/term/settings.json.
func SettingsPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "term", "settings.json")
}

type settings struct {
	LLM *Config `json:"llm,omitempty"`
}

// Load reads the llm block from settings.json. Falls back to Default if the
// file is missing or the llm block is absent.
func Load() Config {
	data, err := os.ReadFile(SettingsPath())
	if err != nil {
		return Default
	}
	var s settings
	if err := json.Unmarshal(data, &s); err != nil || s.LLM == nil {
		return Default
	}
	cfg := *s.LLM
	if cfg.Provider == "" {
		cfg.Provider = Default.Provider
	}
	if cfg.Model == "" {
		cfg.Model = Default.Model
	}
	if cfg.EndpointURL == "" {
		cfg.EndpointURL = Default.EndpointURL
	}
	return cfg
}

// Save writes the llm block back to settings.json, preserving other top-level keys.
func Save(cfg Config) error {
	path := SettingsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	var raw map[string]json.RawMessage
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &raw)
	}
	if raw == nil {
		raw = make(map[string]json.RawMessage)
	}

	llmData, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	raw["llm"] = llmData

	out, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, out, 0o644)
}
