package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"terminal/core/llm"
	"terminal/core/llm/config"
	"terminal/core/llm/providers"
	"terminal/core/session"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// resolveProvider creates the configured LLM provider without blocking startup.
// Availability is checked lazily on first use.
func resolveProvider(cfg config.Config) llm.Provider {
	if !cfg.Enabled {
		return nil
	}
	switch cfg.Provider {
	case "ollama":
		return providers.NewOllamaProvider(cfg)
	case "llama-server":
		p, err := providers.NewLlamaServerProvider(cfg)
		if err != nil {
			log.Printf("llm: %v", err)
			return nil
		}
		return p
	}
	return nil
}

func main() {
	// Resolve the LLM provider once at startup — shared across all sessions.
	// llama-server is heavy (loads model into memory), so one instance is correct.
	// The provider is not yet wired to any session feature; it is loaded here so
	// future features can access it without startup delay.
	cfg := config.Load()
	provider := resolveProvider(cfg)

	// If using llama-server, stop the subprocess cleanly on exit.
	if lsp, ok := provider.(*providers.LlamaServerProvider); ok {
		sigs := make(chan os.Signal, 1)
		signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
		go func() {
			<-sigs
			lsp.Stop()
			os.Exit(0)
		}()
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Println("new connection from", r.RemoteAddr)
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("upgrade:", err)
			return
		}

		s, err := session.New(conn, provider)
		if err != nil {
			log.Println("session:", err)
			conn.Close()
			return
		}
		defer s.Close()
		s.Start()
	})

	log.Println("core listening on :7070")
	log.Fatal(http.ListenAndServe(":7070", nil))
}
