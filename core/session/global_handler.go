package session

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"terminal/core/llm"
	"terminal/core/wire"

	"github.com/gorilla/websocket"
)

var globalUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// askGlobalPayload is the frontend → backend body for both ask_global and
// ask_suggest (Query is empty for ask_suggest).
type askGlobalPayload struct {
	History  []llm.ChatMessage   `json:"history"`
	Query    string              `json:"query"`
	Sessions []globalSessionInfo `json:"sessions"`
}

// GlobalHandler serves the /global WebSocket route — cross-session AI
// features (ask_global, ask_suggest) that are not tied to any one PTY session.
func GlobalHandler(provider llm.Provider) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := globalUpgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("global upgrade:", err)
			return
		}
		defer conn.Close()

		wr := wire.New(conn)
		var mu sync.Mutex
		var cancelAsk context.CancelFunc

		for {
			msg, err := wr.Receive()
			if err != nil {
				mu.Lock()
				if cancelAsk != nil {
					cancelAsk()
				}
				mu.Unlock()
				return
			}

			switch msg.Type {
			case wire.TypeAskSuggest:
				var payload askGlobalPayload
				if err := json.Unmarshal(msg.Data, &payload); err != nil {
					continue
				}
				infoByID := infoByIDMap(payload.Sessions)
				activeID := activeSessionID(payload.Sessions)
				prompts := suggestGlobalPrompts(registry.snapshot(), infoByID, activeID)
				data, _ := json.Marshal(prompts)
				wr.Send(wire.Message{Type: wire.TypeAskSuggestResult, Data: data})

			case wire.TypeAskGlobal:
				var payload askGlobalPayload
				if err := json.Unmarshal(msg.Data, &payload); err != nil || provider == nil || !provider.IsAvailable() {
					wr.Send(wire.StringMessage(wire.TypeAskError, "AI not available"))
					continue
				}
				mu.Lock()
				if cancelAsk != nil {
					cancelAsk()
				}
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				cancelAsk = cancel
				mu.Unlock()

				infoByID := infoByIDMap(payload.Sessions)
				messages := buildGlobalAskMessages(registry.snapshot(), infoByID, payload.History, payload.Query)

				go func() {
					defer cancel()
					err := llm.AskStream(ctx, provider, messages,
						func(token string) {
							data, _ := json.Marshal(token)
							wr.Send(wire.Message{Type: wire.TypeAskChunk, Data: data})
						},
						func(_ string) {
							wr.Send(wire.Message{Type: wire.TypeAskDone})
						},
					)
					if err != nil && ctx.Err() == nil {
						wr.Send(wire.StringMessage(wire.TypeAskError, err.Error()))
					}
				}()

			case wire.TypeKill:
				return
			}
		}
	}
}

func infoByIDMap(infos []globalSessionInfo) map[string]globalSessionInfo {
	m := make(map[string]globalSessionInfo, len(infos))
	for _, info := range infos {
		m[info.ID] = info
	}
	return m
}

func activeSessionID(infos []globalSessionInfo) string {
	for _, info := range infos {
		if info.Active {
			return info.ID
		}
	}
	return ""
}
