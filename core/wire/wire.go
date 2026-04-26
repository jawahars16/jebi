package wire

import (
	"encoding/json"
	"sync"

	"github.com/gorilla/websocket"
)

// transport is the only dependency — ReadMessage and WriteMessage.
// *websocket.Conn satisfies this automatically.
type transport interface {
	ReadMessage() (messageType int, p []byte, err error)
	WriteMessage(messageType int, data []byte) error
}

// Message is the JSON envelope for all frontend ↔ backend communication.
// Data is json.RawMessage so each side decodes it into the right Go type
// based on the Type field — no map[string]interface{} surprises.
type Message struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

// StringMessage builds a Message where Data is a JSON-encoded string.
func StringMessage(msgType string, value string) Message {
	data, _ := json.Marshal(value)
	return Message{Type: msgType, Data: data}
}

// Wire sends and receives Messages over a transport.
// Send is safe to call from multiple goroutines; Receive is not.
type Wire struct {
	t  transport
	mu sync.Mutex
}

// New creates a Wire backed by t.
func New(t transport) *Wire {
	return &Wire{t: t}
}

// Send marshals msg as JSON and writes it to the transport.
func (w *Wire) Send(msg Message) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.t.WriteMessage(websocket.TextMessage, data)
}

// Receive reads the next message from the transport and unmarshals it.
func (w *Wire) Receive() (Message, error) {
	_, raw, err := w.t.ReadMessage()
	if err != nil {
		return Message{}, err
	}
	var msg Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		return Message{}, err
	}
	return msg, nil
}
