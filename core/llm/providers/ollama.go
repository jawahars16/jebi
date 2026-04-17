package providers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"terminal/core/llm"
	"terminal/core/llm/config"
)

// OllamaProvider routes queries through a running ollama instance.
type OllamaProvider struct {
	client *llm.StreamClient
	model  string
	apiURL string
}

func NewOllamaProvider(cfg config.Config) *OllamaProvider {
	return &OllamaProvider{
		client: llm.NewStreamClient(cfg.EndpointURL, cfg.Model),
		model:  cfg.Model,
		apiURL: cfg.EndpointURL,
	}
}

func (p *OllamaProvider) Name() string { return "ollama" }

// IsRunning returns true if the ollama daemon is reachable.
func (p *OllamaProvider) IsRunning() bool {
	hc := &http.Client{Timeout: 2 * time.Second}
	resp, err := hc.Get(p.apiURL + "/api/tags")
	return err == nil && resp.StatusCode == http.StatusOK
}

// IsAvailable returns true if ollama is running and the configured model is present.
func (p *OllamaProvider) IsAvailable() bool {
	_, ok := p.CheckAvailability()
	return ok
}

// CheckAvailability returns (reason, ok). When ok is false, reason explains why.
func (p *OllamaProvider) CheckAvailability() (string, bool) {
	hc := &http.Client{Timeout: 2 * time.Second}
	resp, err := hc.Get(p.apiURL + "/api/tags")
	if err != nil || resp.StatusCode != http.StatusOK {
		return "ollama is not running — start it with: ollama serve", false
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "ollama: failed to read model list", false
	}

	var result struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "ollama: unexpected response from /api/tags", false
	}

	var available []string
	for _, m := range result.Models {
		name := m.Name
		if name == p.model || name == p.model+":latest" {
			return "", true
		}
		if idx := strings.LastIndex(name, ":"); idx >= 0 && name[:idx] == p.model {
			return "", true
		}
		available = append(available, name)
	}

	if len(available) == 0 {
		return "model '" + p.model + "' not found — no models in ollama. Run: ollama pull " + p.model, false
	}
	return "model '" + p.model + "' not found in ollama. Available: " + strings.Join(available, ", ") +
		"\nSet your model in ~/.config/term/settings.json: {\"llm\":{\"model\":\"" + available[0] + "\"}}", false
}

func (p *OllamaProvider) StreamQuery(ctx context.Context, req llm.QueryRequest) (<-chan llm.ResponseChunk, error) {
	return p.client.Stream(ctx, llm.BuildMessages(req))
}
