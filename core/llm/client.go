package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Stream      bool          `json:"stream"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
}

type streamDelta struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

// StreamClient is the shared OpenAI-compatible streaming HTTP client used by
// all providers. Exported so providers package can use it.
type StreamClient struct {
	endpointURL string
	model       string
	httpClient  *http.Client
}

func NewStreamClient(endpointURL, model string) *StreamClient {
	transport := &http.Transport{
		DialContext: (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
	}
	return &StreamClient{
		endpointURL: endpointURL,
		model:       model,
		httpClient:  &http.Client{Transport: transport},
	}
}

// Stream sends a chat completions request and streams tokens back on the
// returned channel. Closed when the stream ends or ctx is cancelled.
func (c *StreamClient) Stream(ctx context.Context, messages []ChatMessage) (<-chan ResponseChunk, error) {
	body, err := json.Marshal(chatRequest{Model: c.model, Messages: messages, Stream: true, Temperature: 0, MaxTokens: 120})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.endpointURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("llm: request failed: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("llm: server returned %d", resp.StatusCode)
	}

	ch := make(chan ResponseChunk, 32)

	go func() {
		defer close(ch)
		defer resp.Body.Close()

		var accumulated strings.Builder
		scanner := bufio.NewScanner(resp.Body)

		for scanner.Scan() {
			select {
			case <-ctx.Done():
				return
			default:
			}

			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			payload := strings.TrimPrefix(line, "data: ")
			if payload == "[DONE]" {
				break
			}

			var delta streamDelta
			if err := json.Unmarshal([]byte(payload), &delta); err != nil || len(delta.Choices) == 0 {
				continue
			}
			token := delta.Choices[0].Delta.Content
			if token == "" {
				continue
			}

			accumulated.WriteString(token)
			select {
			case ch <- ResponseChunk{Token: token}:
			case <-ctx.Done():
				return
			}
		}

		final, err := ParseFinalResponse(accumulated.String())
		if err != nil {
			ch <- ResponseChunk{Done: true, Explanation: err.Error()}
			return
		}
		ch <- final
	}()

	return ch, nil
}
